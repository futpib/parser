import { type Unparser } from '../unparser.js';

async function* yieldAndCapture<T>(gen: AsyncIterable<T, T>): AsyncIterable<T, T> {
	let value: T | undefined;
	for await (value of gen) {
		yield value;
	}
	return value!;
}
import {
	type DalvikExecutableAnnotation,
	type DalvikExecutableClassAnnotations,
	type DalvikExecutableField,
	type DalvikExecutableMethod,
} from '../dalvikExecutable.js';
import { ubyteUnparser, uintUnparser } from '../dalvikBytecodeUnparser/formatUnparsers.js';
import { alignmentUnparser, uleb128Unparser } from './utils.js';

export function createAnnotationUnparsers(
	getStringIndex: (str: string | undefined) => number,
	getTypeIndex: (typeDescriptor: string | undefined) => number,
	getFieldIndex: (field: DalvikExecutableField) => number,
	getMethodIndex: (method: DalvikExecutableMethod) => number,
	encodedValueUnparser: Unparser<any, Uint8Array>,
) {
	const annotationItemUnparser: Unparser<DalvikExecutableAnnotation, Uint8Array> = async function * (input, unparserContext) {
		const visibilityByte = input.visibility === 'build' ? 0x00 : input.visibility === 'runtime' ? 0x01 : 0x02;
		yield * ubyteUnparser(visibilityByte, unparserContext);

		const typeIndex = getTypeIndex(input.type);
		yield * uleb128Unparser(typeIndex, unparserContext);

		yield * uleb128Unparser(input.elements.length, unparserContext);

		for (const element of input.elements) {
			const nameIndex = getStringIndex(element.name);
			yield * uleb128Unparser(nameIndex, unparserContext);
			yield * encodedValueUnparser(element.value, unparserContext);
		}
	};

	const annotationSetItemUnparser = (annotationItemOffsetWriteLaters: any[]): Unparser<DalvikExecutableAnnotation[], Uint8Array> => {
		return async function * (input, unparserContext) {
			yield * alignmentUnparser(4)(undefined, unparserContext);

			yield * uintUnparser(input.length, unparserContext);

			for (const annotation of input) {
				const annotationOffsetWriteLater = yield * yieldAndCapture(unparserContext.writeLater(4));
				annotationItemOffsetWriteLaters.push(annotationOffsetWriteLater);
			}
		};
	};

	const annotationSetRefListUnparser = (annotationSetOffsetWriteLaters: any[]): Unparser<DalvikExecutableAnnotation[][], Uint8Array> => {
		return async function * (input, unparserContext) {
			yield * alignmentUnparser(4)(undefined, unparserContext);

			yield * uintUnparser(input.length, unparserContext);

			for (const annotationSet of input) {
				if (annotationSet.length > 0) {
					const annotationSetOffsetWriteLater = yield * yieldAndCapture(unparserContext.writeLater(4));
					annotationSetOffsetWriteLaters.push(annotationSetOffsetWriteLater);
				} else {
					annotationSetOffsetWriteLaters.push(null);
					yield * uintUnparser(0, unparserContext);
				}
			}
		};
	};

	const annotationsDirectoryItemUnparser = (annotationOffsetWriteLaters: any): Unparser<DalvikExecutableClassAnnotations, Uint8Array> => {
		return async function * (input, unparserContext) {
			yield * alignmentUnparser(4)(undefined, unparserContext);

			if (input.classAnnotations.length > 0) {
				const classAnnotationsOffsetWriteLater = yield * yieldAndCapture(unparserContext.writeLater(4));
				annotationOffsetWriteLaters.classAnnotationsOffsetWriteLater = classAnnotationsOffsetWriteLater;
			} else {
				yield * uintUnparser(0, unparserContext);
			}

			yield * uintUnparser(input.fieldAnnotations.length, unparserContext);
			yield * uintUnparser(input.methodAnnotations.length, unparserContext);
			yield * uintUnparser(input.parameterAnnotations.length, unparserContext);

			annotationOffsetWriteLaters.fieldAnnotationsOffsetWriteLaters = [];
			for (const fieldAnnotation of input.fieldAnnotations) {
				const fieldIndex = getFieldIndex(fieldAnnotation.field);
				yield * uintUnparser(fieldIndex, unparserContext);

				if (fieldAnnotation.annotations && fieldAnnotation.annotations.length > 0) {
					const annotationsOffsetWriteLater = yield * yieldAndCapture(unparserContext.writeLater(4));
					annotationOffsetWriteLaters.fieldAnnotationsOffsetWriteLaters.push(annotationsOffsetWriteLater);
				} else {
					annotationOffsetWriteLaters.fieldAnnotationsOffsetWriteLaters.push(null);
					yield * uintUnparser(0, unparserContext);
				}
			}

			annotationOffsetWriteLaters.methodAnnotationsOffsetWriteLaters = [];
			for (const methodAnnotation of input.methodAnnotations) {
				const methodIndex = getMethodIndex(methodAnnotation.method);
				yield * uintUnparser(methodIndex, unparserContext);

				const annotationsOffsetWriteLater = yield * yieldAndCapture(unparserContext.writeLater(4));
				annotationOffsetWriteLaters.methodAnnotationsOffsetWriteLaters.push(annotationsOffsetWriteLater);
			}

			annotationOffsetWriteLaters.parameterAnnotationsOffsetWriteLaters = [];
			for (const paramAnnotation of input.parameterAnnotations) {
				const methodIndex = getMethodIndex(paramAnnotation.method);
				yield * uintUnparser(methodIndex, unparserContext);

				const annotationsOffsetWriteLater = yield * yieldAndCapture(unparserContext.writeLater(4));
				annotationOffsetWriteLaters.parameterAnnotationsOffsetWriteLaters.push(annotationsOffsetWriteLater);
			}
		};
	};

	return {
		annotationItemUnparser,
		annotationSetItemUnparser,
		annotationSetRefListUnparser,
		annotationsDirectoryItemUnparser,
	};
}
