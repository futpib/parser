// Dalvik Executable (DEX) File Format Unparser
// Implements the DEX file format specification version 035
// Reference: https://source.android.com/docs/core/runtime/dex-format
// DEX 035 is used in Android 5.0-7.1 (API 21-25)

import { type Unparser } from './unparser.js';
import { type DalvikExecutable, type DalvikExecutableClassDefinition, type DalvikExecutableCode, type DalvikExecutableDebugInfo } from './dalvikExecutable.js';
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
import { WriteLater } from './unparserContext.js';

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

	// DEX File Header (0x70 bytes)
	// Reference: https://source.android.com/docs/core/runtime/dex-format#header-item

	// Magic: ubyte[8] = DEX_FILE_MAGIC
	// The spec defines "magic" as the full 8 bytes including both "dex\n" and version
	// "dex\n" prefix (0x64 0x65 0x78 0x0A)
	const magicBytes = new Uint8Array([ 0x64, 0x65, 0x78, 0x0A ]);
	yield magicBytes;

	// Version suffix "035\0" for DEX version 035 (part of magic field)
	const versionBytes = new Uint8Array([ 0x30, 0x33, 0x35, 0x00 ]);
	yield versionBytes;

	// Checksum: adler32 of rest of file (filled in later)
	const checksumWriteLater = yield * yieldAndCapture(unparserContext.writeLater(4));
	// SHA-1 signature: hash of rest of file (filled in later)
	const sha1WriteLater = yield * yieldAndCapture(unparserContext.writeLater(20));
	// File size: total size of file (filled in later)
	const fileSizeWriteLater = yield * yieldAndCapture(unparserContext.writeLater(4));

	// Header size: must be 0x70
	yield * uintUnparser(0x70, unparserContext);

	// Endian tag: must be 0x12345678 for little-endian
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
		classDef: DalvikExecutableClassDefinition<DalvikBytecode>;
		classDefItem: {
			interfacesOffsetWriteLater?: WriteLater<Uint8Array, number>;
			annotationsOffsetWriteLater?: WriteLater<Uint8Array, number>;
			classDataOffsetWriteLater?: WriteLater<Uint8Array, number>;
			staticValuesOffsetWriteLater?: WriteLater<Uint8Array, number>;
		};
		classIdx: number;
	}> = [];
	const codeToWrite: Array<{ code: DalvikExecutableCode<DalvikBytecode> }> = [];
	const debugInfoToWrite: Array<{ debugInfo: DalvikExecutableDebugInfo; offsetWriteLater: WriteLater<Uint8Array, number> }> = [];

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
		if (classDefItem.classDataOffsetWriteLater && classDef.classData) {
			yield * unparserContext.writeEarlier(classDefItem.classDataOffsetWriteLater, uintUnparser, classDataOffset);

			yield * sectionUnparsers.classDataUnparser(codeOffsetMap)(classDef.classData, unparserContext);
		}
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

			const annotationOffsetWriteLaters: {
				classAnnotationsOffsetWriteLater?: WriteLater<Uint8Array, number>;
				fieldAnnotationsOffsetWriteLaters?: Array<WriteLater<Uint8Array, number> | null>;
				methodAnnotationsOffsetWriteLaters?: Array<WriteLater<Uint8Array, number>>;
				parameterAnnotationsOffsetWriteLaters?: Array<WriteLater<Uint8Array, number>>;
			} = {};
			yield * annotationUnparsers.annotationsDirectoryItemUnparser(annotationOffsetWriteLaters)(classDef.annotations, unparserContext);

			if (classDef.annotations.classAnnotations.length > 0 && annotationOffsetWriteLaters.classAnnotationsOffsetWriteLater) {
				yield * alignmentUnparser(4)(undefined, unparserContext);

				if (annotationSetItemsCount === 0) {
					annotationSetItemsOffset = unparserContext.position;
				}
				annotationSetItemsCount++;

				const classAnnotationsOffset = unparserContext.position;
				yield * unparserContext.writeEarlier(annotationOffsetWriteLaters.classAnnotationsOffsetWriteLater, uintUnparser, classAnnotationsOffset);

				const annotationItemOffsetWriteLaters: Array<WriteLater<Uint8Array, number>> = [];
				yield * annotationUnparsers.annotationSetItemUnparser(annotationItemOffsetWriteLaters)(classDef.annotations.classAnnotations, unparserContext);

				for (let i = 0; i < classDef.annotations.classAnnotations.length; i++) {
					if (annotationItemsCount === 0) {
						annotationItemsOffset = unparserContext.position;
					}
					annotationItemsCount++;

					const annotationItemOffset = unparserContext.position;
					yield * unparserContext.writeEarlier(annotationItemOffsetWriteLaters[i], uintUnparser, annotationItemOffset);
					yield * annotationUnparsers.annotationItemUnparser(classDef.annotations.classAnnotations[i], unparserContext);
				}
			}

			for (let i = 0; i < classDef.annotations.fieldAnnotations.length; i++) {
				const fieldAnnotation = classDef.annotations.fieldAnnotations[i];
				const fieldAnnotationsOffsetWriteLater = annotationOffsetWriteLaters.fieldAnnotationsOffsetWriteLaters?.[i];
				if (fieldAnnotation.annotations && fieldAnnotation.annotations.length > 0 && fieldAnnotationsOffsetWriteLater) {
					yield * alignmentUnparser(4)(undefined, unparserContext);

					if (annotationSetItemsCount === 0) {
						annotationSetItemsOffset = unparserContext.position;
					}
					annotationSetItemsCount++;

					const fieldAnnotationsOffset = unparserContext.position;
					yield * unparserContext.writeEarlier(fieldAnnotationsOffsetWriteLater, uintUnparser, fieldAnnotationsOffset);

					const annotationItemOffsetWriteLaters: Array<WriteLater<Uint8Array, number>> = [];
					yield * annotationUnparsers.annotationSetItemUnparser(annotationItemOffsetWriteLaters)(fieldAnnotation.annotations, unparserContext);

					for (let j = 0; j < fieldAnnotation.annotations.length; j++) {
						if (annotationItemsCount === 0) {
							annotationItemsOffset = unparserContext.position;
						}
						annotationItemsCount++;

						const annotationItemOffset = unparserContext.position;
						yield * unparserContext.writeEarlier(annotationItemOffsetWriteLaters[j], uintUnparser, annotationItemOffset);
						yield * annotationUnparsers.annotationItemUnparser(fieldAnnotation.annotations[j], unparserContext);
					}
				}
			}

			for (let i = 0; i < classDef.annotations.methodAnnotations.length; i++) {
				const methodAnnotation = classDef.annotations.methodAnnotations[i];
				if (methodAnnotation.annotations.length > 0 && annotationOffsetWriteLaters.methodAnnotationsOffsetWriteLaters?.[i]) {
					yield * alignmentUnparser(4)(undefined, unparserContext);

					if (annotationSetItemsCount === 0) {
						annotationSetItemsOffset = unparserContext.position;
					}
					annotationSetItemsCount++;

					const methodAnnotationsOffset = unparserContext.position;
					yield * unparserContext.writeEarlier(annotationOffsetWriteLaters.methodAnnotationsOffsetWriteLaters[i], uintUnparser, methodAnnotationsOffset);

					const annotationItemOffsetWriteLaters: Array<WriteLater<Uint8Array, number>> = [];
					yield * annotationUnparsers.annotationSetItemUnparser(annotationItemOffsetWriteLaters)(methodAnnotation.annotations, unparserContext);

					for (let j = 0; j < methodAnnotation.annotations.length; j++) {
						if (annotationItemsCount === 0) {
							annotationItemsOffset = unparserContext.position;
						}
						annotationItemsCount++;

						const annotationItemOffset = unparserContext.position;
						yield * unparserContext.writeEarlier(annotationItemOffsetWriteLaters[j], uintUnparser, annotationItemOffset);
						yield * annotationUnparsers.annotationItemUnparser(methodAnnotation.annotations[j], unparserContext);
					}
				}
			}

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

					const annotationSetOffsetWriteLaters: Array<WriteLater<Uint8Array, number> | null> = [];
					yield * annotationUnparsers.annotationSetRefListUnparser(annotationSetOffsetWriteLaters)(paramAnnotation.annotations, unparserContext);

					for (let j = 0; j < paramAnnotation.annotations.length; j++) {
						const paramSet = paramAnnotation.annotations[j];
						const annotationSetOffsetWriteLater = annotationSetOffsetWriteLaters[j];
						if (paramSet.length > 0 && annotationSetOffsetWriteLater) {
							yield * alignmentUnparser(4)(undefined, unparserContext);

							if (annotationSetItemsCount === 0) {
								annotationSetItemsOffset = unparserContext.position;
							}
							annotationSetItemsCount++;

							const paramSetOffset = unparserContext.position;
							yield * unparserContext.writeEarlier(annotationSetOffsetWriteLater, uintUnparser, paramSetOffset);

							const annotationItemOffsetWriteLaters: Array<WriteLater<Uint8Array, number>> = [];
							yield * annotationUnparsers.annotationSetItemUnparser(annotationItemOffsetWriteLaters)(paramSet, unparserContext);

							for (let k = 0; k < paramSet.length; k++) {
								if (annotationItemsCount === 0) {
									annotationItemsOffset = unparserContext.position;
								}
								annotationItemsCount++;

								const annotationItemOffset = unparserContext.position;
								yield * unparserContext.writeEarlier(annotationItemOffsetWriteLaters[k], uintUnparser, annotationItemOffset);
								yield * annotationUnparsers.annotationItemUnparser(paramSet[k], unparserContext);
							}
						}
					}
				}
			}
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

	// Map items as defined in the DEX format specification
	// https://source.android.com/docs/core/runtime/dex-format#map-item-type-codes
	// These type codes are for DEX version 035 (Android 5.0-7.1, API 21-25)
	const mapItems: Array<{ type: number; size: number; offset: number }> = [];

	// TYPE_HEADER_ITEM (0x0000) - Always present
	mapItems.push({ type: 0x0000, size: 1, offset: 0 });

	// TYPE_STRING_ID_ITEM (0x0001)
	if (stringPool.size() > 0) {
		mapItems.push({ type: 0x0001, size: stringPool.size(), offset: stringIdsOffset });
	}

	// TYPE_TYPE_ID_ITEM (0x0002)
	if (typePool.size() > 0) {
		mapItems.push({ type: 0x0002, size: typePool.size(), offset: typeIdsOffset });
	}

	// TYPE_PROTO_ID_ITEM (0x0003)
	if (protoPool.size() > 0) {
		mapItems.push({ type: 0x0003, size: protoPool.size(), offset: protoIdsOffset });
	}

	// TYPE_FIELD_ID_ITEM (0x0004)
	if (fieldPool.size() > 0) {
		mapItems.push({ type: 0x0004, size: fieldPool.size(), offset: fieldIdsOffset });
	}

	// TYPE_METHOD_ID_ITEM (0x0005)
	if (methodPool.size() > 0) {
		mapItems.push({ type: 0x0005, size: methodPool.size(), offset: methodIdsOffset });
	}

	// TYPE_CLASS_DEF_ITEM (0x0006)
	if (input.classDefinitions.length > 0) {
		mapItems.push({ type: 0x0006, size: input.classDefinitions.length, offset: classDefsOffset });
	}

	// Note: TYPE_CALL_SITE_ID_ITEM (0x0007) and TYPE_METHOD_HANDLE_ITEM (0x0008)
	// are only supported in DEX version 038+ (Android 8.0+, API 26+) and are not
	// included in this DEX 035 implementation.

	// TYPE_STRING_DATA_ITEM (0x2002)
	if (stringPool.size() > 0) {
		mapItems.push({ type: 0x2002, size: stringPool.size(), offset: dataOffset });
	}

	// TYPE_TYPE_LIST (0x1001)
	if (typeListItemsCount > 0) {
		mapItems.push({ type: 0x1001, size: typeListItemsCount, offset: typeListItemsOffset });
	}

	// TYPE_ANNOTATION_SET_REF_LIST (0x1002)
	if (annotationSetRefListItemsCount > 0) {
		mapItems.push({ type: 0x1002, size: annotationSetRefListItemsCount, offset: annotationSetRefListItemsOffset });
	}

	// TYPE_ANNOTATION_SET_ITEM (0x1003)
	if (annotationSetItemsCount > 0) {
		mapItems.push({ type: 0x1003, size: annotationSetItemsCount, offset: annotationSetItemsOffset });
	}

	// TYPE_CLASS_DATA_ITEM (0x2000)
	if (classDataItemsCount > 0) {
		mapItems.push({ type: 0x2000, size: classDataItemsCount, offset: classDataItemsOffset });
	}

	// TYPE_CODE_ITEM (0x2001)
	if (codeItemsCount > 0) {
		mapItems.push({ type: 0x2001, size: codeItemsCount, offset: codeItemsOffset });
	}

	// TYPE_DEBUG_INFO_ITEM (0x2003)
	if (debugInfoItemsCount > 0) {
		mapItems.push({ type: 0x2003, size: debugInfoItemsCount, offset: debugInfoItemsOffset });
	}

	// TYPE_ANNOTATION_ITEM (0x2004)
	if (annotationItemsCount > 0) {
		mapItems.push({ type: 0x2004, size: annotationItemsCount, offset: annotationItemsOffset });
	}

	// TYPE_ENCODED_ARRAY_ITEM (0x2005)
	if (encodedArrayItemsCount > 0) {
		mapItems.push({ type: 0x2005, size: encodedArrayItemsCount, offset: encodedArrayItemsOffset });
	}

	// TYPE_ANNOTATIONS_DIRECTORY_ITEM (0x2006)
	if (annotationsDirectoryItemsCount > 0) {
		mapItems.push({ type: 0x2006, size: annotationsDirectoryItemsCount, offset: annotationsDirectoryItemsOffset });
	}

	// Note: TYPE_HIDDENAPI_CLASS_DATA_ITEM (0xF000) is only supported in DEX version 039+
	// (Android 9.0+, API 28+) and is not included in this DEX 035 implementation.

	// TYPE_MAP_LIST (0x1000) - Always last
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
