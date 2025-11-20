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
import { type DalvikBytecode } from '../dalvikBytecodeParser.js';
import { type PoolBuilders } from './poolBuilders.js';

export function scanForPoolReferences(
	dalvikExecutable: DalvikExecutable<DalvikBytecode>,
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

	function scanEncodedValue(value: DalvikExecutableEncodedValue | Array<DalvikExecutableEncodedValue | string>): void {
		if (value === null || value === undefined) {
			return;
		}

		if (typeof value === 'string') {
			addString(value);
			return;
		}

		if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean') {
			return;
		}

		if (isDalvikExecutableField(value)) {
			addField(value as DalvikExecutableField);
			return;
		}

		if (isDalvikExecutableMethod(value)) {
			addMethod(value as DalvikExecutableMethod);
			return;
		}

		if (Array.isArray(value)) {
			for (const element of value) {
				if (typeof element === 'string') {
					addString(element);
				} else {
					scanEncodedValue(element);
				}
			}
			return;
		}

		if (typeof value === 'object' && 'returnType' in value && 'parameters' in value) {
			addPrototype(value as DalvikExecutablePrototype);
			return;
		}

		if (typeof value === 'object' && 'type' in value && 'elements' in value) {
			const annotation = value as any;
			if (typeof annotation.type === 'string') {
				addType(annotation.type);
				for (const element of annotation.elements) {
					addString(element.name);
					scanEncodedValue(element.value);
				}
			}
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

	function scanCode(code: undefined | DalvikExecutableCode<DalvikBytecode>): void {
		if (!code) {
			return;
		}

		scanDebugInfo(code.debugInfo);

		for (const operation of code.instructions) {
			if ('methodIndex' in operation) {
				const methodIndex = operation.methodIndex as any;
				if (isDalvikExecutableMethod(methodIndex)) {
					addMethod(methodIndex);
				}
			}

			if ('fieldIndex' in operation) {
				const fieldIndex = operation.fieldIndex as any;
				if (isDalvikExecutableField(fieldIndex)) {
					addField(fieldIndex);
				}
			}

			if ('typeIndex' in operation) {
				const typeIndex = operation.typeIndex as any;
				if (typeof typeIndex === 'string') {
					addType(typeIndex);
				}
			}

			if ('stringIndex' in operation) {
				const stringIndex = operation.stringIndex as any;
				if (typeof stringIndex === 'string') {
					addString(stringIndex);
				}
			}

			if ('protoIndex' in operation) {
				const protoIndex = operation.protoIndex as any;
				if (typeof protoIndex === 'object' && 'returnType' in protoIndex) {
					addPrototype(protoIndex);
				}
			}
		}

		for (const tryBlock of code.tries) {
			for (const handler of tryBlock.handler.handlers) {
				addType(handler.type);
			}
		}
	}

	function scanMethod(method: DalvikExecutableMethodWithAccess<DalvikBytecode>): void {
		addMethod(method.method);
		scanCode(method.code);
	}

	function scanClassData(classData: undefined | DalvikExecutableClassData<DalvikBytecode>): void {
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

	function scanClassDefinition(classDef: DalvikExecutableClassDefinition<DalvikBytecode>): void {
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
