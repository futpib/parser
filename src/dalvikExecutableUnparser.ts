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

	for (let i = 0; i < protoPool.size(); i++) {
		const proto = protoPool.getProtos()[i];
		if (proto.parameters.length > 0) {
			yield * alignmentUnparser(4)(undefined, unparserContext);
			const paramListOffset = unparserContext.position;
			yield * unparserContext.writeEarlier(protoParameterListOffsetWriteLaters[i], uintUnparser, paramListOffset);
			yield * sectionUnparsers.typeListUnparser(proto.parameters, unparserContext);
		}
	}

	for (let classIdx = 0; classIdx < input.classDefinitions.length; classIdx++) {
		const classDef = input.classDefinitions[classIdx];
		const classDefItem = classDefItems[classIdx];

		if (classDef.interfaces.length > 0 && classDefItem.interfacesOffsetWriteLater) {
			yield * alignmentUnparser(4)(undefined, unparserContext);
			const interfacesOffset = unparserContext.position;
			yield * unparserContext.writeEarlier(classDefItem.interfacesOffsetWriteLater, uintUnparser, interfacesOffset);
			yield * sectionUnparsers.typeListUnparser(classDef.interfaces, unparserContext);
		}

		if (classDef.staticValues.length > 0 && classDefItem.staticValuesOffsetWriteLater) {
			const staticValuesOffset = unparserContext.position;
			yield * unparserContext.writeEarlier(classDefItem.staticValuesOffsetWriteLater, uintUnparser, staticValuesOffset);
			yield * sectionUnparsers.encodedArrayUnparser(classDef.staticValues, unparserContext);
		}

		if (classDef.classData && classDefItem.classDataOffsetWriteLater) {
			const classDataOffset = unparserContext.position;
			yield * unparserContext.writeEarlier(classDefItem.classDataOffsetWriteLater, uintUnparser, classDataOffset);

			const classData = classDef.classData;
			const allMethods = [ ...classData.directMethods, ...classData.virtualMethods ];
			const codeOffsetWriteLaters: any[] = [];

			yield * sectionUnparsers.classDataUnparser(codeOffsetWriteLaters)(classDef.classData, unparserContext);

			for (let methodIdx = 0; methodIdx < allMethods.length; methodIdx++) {
				const method = allMethods[methodIdx];
				if (method.code) {
					yield * alignmentUnparser(4)(undefined, unparserContext);
					const codeOffset = unparserContext.position;

					if (codeOffsetWriteLaters[methodIdx]) {
						yield * unparserContext.writeEarlier(codeOffsetWriteLaters[methodIdx], uintUnparser, codeOffset);
					}

					let debugInfoOffsetWriteLater;
					yield * sectionUnparsers.codeItemUnparser(result => {
						debugInfoOffsetWriteLater = result.debugInfoOffsetWriteLater;
					})(method.code, unparserContext);

					if (method.code.debugInfo && debugInfoOffsetWriteLater) {
						const debugInfoOffset = unparserContext.position;
						yield * unparserContext.writeEarlier(debugInfoOffsetWriteLater, uintUnparser, debugInfoOffset);
						yield * sectionUnparsers.debugInfoUnparser(method.code.debugInfo, unparserContext);
					}
				}
			}
		}

		if (classDef.annotations && classDefItem.annotationsOffsetWriteLater) {
			yield * alignmentUnparser(4)(undefined, unparserContext);
			const annotationsOffset = unparserContext.position;
			yield * unparserContext.writeEarlier(classDefItem.annotationsOffsetWriteLater, uintUnparser, annotationsOffset);

			const annotationOffsetWriteLaters: any = {};
			yield * annotationUnparsers.annotationsDirectoryItemUnparser(annotationOffsetWriteLaters)(classDef.annotations, unparserContext);

			if (classDef.annotations.classAnnotations.length > 0 && annotationOffsetWriteLaters.classAnnotationsOffsetWriteLater) {
				yield * alignmentUnparser(4)(undefined, unparserContext);
				const classAnnotationsOffset = unparserContext.position;
				yield * unparserContext.writeEarlier(annotationOffsetWriteLaters.classAnnotationsOffsetWriteLater, uintUnparser, classAnnotationsOffset);

				const annotationItemOffsetWriteLaters: any[] = [];
				yield * annotationUnparsers.annotationSetItemUnparser(annotationItemOffsetWriteLaters)(classDef.annotations.classAnnotations, unparserContext);

				for (let i = 0; i < classDef.annotations.classAnnotations.length; i++) {
					const annotationItemOffset = unparserContext.position;
					yield * unparserContext.writeEarlier(annotationItemOffsetWriteLaters[i], uintUnparser, annotationItemOffset);
					yield * annotationUnparsers.annotationItemUnparser(classDef.annotations.classAnnotations[i], unparserContext);
				}
			}

			for (let i = 0; i < classDef.annotations.fieldAnnotations.length; i++) {
				const fieldAnnotation = classDef.annotations.fieldAnnotations[i];
				if (fieldAnnotation.annotations && fieldAnnotation.annotations.length > 0 && annotationOffsetWriteLaters.fieldAnnotationsOffsetWriteLaters?.[i]) {
					yield * alignmentUnparser(4)(undefined, unparserContext);
					const fieldAnnotationsOffset = unparserContext.position;
					yield * unparserContext.writeEarlier(annotationOffsetWriteLaters.fieldAnnotationsOffsetWriteLaters[i], uintUnparser, fieldAnnotationsOffset);

					const annotationItemOffsetWriteLaters: any[] = [];
					yield * annotationUnparsers.annotationSetItemUnparser(annotationItemOffsetWriteLaters)(fieldAnnotation.annotations, unparserContext);

					for (let j = 0; j < fieldAnnotation.annotations.length; j++) {
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
					const methodAnnotationsOffset = unparserContext.position;
					yield * unparserContext.writeEarlier(annotationOffsetWriteLaters.methodAnnotationsOffsetWriteLaters[i], uintUnparser, methodAnnotationsOffset);

					const annotationItemOffsetWriteLaters: any[] = [];
					yield * annotationUnparsers.annotationSetItemUnparser(annotationItemOffsetWriteLaters)(methodAnnotation.annotations, unparserContext);

					for (let j = 0; j < methodAnnotation.annotations.length; j++) {
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
					const paramAnnotationsOffset = unparserContext.position;
					yield * unparserContext.writeEarlier(annotationOffsetWriteLaters.parameterAnnotationsOffsetWriteLaters[i], uintUnparser, paramAnnotationsOffset);

					const annotationSetOffsetWriteLaters: any[] = [];
					yield * annotationUnparsers.annotationSetRefListUnparser(annotationSetOffsetWriteLaters)(paramAnnotation.annotations, unparserContext);

					for (let j = 0; j < paramAnnotation.annotations.length; j++) {
						const paramSet = paramAnnotation.annotations[j];
						if (paramSet.length > 0 && annotationSetOffsetWriteLaters[j]) {
							yield * alignmentUnparser(4)(undefined, unparserContext);
							const paramSetOffset = unparserContext.position;
							yield * unparserContext.writeEarlier(annotationSetOffsetWriteLaters[j], uintUnparser, paramSetOffset);

							const annotationItemOffsetWriteLaters: any[] = [];
							yield * annotationUnparsers.annotationSetItemUnparser(annotationItemOffsetWriteLaters)(paramSet, unparserContext);

							for (let k = 0; k < paramSet.length; k++) {
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

	mapItems.push({ type: 0x1000, size: 1, offset: mapOffset });

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
