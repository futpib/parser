
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
	value: DalvikExecutableEncodedValue;
};

export type DalvikExecutableAnnotation = {
	visibility: DalvikExecutableAnnotationItemVisibility;
	type: string;
	elements: DalvikExecutableAnnotationElement[];
}

type DalvikExecutablePrototype = {
	shorty: string;
	returnType: string;
	parameters: string[];
};

type DalvikExecutableField = {
	class: string;
	type: string;
	name: string;
};

type DalvikExecutableFieldWithAccess = {
	field: DalvikExecutableField;
	accessFlags: DalvikExecutableAccessFlags;
};

type DalvikExecutableMethod = {
	class: string;
	prototype: DalvikExecutablePrototype;
	name: string;
};

type DalvikExecutableMethodWithAccess<Instructions> = {
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
	annotations: undefined | DalvikExecutableAnnotation[];
};

export type DalvikExecutableClassParameterAnnotation = {
	method: DalvikExecutableMethod;
	annotations: undefined | (undefined | DalvikExecutableAnnotation[])[];
};

export type DalvikExecutableClassAnnotations = {
	classAnnotations: undefined | DalvikExecutableAnnotation[];
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
