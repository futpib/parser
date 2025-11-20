import {
	type DalvikExecutableField,
	type DalvikExecutableMethod,
	type DalvikExecutablePrototype,
	dalvikExecutableFieldEquals,
	dalvikExecutableMethodEquals,
} from '../dalvikExecutable.js';

export class StringPoolBuilder {
	private strings: string[] = [];
	private stringToIndex = new Map<string, number>();

	add(str: string): number {
		const existing = this.stringToIndex.get(str);
		if (existing !== undefined) {
			return existing;
		}

		const index = this.strings.length;
		this.strings.push(str);
		this.stringToIndex.set(str, index);
		return index;
	}

	getIndex(str: string): number | undefined {
		return this.stringToIndex.get(str);
	}

	getStrings(): string[] {
		return this.strings;
	}

	size(): number {
		return this.strings.length;
	}
}

export class TypePoolBuilder {
	private types: string[] = [];
	private typeToIndex = new Map<string, number>();

	add(typeDescriptor: string): number {
		const existing = this.typeToIndex.get(typeDescriptor);
		if (existing !== undefined) {
			return existing;
		}

		const index = this.types.length;
		this.types.push(typeDescriptor);
		this.typeToIndex.set(typeDescriptor, index);
		return index;
	}

	getIndex(typeDescriptor: string): number | undefined {
		return this.typeToIndex.get(typeDescriptor);
	}

	getTypes(): string[] {
		return this.types;
	}

	size(): number {
		return this.types.length;
	}
}

function prototypeKey(proto: DalvikExecutablePrototype): string {
	return `${proto.shorty}:${proto.returnType}:(${proto.parameters.join(',')})`;
}

export class ProtoPoolBuilder {
	private protos: DalvikExecutablePrototype[] = [];
	private protoToIndex = new Map<string, number>();

	add(proto: DalvikExecutablePrototype): number {
		const key = prototypeKey(proto);
		const existing = this.protoToIndex.get(key);
		if (existing !== undefined) {
			return existing;
		}

		const index = this.protos.length;
		this.protos.push(proto);
		this.protoToIndex.set(key, index);
		return index;
	}

	getIndex(proto: DalvikExecutablePrototype): number | undefined {
		const key = prototypeKey(proto);
		return this.protoToIndex.get(key);
	}

	getProtos(): DalvikExecutablePrototype[] {
		return this.protos;
	}

	size(): number {
		return this.protos.length;
	}
}

function fieldKey(field: DalvikExecutableField): string {
	return `${field.class}:${field.type}:${field.name}`;
}

export class FieldPoolBuilder {
	private fields: DalvikExecutableField[] = [];
	private fieldToIndex = new Map<string, number>();

	add(field: DalvikExecutableField): number {
		const key = fieldKey(field);
		const existing = this.fieldToIndex.get(key);
		if (existing !== undefined) {
			return existing;
		}

		const index = this.fields.length;
		this.fields.push(field);
		this.fieldToIndex.set(key, index);
		return index;
	}

	getIndex(field: DalvikExecutableField): number | undefined {
		const key = fieldKey(field);
		return this.fieldToIndex.get(key);
	}

	getFields(): DalvikExecutableField[] {
		return this.fields;
	}

	size(): number {
		return this.fields.length;
	}
}

function methodKey(method: DalvikExecutableMethod): string {
	const protoKey = prototypeKey(method.prototype);
	return `${method.class}:${protoKey}:${method.name}`;
}

export class MethodPoolBuilder {
	private methods: DalvikExecutableMethod[] = [];
	private methodToIndex = new Map<string, number>();

	add(method: DalvikExecutableMethod): number {
		const key = methodKey(method);
		const existing = this.methodToIndex.get(key);
		if (existing !== undefined) {
			return existing;
		}

		const index = this.methods.length;
		this.methods.push(method);
		this.methodToIndex.set(key, index);
		return index;
	}

	getIndex(method: DalvikExecutableMethod): number | undefined {
		const key = methodKey(method);
		return this.methodToIndex.get(key);
	}

	getMethods(): DalvikExecutableMethod[] {
		return this.methods;
	}

	size(): number {
		return this.methods.length;
	}
}

export interface PoolBuilders {
	stringPool: StringPoolBuilder;
	typePool: TypePoolBuilder;
	protoPool: ProtoPoolBuilder;
	fieldPool: FieldPoolBuilder;
	methodPool: MethodPoolBuilder;
}

export function createPoolBuilders(): PoolBuilders {
	return {
		stringPool: new StringPoolBuilder(),
		typePool: new TypePoolBuilder(),
		protoPool: new ProtoPoolBuilder(),
		fieldPool: new FieldPoolBuilder(),
		methodPool: new MethodPoolBuilder(),
	};
}
