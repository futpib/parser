import { type Unparser } from './unparser.js';
import { type DalvikExecutable, type DalvikExecutableClassDefinition, type DalvikExecutableCode, type DalvikExecutableDebugInfo, type DalvikExecutableAnnotation, type DalvikExecutableEncodedValue } from './dalvikExecutable.js';
import { type DalvikBytecodeOperation } from './dalvikBytecodeParser/addressConversion.js';
import { uintUnparser, ushortUnparser } from './dalvikBytecodeUnparser/formatUnparsers.js';
import { createPoolBuilders } from './dalvikExecutableUnparser/poolBuilders.js';
import { scanForPoolReferences } from './dalvikExecutableUnparser/poolScanners.js';
import { createSectionUnparsers } from './dalvikExecutableUnparser/sectionUnparsers.js';
import { createAnnotationUnparsers } from './dalvikExecutableUnparser/annotationUnparsers.js';
import { alignmentUnparser, calculateAdler32, calculateSHA1 } from './dalvikExecutableUnparser/utils.js';
import { uint8ArrayAsyncIterableToUint8Array } from './uint8Array.js';
import { runUnparser } from './unparser.js';
import { uint8ArrayUnparserOutputCompanion } from './unparserOutputCompanion.js';
import { WriteLater } from './unparserContext.js';

async function* yieldAndCapture<T>(gen: AsyncIterable<T, T>): AsyncIterable<T, T> {
	let value: T | undefined;
	for await (value of gen) {
		yield value;
	}

	return value!;
}

/**
 * Helper function to write a pool size and reserve space for its offset.
 * Returns a WriteLater for the offset.
 */
async function* writePoolHeader(
	size: number,
	unparserContext: Parameters<Unparser<any, Uint8Array>>[1],
) {
	yield * uintUnparser(size, unparserContext);
	const offsetWriteLater = yield * yieldAndCapture(unparserContext.writeLater(4));
	return offsetWriteLater;
}

/**
 * Helper function to conditionally write an offset placeholder.
 * Returns WriteLater if condition is true, otherwise writes 0 and returns undefined.
 */
async function* writeConditionalOffset(
	condition: boolean,
	unparserContext: Parameters<Unparser<any, Uint8Array>>[1],
) {
	if (condition) {
		const offsetWriteLater = yield * yieldAndCapture(unparserContext.writeLater(4));
		return offsetWriteLater;
	} else {
		yield * uintUnparser(0, unparserContext);
		return undefined;
	}
}

/**
 * Helper class to track offset and count for a section of items.
 * Records the offset of the first item and counts items as they are written.
 */
class SectionTracker {
	private _offset = 0;
	private _count = 0;

	recordItem(position: number): void {
		if (this._count === 0) {
			this._offset = position;
		}

		this._count++;
	}

	get offset(): number {
		return this._offset;
	}

	get count(): number {
		return this._count;
	}
}

export const dalvikExecutableUnparser: Unparser<DalvikExecutable<DalvikBytecodeOperation[]>, Uint8Array> = async function * (input, unparserContext) {
	const poolBuilders = createPoolBuilders();

	scanForPoolReferences(input, poolBuilders);

	const sectionUnparsers = createSectionUnparsers(poolBuilders);
	const annotationUnparsers = createAnnotationUnparsers(
		sectionUnparsers.getStringIndex,
		sectionUnparsers.getTypeIndex,
		sectionUnparsers.getFieldIndex,
		sectionUnparsers.getMethodIndex,
		sectionUnparsers.encodedValueUnparser,
	);

	const { stringPool, typePool, protoPool, fieldPool, methodPool } = poolBuilders;

	const magicBytes = new Uint8Array([ 0x64, 0x65, 0x78, 0x0A ]);
	yield magicBytes;

	const versionBytes = new Uint8Array([ 0x30, 0x33, 0x35, 0x00 ]);
	yield versionBytes;

	const checksumWriteLater = yield * yieldAndCapture(unparserContext.writeLater(4));
	const sha1WriteLater = yield * yieldAndCapture(unparserContext.writeLater(20));
	const fileSizeWriteLater = yield * yieldAndCapture(unparserContext.writeLater(4));

	yield * uintUnparser(0x70, unparserContext);

	yield * uintUnparser(0x12345678, unparserContext);

	const linkData = input.link;
	const hasLink = !!(linkData && linkData.length > 0);
	if (hasLink) {
		yield * uintUnparser(linkData.length, unparserContext);
	} else {
		yield * uintUnparser(0, unparserContext);
	}
	const linkOffsetWriteLater = yield * writeConditionalOffset(hasLink, unparserContext);

	const mapOffsetWriteLater = yield * yieldAndCapture(unparserContext.writeLater(4));

	const stringIdsOffsetWriteLater = yield * writePoolHeader(stringPool.size(), unparserContext);
	const typeIdsOffsetWriteLater = yield * writePoolHeader(typePool.size(), unparserContext);
	const protoIdsOffsetWriteLater = yield * writePoolHeader(protoPool.size(), unparserContext);
	const fieldIdsOffsetWriteLater = yield * writePoolHeader(fieldPool.size(), unparserContext);
	const methodIdsOffsetWriteLater = yield * writePoolHeader(methodPool.size(), unparserContext);
	const classDefsOffsetWriteLater = yield * writePoolHeader(input.classDefinitions.length, unparserContext);

	const dataOffsetWriteLater = yield * yieldAndCapture(unparserContext.writeLater(4));
	const dataSizeWriteLater = yield * yieldAndCapture(unparserContext.writeLater(4));

	const stringIdsOffset = unparserContext.position;
	yield * unparserContext.writeEarlier(stringIdsOffsetWriteLater, uintUnparser, stringIdsOffset);

	const stringDataOffsetWriteLaters: Array<WriteLater<Uint8Array, number>> = [];
	for (let i = 0; i < stringPool.size(); i++) {
		const offsetWriteLater = yield * yieldAndCapture(unparserContext.writeLater(4));
		stringDataOffsetWriteLaters.push(offsetWriteLater);
	}

	const typeIdsOffset = unparserContext.position;
	yield * unparserContext.writeEarlier(typeIdsOffsetWriteLater, uintUnparser, typeIdsOffset);

	for (const type of typePool.getTypes()) {
		const stringIndex = sectionUnparsers.getStringIndex(type);
		yield * uintUnparser(stringIndex, unparserContext);
	}

	const protoIdsOffset = unparserContext.position;
	yield * unparserContext.writeEarlier(protoIdsOffsetWriteLater, uintUnparser, protoIdsOffset);

	const protoParameterListOffsetWriteLaters: Array<WriteLater<Uint8Array, number> | null> = [];
	for (const proto of protoPool.getProtos()) {
		const shortyIndex = sectionUnparsers.getStringIndex(proto.shorty);
		const returnTypeIndex = sectionUnparsers.getTypeIndex(proto.returnType);

		yield * uintUnparser(shortyIndex, unparserContext);
		yield * uintUnparser(returnTypeIndex, unparserContext);

		if (proto.parameters.length > 0) {
			const offsetWriteLater = yield * yieldAndCapture(unparserContext.writeLater(4));
			protoParameterListOffsetWriteLaters.push(offsetWriteLater);
		} else {
			protoParameterListOffsetWriteLaters.push(null);
			yield * uintUnparser(0, unparserContext);
		}
	}

	const fieldIdsOffset = unparserContext.position;
	yield * unparserContext.writeEarlier(fieldIdsOffsetWriteLater, uintUnparser, fieldIdsOffset);

	for (const field of fieldPool.getFields()) {
		yield * sectionUnparsers.fieldIdUnparser(field, unparserContext);
	}

	const methodIdsOffset = unparserContext.position;
	yield * unparserContext.writeEarlier(methodIdsOffsetWriteLater, uintUnparser, methodIdsOffset);

	for (const method of methodPool.getMethods()) {
		yield * sectionUnparsers.methodIdUnparser(method, unparserContext);
	}

	const classDefsOffset = unparserContext.position;
	yield * unparserContext.writeEarlier(classDefsOffsetWriteLater, uintUnparser, classDefsOffset);

	const classDefItems: Array<{
		interfacesOffsetWriteLater?: WriteLater<Uint8Array, number>;
		annotationsOffsetWriteLater?: WriteLater<Uint8Array, number>;
		classDataOffsetWriteLater?: WriteLater<Uint8Array, number>;
		staticValuesOffsetWriteLater?: WriteLater<Uint8Array, number>;
	}> = [];

	for (const classDef of input.classDefinitions) {
		const classTypeIndex = sectionUnparsers.getTypeIndex(classDef.class);
		const accessFlags = sectionUnparsers.accessFlagsToNumber(classDef.accessFlags);
		const superclassTypeIndex = sectionUnparsers.getTypeIndex(classDef.superclass);

		yield * uintUnparser(classTypeIndex, unparserContext);
		yield * uintUnparser(accessFlags, unparserContext);
		yield * uintUnparser(superclassTypeIndex, unparserContext);

		const interfacesOffsetWriteLater = yield * writeConditionalOffset(
			classDef.interfaces.length > 0,
			unparserContext,
		);

		const sourceFileIndex = classDef.sourceFile ? sectionUnparsers.getStringIndex(classDef.sourceFile) : 0xFFFFFFFF;
		yield * uintUnparser(sourceFileIndex, unparserContext);

		const annotationsOffsetWriteLater = yield * writeConditionalOffset(
			!!classDef.annotations,
			unparserContext,
		);

		const hasClassData = !!(classDef.classData && (
			classDef.classData.staticFields.length > 0 ||
			classDef.classData.instanceFields.length > 0 ||
			classDef.classData.directMethods.length > 0 ||
			classDef.classData.virtualMethods.length > 0
		));
		const classDataOffsetWriteLater = yield * writeConditionalOffset(
			hasClassData,
			unparserContext,
		);

		const staticValuesOffsetWriteLater = yield * writeConditionalOffset(
			classDef.staticValues.length > 0,
			unparserContext,
		);

		classDefItems.push({
			interfacesOffsetWriteLater,
			annotationsOffsetWriteLater,
			classDataOffsetWriteLater,
			staticValuesOffsetWriteLater,
		});
	}

	const dataOffset = unparserContext.position;
	yield * unparserContext.writeEarlier(dataOffsetWriteLater, uintUnparser, dataOffset);

	for (let i = 0; i < stringPool.size(); i++) {
		const stringDataOffset = unparserContext.position;
		yield * unparserContext.writeEarlier(stringDataOffsetWriteLaters[i], uintUnparser, stringDataOffset);
		yield * sectionUnparsers.stringDataUnparser(stringPool.getStrings()[i], unparserContext);
	}

	const typeListItemsTracker = new SectionTracker();

	for (let i = 0; i < protoPool.size(); i++) {
		const proto = protoPool.getProtos()[i];
		if (proto.parameters.length > 0) {
			yield * alignmentUnparser(4)(undefined, unparserContext);
			typeListItemsTracker.recordItem(unparserContext.position);

			const paramListOffset = unparserContext.position;
			const writeLater = protoParameterListOffsetWriteLaters[i];
			if (writeLater) {
				yield * unparserContext.writeEarlier(writeLater, uintUnparser, paramListOffset);
			}
			yield * sectionUnparsers.typeListUnparser(proto.parameters, unparserContext);
		}
	}

	// Track classDataItem, codeItem, and debugInfoItem for later writing
	// Collect data to write items grouped by type (required by DEX format)
	const classDataToWrite: Array<{
		classDef: DalvikExecutableClassDefinition<DalvikBytecodeOperation[]>;
		classDefItem: {
			interfacesOffsetWriteLater?: WriteLater<Uint8Array, number>;
			annotationsOffsetWriteLater?: WriteLater<Uint8Array, number>;
			classDataOffsetWriteLater?: WriteLater<Uint8Array, number>;
			staticValuesOffsetWriteLater?: WriteLater<Uint8Array, number>;
		};
		classIdx: number;
	}> = [];
	const codeToWrite: Array<{ code: DalvikExecutableCode<DalvikBytecodeOperation[]> }> = [];
	const debugInfoToWrite: Array<{ debugInfo: DalvikExecutableDebugInfo; offsetWriteLater: WriteLater<Uint8Array, number> }> = [];

	// First pass: collect type lists, encoded arrays, and classData/code/debugInfo to write
	const encodedArrayItemsTracker = new SectionTracker();

	type TypeListToWrite = {
		interfaces: string[];
		offsetWriteLater: WriteLater<Uint8Array, number>;
	};
	const typeListsToWrite: TypeListToWrite[] = [];

	type EncodedArrayToWrite = {
		staticValues: DalvikExecutableEncodedValue[];
		offsetWriteLater: WriteLater<Uint8Array, number>;
	};
	const encodedArraysToWrite: EncodedArrayToWrite[] = [];

	for (let classIdx = 0; classIdx < input.classDefinitions.length; classIdx++) {
		const classDef = input.classDefinitions[classIdx];
		const classDefItem = classDefItems[classIdx];

		if (classDef.interfaces.length > 0 && classDefItem.interfacesOffsetWriteLater) {
			typeListsToWrite.push({
				interfaces: classDef.interfaces,
				offsetWriteLater: classDefItem.interfacesOffsetWriteLater,
			});
		}

		if (classDef.staticValues.length > 0 && classDefItem.staticValuesOffsetWriteLater) {
			encodedArraysToWrite.push({
				staticValues: classDef.staticValues,
				offsetWriteLater: classDefItem.staticValuesOffsetWriteLater,
			});
		}

		if (classDef.classData && classDefItem.classDataOffsetWriteLater) {
			classDataToWrite.push({ classDef, classDefItem, classIdx });
			// Collect code items from this class
			const allMethods = [ ...classDef.classData.directMethods, ...classDef.classData.virtualMethods ];
			for (const method of allMethods) {
				if (method.code) {
					codeToWrite.push({ code: method.code });
				}
			}
		}
	}

	// Second pass: write all type lists (interfaces)
	for (const typeList of typeListsToWrite) {
		yield * alignmentUnparser(4)(undefined, unparserContext);
		typeListItemsTracker.recordItem(unparserContext.position);

		const typeListOffset = unparserContext.position;
		yield * unparserContext.writeEarlier(typeList.offsetWriteLater, uintUnparser, typeListOffset);
		yield * sectionUnparsers.typeListUnparser(typeList.interfaces, unparserContext);
	}

	// Third pass: write all encoded arrays (static values)
	for (const encodedArray of encodedArraysToWrite) {
		encodedArrayItemsTracker.recordItem(unparserContext.position);

		const encodedArrayOffset = unparserContext.position;
		yield * unparserContext.writeEarlier(encodedArray.offsetWriteLater, uintUnparser, encodedArrayOffset);
		yield * sectionUnparsers.encodedArrayUnparser(encodedArray.staticValues, unparserContext);
	}

	// Fourth pass: write all code items (grouped) and build offset map
	const codeItemsTracker = new SectionTracker();
	const codeOffsetMap = new Map();

	for (const { code } of codeToWrite) {
		yield * alignmentUnparser(4)(undefined, unparserContext);
		codeItemsTracker.recordItem(unparserContext.position);

		const codeOffset = unparserContext.position;
		codeOffsetMap.set(code, codeOffset);

		let debugInfoOffsetWriteLater;
		yield * sectionUnparsers.codeItemUnparser(result => {
			debugInfoOffsetWriteLater = result.debugInfoOffsetWriteLater;
		})(code, unparserContext);

		if (code.debugInfo && debugInfoOffsetWriteLater) {
			debugInfoToWrite.push({ debugInfo: code.debugInfo, offsetWriteLater: debugInfoOffsetWriteLater });
		}
	}

	// Fifth pass: write all classData items (grouped) using the offset map
	const classDataItemsTracker = new SectionTracker();

	for (const { classDef, classDefItem } of classDataToWrite) {
		classDataItemsTracker.recordItem(unparserContext.position);

		const classDataOffset = unparserContext.position;
		if (classDefItem.classDataOffsetWriteLater && classDef.classData) {
			yield * unparserContext.writeEarlier(classDefItem.classDataOffsetWriteLater, uintUnparser, classDataOffset);

			yield * sectionUnparsers.classDataUnparser(codeOffsetMap)(classDef.classData, unparserContext);
		}
	}

	// Sixth pass: write all debugInfo items (grouped)
	const debugInfoItemsTracker = new SectionTracker();

	for (const { debugInfo, offsetWriteLater } of debugInfoToWrite) {
		debugInfoItemsTracker.recordItem(unparserContext.position);

		const debugInfoOffset = unparserContext.position;
		yield * unparserContext.writeEarlier(offsetWriteLater, uintUnparser, debugInfoOffset);
		yield * sectionUnparsers.debugInfoUnparser(debugInfo, unparserContext);
	}

	// Seventh pass: write annotations
	const annotationsDirectoryItemsTracker = new SectionTracker();
	const annotationSetItemsTracker = new SectionTracker();
	const annotationSetRefListItemsTracker = new SectionTracker();
	const annotationItemsTracker = new SectionTracker();

	// Collect annotation sets and items to write later
	type AnnotationSetToWrite = {
		annotations: DalvikExecutableAnnotation[];
		setOffsetWriteLater: WriteLater<Uint8Array, number>;
		itemOffsetWriteLaters: Array<WriteLater<Uint8Array, number>>;
	};
	const annotationSetsToWrite: AnnotationSetToWrite[] = [];

	// Collect annotation set ref lists to write later
	type AnnotationSetRefListToWrite = {
		parameterAnnotations: DalvikExecutableAnnotation[][];
		refListOffsetWriteLater: WriteLater<Uint8Array, number>;
		setOffsetWriteLaters: Array<WriteLater<Uint8Array, number> | null>;
	};
	const annotationSetRefListsToWrite: AnnotationSetRefListToWrite[] = [];

	// First sub-pass: write annotation directories and ref lists, collect sets/items
	for (let classIdx = 0; classIdx < input.classDefinitions.length; classIdx++) {
		const classDef = input.classDefinitions[classIdx];
		const classDefItem = classDefItems[classIdx];

		if (classDef.annotations && classDefItem.annotationsOffsetWriteLater) {
			yield * alignmentUnparser(4)(undefined, unparserContext);
			annotationsDirectoryItemsTracker.recordItem(unparserContext.position);

			const annotationsOffset = unparserContext.position;
			yield * unparserContext.writeEarlier(classDefItem.annotationsOffsetWriteLater, uintUnparser, annotationsOffset);

			const annotationOffsetWriteLaters: {
				classAnnotationsOffsetWriteLater?: WriteLater<Uint8Array, number>;
				fieldAnnotationsOffsetWriteLaters?: Array<WriteLater<Uint8Array, number> | null>;
				methodAnnotationsOffsetWriteLaters?: Array<WriteLater<Uint8Array, number>>;
				parameterAnnotationsOffsetWriteLaters?: Array<WriteLater<Uint8Array, number>>;
			} = {};
			yield * annotationUnparsers.annotationsDirectoryItemUnparser(annotationOffsetWriteLaters)(classDef.annotations, unparserContext);

			if (classDef.annotations.classAnnotations.length > 0 && annotationOffsetWriteLaters.classAnnotationsOffsetWriteLater) {
				annotationSetsToWrite.push({
					annotations: classDef.annotations.classAnnotations,
					setOffsetWriteLater: annotationOffsetWriteLaters.classAnnotationsOffsetWriteLater,
					itemOffsetWriteLaters: [],
				});
			}

			for (let i = 0; i < classDef.annotations.fieldAnnotations.length; i++) {
				const fieldAnnotation = classDef.annotations.fieldAnnotations[i];
				const fieldAnnotationsOffsetWriteLater = annotationOffsetWriteLaters.fieldAnnotationsOffsetWriteLaters?.[i];
				if (fieldAnnotation.annotations && fieldAnnotation.annotations.length > 0 && fieldAnnotationsOffsetWriteLater) {
					annotationSetsToWrite.push({
						annotations: fieldAnnotation.annotations,
						setOffsetWriteLater: fieldAnnotationsOffsetWriteLater,
						itemOffsetWriteLaters: [],
					});
				}
			}

			for (let i = 0; i < classDef.annotations.methodAnnotations.length; i++) {
				const methodAnnotation = classDef.annotations.methodAnnotations[i];
				if (methodAnnotation.annotations.length > 0 && annotationOffsetWriteLaters.methodAnnotationsOffsetWriteLaters?.[i]) {
					annotationSetsToWrite.push({
						annotations: methodAnnotation.annotations,
						setOffsetWriteLater: annotationOffsetWriteLaters.methodAnnotationsOffsetWriteLaters[i],
						itemOffsetWriteLaters: [],
					});
				}
			}

			for (let i = 0; i < classDef.annotations.parameterAnnotations.length; i++) {
				const paramAnnotation = classDef.annotations.parameterAnnotations[i];
				if (annotationOffsetWriteLaters.parameterAnnotationsOffsetWriteLaters?.[i]) {
					annotationSetRefListsToWrite.push({
						parameterAnnotations: paramAnnotation.annotations,
						refListOffsetWriteLater: annotationOffsetWriteLaters.parameterAnnotationsOffsetWriteLaters[i],
						setOffsetWriteLaters: [],
					});
				}
			}
		}
	}

	// Second sub-pass: write all annotation set ref lists
	for (const refList of annotationSetRefListsToWrite) {
		yield * alignmentUnparser(4)(undefined, unparserContext);
		annotationSetRefListItemsTracker.recordItem(unparserContext.position);

		const refListOffset = unparserContext.position;
		yield * unparserContext.writeEarlier(refList.refListOffsetWriteLater, uintUnparser, refListOffset);

		yield * annotationUnparsers.annotationSetRefListUnparser(refList.setOffsetWriteLaters)(refList.parameterAnnotations, unparserContext);

		// Collect annotation sets from this ref list
		for (let j = 0; j < refList.parameterAnnotations.length; j++) {
			const paramSet = refList.parameterAnnotations[j];
			const annotationSetOffsetWriteLater = refList.setOffsetWriteLaters[j];
			if (paramSet.length > 0 && annotationSetOffsetWriteLater) {
				annotationSetsToWrite.push({
					annotations: paramSet,
					setOffsetWriteLater: annotationSetOffsetWriteLater,
					itemOffsetWriteLaters: [],
				});
			}
		}
	}

	// Third sub-pass: write all annotation sets
	for (const annotationSet of annotationSetsToWrite) {
		yield * alignmentUnparser(4)(undefined, unparserContext);
		annotationSetItemsTracker.recordItem(unparserContext.position);

		const setOffset = unparserContext.position;
		yield * unparserContext.writeEarlier(annotationSet.setOffsetWriteLater, uintUnparser, setOffset);

		yield * annotationUnparsers.annotationSetItemUnparser(annotationSet.itemOffsetWriteLaters)(annotationSet.annotations, unparserContext);
	}

	// Fourth sub-pass: write all annotation items
	for (const annotationSet of annotationSetsToWrite) {
		for (let i = 0; i < annotationSet.annotations.length; i++) {
			annotationItemsTracker.recordItem(unparserContext.position);

			const itemOffset = unparserContext.position;
			yield * unparserContext.writeEarlier(annotationSet.itemOffsetWriteLaters[i], uintUnparser, itemOffset);
			yield * annotationUnparsers.annotationItemUnparser(annotationSet.annotations[i], unparserContext);
		}
	}

	if (input.link && linkOffsetWriteLater) {
		const linkOffset = unparserContext.position;
		yield * unparserContext.writeEarlier(linkOffsetWriteLater, uintUnparser, linkOffset);
		yield input.link;
	}

	yield * alignmentUnparser(4)(undefined, unparserContext);
	const mapOffset = unparserContext.position;
	yield * unparserContext.writeEarlier(mapOffsetWriteLater, uintUnparser, mapOffset);

	// Build map items from section definitions
	const sectionConfigs = [
		{ type: 0x0000, size: 1, offset: 0 },
		{ type: 0x0001, size: stringPool.size(), offset: stringIdsOffset },
		{ type: 0x0002, size: typePool.size(), offset: typeIdsOffset },
		{ type: 0x0003, size: protoPool.size(), offset: protoIdsOffset },
		{ type: 0x0004, size: fieldPool.size(), offset: fieldIdsOffset },
		{ type: 0x0005, size: methodPool.size(), offset: methodIdsOffset },
		{ type: 0x0006, size: input.classDefinitions.length, offset: classDefsOffset },
		{ type: 0x2002, size: stringPool.size(), offset: dataOffset },
		{ type: 0x1001, size: typeListItemsTracker.count, offset: typeListItemsTracker.offset },
		{ type: 0x1002, size: annotationSetRefListItemsTracker.count, offset: annotationSetRefListItemsTracker.offset },
		{ type: 0x1003, size: annotationSetItemsTracker.count, offset: annotationSetItemsTracker.offset },
		{ type: 0x2000, size: classDataItemsTracker.count, offset: classDataItemsTracker.offset },
		{ type: 0x2001, size: codeItemsTracker.count, offset: codeItemsTracker.offset },
		{ type: 0x2003, size: debugInfoItemsTracker.count, offset: debugInfoItemsTracker.offset },
		{ type: 0x2004, size: annotationItemsTracker.count, offset: annotationItemsTracker.offset },
		{ type: 0x2005, size: encodedArrayItemsTracker.count, offset: encodedArrayItemsTracker.offset },
		{ type: 0x2006, size: annotationsDirectoryItemsTracker.count, offset: annotationsDirectoryItemsTracker.offset },
		{ type: 0x1000, size: 1, offset: mapOffset },
	];

	// Filter out sections with zero size (except header and map which always exist)
	const mapItems = sectionConfigs.filter(
		config => config.type === 0x0000 || config.type === 0x1000 || config.size > 0,
	);

	// Sort map items by offset (required by DEX format spec)
	mapItems.sort((a, b) => a.offset - b.offset);

	yield * uintUnparser(mapItems.length, unparserContext);

	for (const mapItem of mapItems) {
		yield * ushortUnparser(mapItem.type, unparserContext);
		yield * ushortUnparser(0, unparserContext);
		yield * uintUnparser(mapItem.size, unparserContext);
		yield * uintUnparser(mapItem.offset, unparserContext);
	}

	const fileSize = unparserContext.position;
	yield * unparserContext.writeEarlier(fileSizeWriteLater, uintUnparser, fileSize);

	const dataSize = fileSize - dataOffset;
	yield * unparserContext.writeEarlier(dataSizeWriteLater, uintUnparser, dataSize);

	yield * unparserContext.writeEarlier(checksumWriteLater, uintUnparser, 0);

	const zeroSha1 = new Uint8Array(20);
	yield * unparserContext.writeEarlier(sha1WriteLater, async function * (hash) {
		yield hash;
	}, zeroSha1);
};
