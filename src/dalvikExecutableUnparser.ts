import { type Unparser } from './unparser.js';
import { type DalvikExecutable } from './dalvikExecutable.js';
import { type DalvikBytecode } from './dalvikBytecodeParser.js';
import { uintUnparser, ushortUnparser } from './dalvikBytecodeUnparser/formatUnparsers.js';
import { createPoolBuilders } from './dalvikExecutableUnparser/poolBuilders.js';
import { scanForPoolReferences } from './dalvikExecutableUnparser/poolScanners.js';
import { createSectionUnparsers } from './dalvikExecutableUnparser/sectionUnparsers.js';
import { createAnnotationUnparsers } from './dalvikExecutableUnparser/annotationUnparsers.js';
import { alignmentUnparser, calculateAdler32, calculateSHA1 } from './dalvikExecutableUnparser/utils.js';
import { uint8ArrayAsyncIterableToUint8Array } from './uint8Array.js';
import { runUnparser } from './unparser.js';
import { uint8ArrayUnparserOutputCompanion } from './unparserOutputCompanion.js';

async function* yieldAndCapture<T>(gen: AsyncIterable<T, T>): AsyncIterable<T, T> {
	let value: T | undefined;
	for await (value of gen) {
		yield value;
	}
	return value!;
}

export const dalvikExecutableUnparser: Unparser<DalvikExecutable<DalvikBytecode>, Uint8Array> = async function * (input, unparserContext) {
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

	let linkOffsetWriteLater;
	if (input.link && input.link.length > 0) {
		yield * uintUnparser(input.link.length, unparserContext);
		linkOffsetWriteLater = yield * yieldAndCapture(unparserContext.writeLater(4));
	} else {
		yield * uintUnparser(0, unparserContext);
		yield * uintUnparser(0, unparserContext);
	}

	const mapOffsetWriteLater = yield * yieldAndCapture(unparserContext.writeLater(4));

	yield * uintUnparser(stringPool.size(), unparserContext);
	const stringIdsOffsetWriteLater = yield * yieldAndCapture(unparserContext.writeLater(4));

	yield * uintUnparser(typePool.size(), unparserContext);
	const typeIdsOffsetWriteLater = yield * yieldAndCapture(unparserContext.writeLater(4));

	yield * uintUnparser(protoPool.size(), unparserContext);
	const protoIdsOffsetWriteLater = yield * yieldAndCapture(unparserContext.writeLater(4));

	yield * uintUnparser(fieldPool.size(), unparserContext);
	const fieldIdsOffsetWriteLater = yield * yieldAndCapture(unparserContext.writeLater(4));

	yield * uintUnparser(methodPool.size(), unparserContext);
	const methodIdsOffsetWriteLater = yield * yieldAndCapture(unparserContext.writeLater(4));

	yield * uintUnparser(input.classDefinitions.length, unparserContext);
	const classDefsOffsetWriteLater = yield * yieldAndCapture(unparserContext.writeLater(4));

	const dataOffsetWriteLater = yield * yieldAndCapture(unparserContext.writeLater(4));
	const dataSizeWriteLater = yield * yieldAndCapture(unparserContext.writeLater(4));

	const stringIdsOffset = unparserContext.position;
	yield * unparserContext.writeEarlier(stringIdsOffsetWriteLater, uintUnparser, stringIdsOffset);

	const stringDataOffsetWriteLaters: any[] = [];
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

	const protoParameterListOffsetWriteLaters: any[] = [];
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
		interfacesOffsetWriteLater?: any;
		annotationsOffsetWriteLater?: any;
		classDataOffsetWriteLater?: any;
		staticValuesOffsetWriteLater?: any;
	}> = [];

	for (const classDef of input.classDefinitions) {
		const classTypeIndex = sectionUnparsers.getTypeIndex(classDef.class);
		const accessFlags = sectionUnparsers.accessFlagsToNumber(classDef.accessFlags);
		const superclassTypeIndex = sectionUnparsers.getTypeIndex(classDef.superclass);

		yield * uintUnparser(classTypeIndex, unparserContext);
		yield * uintUnparser(accessFlags, unparserContext);
		yield * uintUnparser(superclassTypeIndex, unparserContext);

		let interfacesOffsetWriteLater;
		if (classDef.interfaces.length > 0) {
			interfacesOffsetWriteLater = yield * yieldAndCapture(unparserContext.writeLater(4));
		} else {
			yield * uintUnparser(0, unparserContext);
		}

		const sourceFileIndex = classDef.sourceFile ? sectionUnparsers.getStringIndex(classDef.sourceFile) : 0xFFFFFFFF;
		yield * uintUnparser(sourceFileIndex, unparserContext);

		let annotationsOffsetWriteLater;
		if (classDef.annotations) {
			annotationsOffsetWriteLater = yield * yieldAndCapture(unparserContext.writeLater(4));
		} else {
			yield * uintUnparser(0, unparserContext);
		}

		let classDataOffsetWriteLater;
		const hasClassData = classDef.classData && (
			classDef.classData.staticFields.length > 0 ||
			classDef.classData.instanceFields.length > 0 ||
			classDef.classData.directMethods.length > 0 ||
			classDef.classData.virtualMethods.length > 0
		);
		if (hasClassData) {
			classDataOffsetWriteLater = yield * yieldAndCapture(unparserContext.writeLater(4));
		} else {
			yield * uintUnparser(0, unparserContext);
		}

		let staticValuesOffsetWriteLater;
		if (classDef.staticValues.length > 0) {
			staticValuesOffsetWriteLater = yield * yieldAndCapture(unparserContext.writeLater(4));
		} else {
			yield * uintUnparser(0, unparserContext);
		}

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

	let typeListItemsOffset = 0;
	let typeListItemsCount = 0;

	for (let i = 0; i < protoPool.size(); i++) {
		const proto = protoPool.getProtos()[i];
		if (proto.parameters.length > 0) {
			yield * alignmentUnparser(4)(undefined, unparserContext);

			if (typeListItemsCount === 0) {
				typeListItemsOffset = unparserContext.position;
			}
			typeListItemsCount++;

			const paramListOffset = unparserContext.position;
			yield * unparserContext.writeEarlier(protoParameterListOffsetWriteLaters[i], uintUnparser, paramListOffset);
			yield * sectionUnparsers.typeListUnparser(proto.parameters, unparserContext);
		}
	}

	// Track classDataItem, codeItem, and debugInfoItem for later writing
	// Collect data to write items grouped by type (required by DEX format)
	const classDataToWrite: Array<{ classDef: any; classDefItem: any; classIdx: number }> = [];
	const codeToWrite: Array<{ code: any }> = [];
	const debugInfoToWrite: Array<{ debugInfo: any; offsetWriteLater: any }> = [];

	// First pass: write interfaces and static values, collect classData/code/debugInfo
	let encodedArrayItemsOffset = 0;
	let encodedArrayItemsCount = 0;

	for (let classIdx = 0; classIdx < input.classDefinitions.length; classIdx++) {
		const classDef = input.classDefinitions[classIdx];
		const classDefItem = classDefItems[classIdx];

		if (classDef.interfaces.length > 0 && classDefItem.interfacesOffsetWriteLater) {
			yield * alignmentUnparser(4)(undefined, unparserContext);

			if (typeListItemsCount === 0) {
				typeListItemsOffset = unparserContext.position;
			}
			typeListItemsCount++;

			const interfacesOffset = unparserContext.position;
			yield * unparserContext.writeEarlier(classDefItem.interfacesOffsetWriteLater, uintUnparser, interfacesOffset);
			yield * sectionUnparsers.typeListUnparser(classDef.interfaces, unparserContext);
		}

		if (classDef.staticValues.length > 0 && classDefItem.staticValuesOffsetWriteLater) {
			if (encodedArrayItemsCount === 0) {
				encodedArrayItemsOffset = unparserContext.position;
			}
			encodedArrayItemsCount++;

			const staticValuesOffset = unparserContext.position;
			yield * unparserContext.writeEarlier(classDefItem.staticValuesOffsetWriteLater, uintUnparser, staticValuesOffset);
			yield * sectionUnparsers.encodedArrayUnparser(classDef.staticValues, unparserContext);
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

	// Second pass: write all code items FIRST (grouped) and build offset map
	let codeItemsOffset = 0;
	let codeItemsCount = 0;
	const codeOffsetMap = new Map();

	for (const { code } of codeToWrite) {
		yield * alignmentUnparser(4)(undefined, unparserContext);

		if (codeItemsCount === 0) {
			codeItemsOffset = unparserContext.position;
		}
		codeItemsCount++;

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

	// Third pass: write all classData items (grouped) using the offset map
	let classDataItemsOffset = 0;
	let classDataItemsCount = 0;

	for (const { classDef, classDefItem } of classDataToWrite) {
		if (classDataItemsCount === 0) {
			classDataItemsOffset = unparserContext.position;
		}
		classDataItemsCount++;

		const classDataOffset = unparserContext.position;
		yield * unparserContext.writeEarlier(classDefItem.classDataOffsetWriteLater, uintUnparser, classDataOffset);

		yield * sectionUnparsers.classDataUnparser(codeOffsetMap)(classDef.classData, unparserContext);
	}

	// Fourth pass: write all debugInfo items (grouped)
	let debugInfoItemsOffset = 0;
	let debugInfoItemsCount = 0;

	for (const { debugInfo, offsetWriteLater } of debugInfoToWrite) {
		if (debugInfoItemsCount === 0) {
			debugInfoItemsOffset = unparserContext.position;
		}
		debugInfoItemsCount++;

		const debugInfoOffset = unparserContext.position;
		yield * unparserContext.writeEarlier(offsetWriteLater, uintUnparser, debugInfoOffset);
		yield * sectionUnparsers.debugInfoUnparser(debugInfo, unparserContext);
	}

	// Fifth pass: write annotations
	let annotationsDirectoryItemsOffset = 0;
	let annotationsDirectoryItemsCount = 0;
	let annotationSetItemsOffset = 0;
	let annotationSetItemsCount = 0;
	let annotationSetRefListItemsOffset = 0;
	let annotationSetRefListItemsCount = 0;
	let annotationItemsOffset = 0;
	let annotationItemsCount = 0;

	// Collect all annotation set items and annotation items to write them in separate passes
	type AnnotationSetToWrite = {
		setOffsetWriteLater: any;
		annotations: DalvikExecutableAnnotation[];
		itemOffsetWriteLaters: any[];
	};
	type AnnotationSetRefListToWrite = {
		refListOffset: number;
		setOffsetWriteLaters: any[];
		annotationSets: AnnotationSetToWrite[];
	};
	const annotationSetsToWrite: AnnotationSetToWrite[] = [];
	const annotationSetRefListsToWrite: AnnotationSetRefListToWrite[] = [];

	// First pass: write annotations directories and annotation set ref lists, collect annotation sets and items
	for (let classIdx = 0; classIdx < input.classDefinitions.length; classIdx++) {
		const classDef = input.classDefinitions[classIdx];
		const classDefItem = classDefItems[classIdx];

		if (classDef.annotations && classDefItem.annotationsOffsetWriteLater) {
			yield * alignmentUnparser(4)(undefined, unparserContext);

			if (annotationsDirectoryItemsCount === 0) {
				annotationsDirectoryItemsOffset = unparserContext.position;
			}
			annotationsDirectoryItemsCount++;

			const annotationsOffset = unparserContext.position;
			yield * unparserContext.writeEarlier(classDefItem.annotationsOffsetWriteLater, uintUnparser, annotationsOffset);

			const annotationOffsetWriteLaters: any = {};
			yield * annotationUnparsers.annotationsDirectoryItemUnparser(annotationOffsetWriteLaters)(classDef.annotations, unparserContext);

			// Collect class annotations set
			if (classDef.annotations.classAnnotations.length > 0 && annotationOffsetWriteLaters.classAnnotationsOffsetWriteLater) {
				annotationSetsToWrite.push({
					setOffsetWriteLater: annotationOffsetWriteLaters.classAnnotationsOffsetWriteLater,
					annotations: classDef.annotations.classAnnotations,
					itemOffsetWriteLaters: [],
				});
			}

			// Collect field annotations sets
			for (let i = 0; i < classDef.annotations.fieldAnnotations.length; i++) {
				const fieldAnnotation = classDef.annotations.fieldAnnotations[i];
				if (fieldAnnotation.annotations && fieldAnnotation.annotations.length > 0 && annotationOffsetWriteLaters.fieldAnnotationsOffsetWriteLaters?.[i]) {
					annotationSetsToWrite.push({
						setOffsetWriteLater: annotationOffsetWriteLaters.fieldAnnotationsOffsetWriteLaters[i],
						annotations: fieldAnnotation.annotations,
						itemOffsetWriteLaters: [],
					});
				}
			}

			// Collect method annotations sets
			for (let i = 0; i < classDef.annotations.methodAnnotations.length; i++) {
				const methodAnnotation = classDef.annotations.methodAnnotations[i];
				if (methodAnnotation.annotations.length > 0 && annotationOffsetWriteLaters.methodAnnotationsOffsetWriteLaters?.[i]) {
					annotationSetsToWrite.push({
						setOffsetWriteLater: annotationOffsetWriteLaters.methodAnnotationsOffsetWriteLaters[i],
						annotations: methodAnnotation.annotations,
						itemOffsetWriteLaters: [],
					});
				}
			}

			// Collect parameter annotations sets
			for (let i = 0; i < classDef.annotations.parameterAnnotations.length; i++) {
				const paramAnnotation = classDef.annotations.parameterAnnotations[i];
				if (annotationOffsetWriteLaters.parameterAnnotationsOffsetWriteLaters?.[i]) {
					yield * alignmentUnparser(4)(undefined, unparserContext);

					if (annotationSetRefListItemsCount === 0) {
						annotationSetRefListItemsOffset = unparserContext.position;
					}
					annotationSetRefListItemsCount++;

					const paramAnnotationsOffset = unparserContext.position;
					yield * unparserContext.writeEarlier(annotationOffsetWriteLaters.parameterAnnotationsOffsetWriteLaters[i], uintUnparser, paramAnnotationsOffset);

					const annotationSetOffsetWriteLaters: any[] = [];
					yield * annotationUnparsers.annotationSetRefListUnparser(annotationSetOffsetWriteLaters)(paramAnnotation.annotations, unparserContext);

					const setsForThisRefList: AnnotationSetToWrite[] = [];
					for (let j = 0; j < paramAnnotation.annotations.length; j++) {
						const paramSet = paramAnnotation.annotations[j];
						if (paramSet.length > 0 && annotationSetOffsetWriteLaters[j]) {
							const annotationSet: AnnotationSetToWrite = {
								setOffsetWriteLater: annotationSetOffsetWriteLaters[j],
								annotations: paramSet,
								itemOffsetWriteLaters: [],
							};
							setsForThisRefList.push(annotationSet);
							annotationSetsToWrite.push(annotationSet);
						}
					}
				}
			}
		}
	}

	// Second pass: write all annotation set items
	for (const annotationSet of annotationSetsToWrite) {
		yield * alignmentUnparser(4)(undefined, unparserContext);

		if (annotationSetItemsCount === 0) {
			annotationSetItemsOffset = unparserContext.position;
		}
		annotationSetItemsCount++;

		const setOffset = unparserContext.position;
		yield * unparserContext.writeEarlier(annotationSet.setOffsetWriteLater, uintUnparser, setOffset);

		yield * annotationUnparsers.annotationSetItemUnparser(annotationSet.itemOffsetWriteLaters)(annotationSet.annotations, unparserContext);
	}

	// Third pass: write all annotation items
	for (const annotationSet of annotationSetsToWrite) {
		for (let i = 0; i < annotationSet.annotations.length; i++) {
			if (annotationItemsCount === 0) {
				annotationItemsOffset = unparserContext.position;
			}
			annotationItemsCount++;

			const annotationItemOffset = unparserContext.position;
			yield * unparserContext.writeEarlier(annotationSet.itemOffsetWriteLaters[i], uintUnparser, annotationItemOffset);
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

	const mapItems: Array<{ type: number; size: number; offset: number }> = [];

	mapItems.push({ type: 0x0000, size: 1, offset: 0 });

	if (stringPool.size() > 0) {
		mapItems.push({ type: 0x0001, size: stringPool.size(), offset: stringIdsOffset });
	}

	if (typePool.size() > 0) {
		mapItems.push({ type: 0x0002, size: typePool.size(), offset: typeIdsOffset });
	}

	if (protoPool.size() > 0) {
		mapItems.push({ type: 0x0003, size: protoPool.size(), offset: protoIdsOffset });
	}

	if (fieldPool.size() > 0) {
		mapItems.push({ type: 0x0004, size: fieldPool.size(), offset: fieldIdsOffset });
	}

	if (methodPool.size() > 0) {
		mapItems.push({ type: 0x0005, size: methodPool.size(), offset: methodIdsOffset });
	}

	if (input.classDefinitions.length > 0) {
		mapItems.push({ type: 0x0006, size: input.classDefinitions.length, offset: classDefsOffset });
	}

	if (stringPool.size() > 0) {
		mapItems.push({ type: 0x2002, size: stringPool.size(), offset: dataOffset });
	}

	if (typeListItemsCount > 0) {
		mapItems.push({ type: 0x1001, size: typeListItemsCount, offset: typeListItemsOffset });
	}

	if (annotationSetRefListItemsCount > 0) {
		mapItems.push({ type: 0x1002, size: annotationSetRefListItemsCount, offset: annotationSetRefListItemsOffset });
	}

	if (annotationSetItemsCount > 0) {
		mapItems.push({ type: 0x1003, size: annotationSetItemsCount, offset: annotationSetItemsOffset });
	}

	if (classDataItemsCount > 0) {
		mapItems.push({ type: 0x2000, size: classDataItemsCount, offset: classDataItemsOffset });
	}

	if (codeItemsCount > 0) {
		mapItems.push({ type: 0x2001, size: codeItemsCount, offset: codeItemsOffset });
	}

	if (debugInfoItemsCount > 0) {
		mapItems.push({ type: 0x2003, size: debugInfoItemsCount, offset: debugInfoItemsOffset });
	}

	if (annotationItemsCount > 0) {
		mapItems.push({ type: 0x2004, size: annotationItemsCount, offset: annotationItemsOffset });
	}

	if (encodedArrayItemsCount > 0) {
		mapItems.push({ type: 0x2005, size: encodedArrayItemsCount, offset: encodedArrayItemsOffset });
	}

	if (annotationsDirectoryItemsCount > 0) {
		mapItems.push({ type: 0x2006, size: annotationsDirectoryItemsCount, offset: annotationsDirectoryItemsOffset });
	}

	mapItems.push({ type: 0x1000, size: 1, offset: mapOffset });

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
