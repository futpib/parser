import {
	type DalvikExecutable,
	type DalvikExecutableAnnotation,
	type DalvikExecutableClassAnnotations,
	type DalvikExecutableClassData,
	type DalvikExecutableClassDefinition,
	type DalvikExecutableCode,
	type DalvikExecutableDebugInfo,
	type DalvikExecutableEncodedValue,
	type DalvikExecutableField,
	type DalvikExecutableMethod,
	type DalvikExecutableMethodWithAccess,
	type DalvikExecutablePrototype,
	isDalvikExecutableField,
	isDalvikExecutableMethod,
} from '../dalvikExecutable.js';
import { type DalvikBytecodeOperation } from '../dalvikBytecodeParser/addressConversion.js';
import { type PoolBuilders } from './poolBuilders.js';

export function scanForPoolReferences(
	dalvikExecutable: DalvikExecutable<DalvikBytecodeOperation[]>,
	poolBuilders: PoolBuilders,
): void {
	const { stringPool, typePool, protoPool, fieldPool, methodPool } = poolBuilders;

	for (const classDef of dalvikExecutable.classDefinitions) {
		scanClassDefinition(classDef);
	}

	function addString(str: string | undefined): void {
		if (str !== undefined) {
			stringPool.add(str);
		}
	}

	function addType(typeDescriptor: string | undefined): void {
		if (typeDescriptor !== undefined) {
			typePool.add(typeDescriptor);
			stringPool.add(typeDescriptor);
		}
	}

	function addPrototype(proto: DalvikExecutablePrototype): void {
		protoPool.add(proto);

		addString(proto.shorty);
		addType(proto.returnType);

		for (const param of proto.parameters) {
			addType(param);
		}
	}

	function addField(field: DalvikExecutableField): void {
		fieldPool.add(field);

		addType(field.class);
		addType(field.type);
		addString(field.name);
	}

	function addMethod(method: DalvikExecutableMethod): void {
		methodPool.add(method);

		addType(method.class);
		addPrototype(method.prototype);
		addString(method.name);
	}

	function scanEncodedValue(value: DalvikExecutableEncodedValue): void {
		const { type, value: innerValue } = value;

		// Handle primitive types - they don't need pool entries
		if (
			type === 'byte'
			|| type === 'short'
			|| type === 'char'
			|| type === 'int'
			|| type === 'long'
			|| type === 'float'
			|| type === 'double'
			|| type === 'boolean'
			|| type === 'null'
			|| type === 'methodHandle'
		) {
			return;
		}

		// Handle types that need pool entries
		if (type === 'string') {
			addString(innerValue);
			return;
		}

		if (type === 'type') {
			addType(innerValue);
			return;
		}

		if (type === 'field' || type === 'enum') {
			addField(innerValue);
			return;
		}

		if (type === 'method') {
			addMethod(innerValue);
			return;
		}

		if (type === 'methodType') {
			addPrototype(innerValue);
			return;
		}

		// Handle arrays recursively
		if (type === 'array') {
			for (const element of innerValue) {
				scanEncodedValue(element);
			}
			return;
		}

		// Handle annotations
		if (type === 'annotation') {
			scanAnnotation(innerValue);
		}
	}

	function scanAnnotation(annotation: DalvikExecutableAnnotation): void {
		addType(annotation.type);

		for (const element of annotation.elements) {
			addString(element.name);
			scanEncodedValue(element.value);
		}
	}

	function scanAnnotations(annotations: undefined | DalvikExecutableClassAnnotations): void {
		if (!annotations) {
			return;
		}

		for (const annotation of annotations.classAnnotations) {
			scanAnnotation(annotation);
		}

		for (const fieldAnnotation of annotations.fieldAnnotations) {
			addField(fieldAnnotation.field);

			if (fieldAnnotation.annotations) {
				for (const annotation of fieldAnnotation.annotations) {
					scanAnnotation(annotation);
				}
			}
		}

		for (const methodAnnotation of annotations.methodAnnotations) {
			addMethod(methodAnnotation.method);

			for (const annotation of methodAnnotation.annotations) {
				scanAnnotation(annotation);
			}
		}

		for (const paramAnnotation of annotations.parameterAnnotations) {
			addMethod(paramAnnotation.method);

			for (const paramAnnotations of paramAnnotation.annotations) {
				for (const annotation of paramAnnotations) {
					scanAnnotation(annotation);
				}
			}
		}
	}

	function scanDebugInfo(debugInfo: undefined | DalvikExecutableDebugInfo): void {
		if (!debugInfo) {
			return;
		}

		for (const paramName of debugInfo.parameterNames) {
			addString(paramName);
		}

		for (const bytecode of debugInfo.bytecode) {
			if (bytecode.type === 'startLocal' || bytecode.type === 'startLocalExtended') {
				addString(bytecode.name);
				addType(bytecode.type_);
			}

			if (bytecode.type === 'startLocalExtended') {
				addString(bytecode.signature);
			}

			if (bytecode.type === 'setFile') {
				addString(bytecode.name);
			}
		}
	}

	function scanCode(code: undefined | DalvikExecutableCode<DalvikBytecodeOperation[]>): void {
		if (!code) {
			return;
		}

		scanDebugInfo(code.debugInfo);

		for (const operation of code.instructions) {
			if ('methodIndex' in operation) {
				const methodIndex = operation.methodIndex as unknown;
				if (isDalvikExecutableMethod(methodIndex)) {
					addMethod(methodIndex);
				}
			}

			if ('fieldIndex' in operation) {
				const fieldIndex = operation.fieldIndex as unknown;
				if (isDalvikExecutableField(fieldIndex)) {
					addField(fieldIndex);
				}
			}

			if ('typeIndex' in operation) {
				const typeIndex = operation.typeIndex as unknown;
				if (typeof typeIndex === 'string') {
					addType(typeIndex);
				}
			}

			if ('stringIndex' in operation) {
				const stringIndex = operation.stringIndex as unknown;
				if (typeof stringIndex === 'string') {
					addString(stringIndex);
				}
			}

			if ('protoIndex' in operation) {
				const protoIndex = operation.protoIndex as unknown;
				if (typeof protoIndex === 'object' && protoIndex !== null && 'returnType' in protoIndex) {
					addPrototype(protoIndex as DalvikExecutablePrototype);
				}
			}
		}

		for (const tryBlock of code.tries) {
			for (const handler of tryBlock.handler.handlers) {
				addType(handler.type);
			}
		}
	}

	function scanMethod(method: DalvikExecutableMethodWithAccess<DalvikBytecodeOperation[]>): void {
		addMethod(method.method);
		scanCode(method.code);
	}

	function scanClassData(classData: undefined | DalvikExecutableClassData<DalvikBytecodeOperation[]>): void {
		if (!classData) {
			return;
		}

		for (const field of classData.staticFields) {
			addField(field.field);
		}

		for (const field of classData.instanceFields) {
			addField(field.field);
		}

		for (const method of classData.directMethods) {
			scanMethod(method);
		}

		for (const method of classData.virtualMethods) {
			scanMethod(method);
		}
	}

	function scanClassDefinition(classDef: DalvikExecutableClassDefinition<DalvikBytecodeOperation[]>): void {
		addType(classDef.class);
		addType(classDef.superclass);

		for (const iface of classDef.interfaces) {
			addType(iface);
		}

		addString(classDef.sourceFile);

		scanAnnotations(classDef.annotations);

		for (const value of classDef.staticValues) {
			scanEncodedValue(value);
		}

		scanClassData(classDef.classData);
	}
}
