
export type DalvikExecutableAccessFlags = {
	public: boolean,
	private: boolean,
	protected: boolean,
	static: boolean,
	final: boolean,
	synchronized: boolean,
	volatile: boolean,
	bridge: boolean,
	transient: boolean,
	varargs: boolean,
	native: boolean,
	interface: boolean,
	abstract: boolean,
	strict: boolean,
	synthetic: boolean,
	annotation: boolean,
	enum: boolean,
	constructor: boolean,
	declaredSynchronized: boolean,
};

export function dalvikExecutableAccessFlagsDefault(): DalvikExecutableAccessFlags {
	return {
		public: false,
		private: false,
		protected: false,
		static: false,
		final: false,
		synchronized: false,
		volatile: false,
		bridge: false,
		transient: false,
		varargs: false,
		native: false,
		interface: false,
		abstract: false,
		strict: false,
		synthetic: false,
		annotation: false,
		enum: false,
		constructor: false,
		declaredSynchronized: false,
	};
}

export type DalvikExecutableEncodedValue = number | DalvikExecutableEncodedValue[] | undefined;

type DalvikExecutableTry = {
	startAddress: number;
	instructionCount: number;
	handler: DalvikExecutableEncodedCatchHandler;
};

type DalvikExecutableEncodedTypeAddressPair = {
	type: string;
	address: number;
};

type DalvikExecutableEncodedCatchHandler = {
	handlers: DalvikExecutableEncodedTypeAddressPair[],
	catchAllAddress: undefined | number,
};

export type DalvikExecutableCode<Instructions> = {
	registersSize: number;
	insSize: number;
	outsSize: number;
	debugInfo: undefined | DalvikExecutableDebugInfo;
	instructions: Instructions;
	tries: DalvikExecutableTry[];
};

type DalvikExecutableDebugByteCodeValue =
	| {
		type: 'advancePc';
		addressDiff: number;
	}
	| {
		type: 'advanceLine';
		lineDiff: number;
	}
	| {
		type: 'startLocal';
		registerNum: number;
		name: undefined | string;
		type_: undefined | string;
	}
	| {
		type: 'startLocalExtended';
		registerNum: number;
		name: undefined | string;
		type_: undefined | string;
		signature: undefined | string;
	}
	| {
		type: 'endLocal';
		registerNum: number;
	}
	| {
		type: 'restartLocal';
		registerNum: number;
	}
	| {
		type: 'setPrologueEnd';
	}
	| {
		type: 'setEpilogueBegin';
	}
	| {
		type: 'setFile';
		name: undefined | string;
	}
	| {
		type: 'special';
		value: number;
	}
;

type DalvikExecutableDebugByteCode = DalvikExecutableDebugByteCodeValue[];

export type DalvikExecutableDebugInfo = {
	lineStart: number;
	parameterNames: (undefined | string)[];
	bytecode: DalvikExecutableDebugByteCode;
};

type DalvikExecutableAnnotationItemVisibility =
	| 'build'
	| 'runtime'
	| 'system'
;

type DalvikExecutableAnnotationElement = {
	name: string;
	value: DalvikExecutableEncodedValue | (DalvikExecutableEncodedValue | string)[];
};

export type DalvikExecutableAnnotation = {
	visibility: DalvikExecutableAnnotationItemVisibility;
	type: string;
	elements: DalvikExecutableAnnotationElement[];
}

export type DalvikExecutablePrototype = {
	shorty: string;
	returnType: string;
	parameters: string[];
};

export type DalvikExecutableField = {
	class: string;
	type: string;
	name: string;
};

export function isDalvikExecutableField(x: unknown): x is DalvikExecutableField {
	return (
		x !== null
			&& typeof x === 'object'
			&& 'class' in x
			&& 'type' in x
			&& 'name' in x
			&& typeof (x as DalvikExecutableField).class === 'string'
			&& typeof (x as DalvikExecutableField).type === 'string'
			&& typeof (x as DalvikExecutableField).name === 'string'
	);
}

export function dalvikExecutableFieldEquals(a: DalvikExecutableField, b: DalvikExecutableField): boolean {
	return (
		a.class === b.class
			&& a.type === b.type
			&& a.name === b.name
	);
}

export type DalvikExecutableFieldWithAccess = {
	field: DalvikExecutableField;
	accessFlags: DalvikExecutableAccessFlags;
};

export type DalvikExecutableMethod = {
	class: string;
	prototype: DalvikExecutablePrototype;
	name: string;
};

export function isDalvikExecutableMethod(x: unknown): x is DalvikExecutableMethod {
	return (
		x !== null
			&& typeof x === 'object'
			&& 'class' in x
			&& 'prototype' in x
			&& 'name' in x
			&& typeof (x as DalvikExecutableMethod).class === 'string'
			&& typeof (x as DalvikExecutableMethod).prototype === 'object'
			&& typeof (x as DalvikExecutableMethod).name === 'string'
	);
}

export function dalvikExecutableMethodEquals(a: DalvikExecutableMethod, b: DalvikExecutableMethod): boolean {
	return (
		a.class === b.class
			&& a.name === b.name
			&& a.prototype.shorty === b.prototype.shorty
			&& a.prototype.returnType === b.prototype.returnType
			&& a.prototype.parameters.length === b.prototype.parameters.length
			&& a.prototype.parameters.every((v, i) => v === b.prototype.parameters[i])
	);
}

export type DalvikExecutableMethodWithAccess<Instructions> = {
	method: DalvikExecutableMethod;
	accessFlags: DalvikExecutableAccessFlags;
	code: undefined | DalvikExecutableCode<Instructions>;
};

export type DalvikExecutableClassFieldAnnotation = {
	field: DalvikExecutableField;
	annotations: undefined | DalvikExecutableAnnotation[];
};

export type DalvikExecutableClassMethodAnnotation = {
	method: DalvikExecutableMethod;
	annotations: DalvikExecutableAnnotation[];
};

export type DalvikExecutableClassParameterAnnotation = {
	method: DalvikExecutableMethod;
	annotations: DalvikExecutableAnnotation[][];
};

export type DalvikExecutableClassAnnotations = {
	classAnnotations: DalvikExecutableAnnotation[];
	fieldAnnotations: DalvikExecutableClassFieldAnnotation[];
	methodAnnotations: DalvikExecutableClassMethodAnnotation[];
	parameterAnnotations: DalvikExecutableClassParameterAnnotation[];
};

export type DalvikExecutableClassData<Instructions> = {
	staticFields: DalvikExecutableFieldWithAccess[];
	instanceFields: DalvikExecutableFieldWithAccess[];
	directMethods: DalvikExecutableMethodWithAccess<Instructions>[];
	virtualMethods: DalvikExecutableMethodWithAccess<Instructions>[];
};

export type DalvikExecutableClassDefinition<Instructions> = {
	class: string;
	accessFlags: DalvikExecutableAccessFlags,
	superclass: string;
	interfaces: string[];
	sourceFile: undefined | string;
	annotations: undefined | DalvikExecutableClassAnnotations;
	staticValues: DalvikExecutableEncodedValue[];
	classData: undefined | DalvikExecutableClassData<Instructions>;
};

export type DalvikExecutable<Instructions> = {
	classDefinitions: DalvikExecutableClassDefinition<Instructions>[];
	link: undefined | Uint8Array,
};
