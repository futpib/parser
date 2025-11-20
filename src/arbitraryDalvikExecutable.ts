import * as fc from 'fast-check';
import {
	type DalvikExecutable,
	type DalvikExecutableClassDefinition,
	type DalvikExecutableAccessFlags,
	type DalvikExecutableClassData,
	type DalvikExecutableField,
	type DalvikExecutableFieldWithAccess,
	type DalvikExecutableMethod,
	type DalvikExecutableMethodWithAccess,
	type DalvikExecutablePrototype,
	type DalvikExecutableCode,
	type DalvikExecutableDebugInfo,
	type DalvikExecutableAnnotation,
	type DalvikExecutableClassAnnotations,
	type DalvikExecutableClassFieldAnnotation,
	type DalvikExecutableClassMethodAnnotation,
	type DalvikExecutableClassParameterAnnotation,
	type DalvikExecutableEncodedValue,
} from './dalvikExecutable.js';

// Local type definitions for non-exported types

type DalvikExecutableAnnotationItemVisibility = 'build' | 'runtime' | 'system';

type DalvikExecutableAnnotationElement = {
	name: string;
	value: DalvikExecutableEncodedValue;
};

type DalvikExecutableDebugByteCodeValue =
	| { type: 'advancePc'; addressDiff: number }
	| { type: 'advanceLine'; lineDiff: number }
	| { type: 'startLocal'; registerNum: number; name: undefined | string; type_: undefined | string }
	| { type: 'startLocalExtended'; registerNum: number; name: undefined | string; type_: undefined | string; signature: undefined | string }
	| { type: 'endLocal'; registerNum: number }
	| { type: 'restartLocal'; registerNum: number }
	| { type: 'setPrologueEnd' }
	| { type: 'setEpilogueBegin' }
	| { type: 'setFile'; name: undefined | string }
	| { type: 'special'; value: number };

// String generators for valid Dalvik identifiers and type descriptors

const arbitraryJavaIdentifier = fc.stringMatching(/^[a-zA-Z_][a-zA-Z0-9_]*$/);

const arbitraryPrimitiveType = fc.oneof(
	fc.constant('V'), // void
	fc.constant('Z'), // boolean
	fc.constant('B'), // byte
	fc.constant('S'), // short
	fc.constant('C'), // char
	fc.constant('I'), // int
	fc.constant('J'), // long
	fc.constant('F'), // float
	fc.constant('D'), // double
);

const arbitraryDalvikClassName: fc.Arbitrary<string> = fc.tuple(
	fc.array(arbitraryJavaIdentifier, { minLength: 1, maxLength: 3 }),
	arbitraryJavaIdentifier,
).map(([packages, className]) => `L${packages.join('/')}/${className};`);

const arbitraryDalvikTypeName: fc.Arbitrary<string> = fc.oneof(
	arbitraryPrimitiveType,
	arbitraryDalvikClassName,
	arbitraryPrimitiveType.map(p => `[${p}`), // array of primitive
	arbitraryDalvikClassName.map(c => `[${c}`), // array of object
);

const arbitraryDalvikMethodName = fc.oneof(
	arbitraryJavaIdentifier,
	fc.constant('<init>'),
	fc.constant('<clinit>'),
);

const arbitraryDalvikFieldName = arbitraryJavaIdentifier;

// Access flags generator - common flags for all contexts
const arbitraryDalvikExecutableAccessFlagsCommon: fc.Arbitrary<DalvikExecutableAccessFlags> = fc.record({
	public: fc.boolean(),
	private: fc.boolean(),
	protected: fc.boolean(),
	static: fc.boolean(),
	final: fc.boolean(),
	synchronized: fc.boolean(),
	volatile: fc.constant(false),
	bridge: fc.constant(false),
	transient: fc.constant(false),
	varargs: fc.constant(false),
	native: fc.boolean(),
	interface: fc.boolean(),
	abstract: fc.boolean(),
	strict: fc.boolean(),
	synthetic: fc.boolean(),
	annotation: fc.boolean(),
	enum: fc.boolean(),
	constructor: fc.boolean(),
	declaredSynchronized: fc.boolean(),
});

// Access flags for fields - volatile and transient are valid (0x40 and 0x80)
const arbitraryDalvikExecutableFieldAccessFlags: fc.Arbitrary<DalvikExecutableAccessFlags> = fc.record({
	public: fc.boolean(),
	private: fc.boolean(),
	protected: fc.boolean(),
	static: fc.boolean(),
	final: fc.boolean(),
	synchronized: fc.boolean(),
	volatile: fc.boolean(),
	bridge: fc.constant(false),
	transient: fc.boolean(),
	varargs: fc.constant(false),
	native: fc.boolean(),
	interface: fc.boolean(),
	abstract: fc.boolean(),
	strict: fc.boolean(),
	synthetic: fc.boolean(),
	annotation: fc.boolean(),
	enum: fc.boolean(),
	constructor: fc.boolean(),
	declaredSynchronized: fc.boolean(),
});

// Access flags for methods - bridge and varargs are valid (0x40 and 0x80)
const arbitraryDalvikExecutableMethodAccessFlags: fc.Arbitrary<DalvikExecutableAccessFlags> = fc.record({
	public: fc.boolean(),
	private: fc.boolean(),
	protected: fc.boolean(),
	static: fc.boolean(),
	final: fc.boolean(),
	synchronized: fc.boolean(),
	volatile: fc.constant(false),
	bridge: fc.boolean(),
	transient: fc.constant(false),
	varargs: fc.boolean(),
	native: fc.boolean(),
	interface: fc.boolean(),
	abstract: fc.boolean(),
	strict: fc.boolean(),
	synthetic: fc.boolean(),
	annotation: fc.boolean(),
	enum: fc.boolean(),
	constructor: fc.boolean(),
	declaredSynchronized: fc.boolean(),
});

// Generic access flags for class-level (uses common)
const arbitraryDalvikExecutableAccessFlags: fc.Arbitrary<DalvikExecutableAccessFlags> = arbitraryDalvikExecutableAccessFlagsCommon;

// Field generator
const arbitraryDalvikExecutableField: fc.Arbitrary<DalvikExecutableField> = fc.record({
	class: arbitraryDalvikClassName,
	type: arbitraryDalvikTypeName,
	name: arbitraryDalvikFieldName,
});

const arbitraryDalvikExecutableFieldWithAccess: fc.Arbitrary<DalvikExecutableFieldWithAccess> = fc.record({
	field: arbitraryDalvikExecutableField,
	accessFlags: arbitraryDalvikExecutableFieldAccessFlags,
});

// Prototype generator
const arbitraryShorty: fc.Arbitrary<string> = fc.tuple(
	arbitraryPrimitiveType, // return type
	fc.array(fc.oneof(fc.constant('L'), arbitraryPrimitiveType), { maxLength: 5 }), // parameters
).map(([returnType, params]) => returnType + params.join(''));

const arbitraryDalvikExecutablePrototype: fc.Arbitrary<DalvikExecutablePrototype> = arbitraryShorty.chain(shorty => {
	const returnTypeChar = shorty[0];
	const paramChars = shorty.slice(1).split('');

	const returnType = returnTypeChar === 'L' ? arbitraryDalvikClassName : fc.constant(returnTypeChar);
	const parameters = fc.tuple(
		...paramChars.map(char => char === 'L' ? arbitraryDalvikClassName : fc.constant(char))
	);

	return fc.record({
		shorty: fc.constant(shorty),
		returnType,
		parameters,
	});
});

// Method generator
const arbitraryDalvikExecutableMethod: fc.Arbitrary<DalvikExecutableMethod> = fc.record({
	class: arbitraryDalvikClassName,
	prototype: arbitraryDalvikExecutablePrototype,
	name: arbitraryDalvikMethodName,
});

// Encoded value generator (recursive)
// DalvikExecutableEncodedValue is now a tagged union with type information
const arbitraryDalvikExecutableEncodedValue: fc.Arbitrary<DalvikExecutableEncodedValue> = fc.letrec(tie => ({
	value: fc.oneof(
		fc.record({ type: fc.constant('byte' as const), value: fc.integer({ min: -128, max: 127 }) }),
		fc.record({ type: fc.constant('short' as const), value: fc.integer({ min: -32768, max: 32767 }) }),
		fc.record({ type: fc.constant('char' as const), value: fc.integer({ min: 0, max: 65535 }) }),
		fc.record({ type: fc.constant('int' as const), value: fc.integer({ min: -2147483648, max: 2147483647 }) }),
		fc.record({ type: fc.constant('long' as const), value: fc.bigInt({ min: -9223372036854775808n, max: 9223372036854775807n }) }),
		fc.record({ type: fc.constant('float' as const), value: fc.float() }),
		fc.record({ type: fc.constant('double' as const), value: fc.double() }),
		fc.record({ type: fc.constant('methodType' as const), value: arbitraryDalvikExecutablePrototype }),
		fc.record({ type: fc.constant('methodHandle' as const), value: fc.nat(255) }),
		fc.record({ type: fc.constant('string' as const), value: fc.string() }),
		fc.record({ type: fc.constant('type' as const), value: arbitraryDalvikClassName }),
		fc.record({ type: fc.constant('field' as const), value: arbitraryDalvikExecutableField }),
		fc.record({ type: fc.constant('method' as const), value: arbitraryDalvikExecutableMethod }),
		fc.record({ type: fc.constant('enum' as const), value: arbitraryDalvikExecutableField }),
		fc.record({ type: fc.constant('array' as const), value: fc.array(tie('value') as fc.Arbitrary<DalvikExecutableEncodedValue>, { maxLength: 3 }) }),
		// Note: We skip 'annotation' type here to avoid deep recursion complexity
		fc.record({ type: fc.constant('null' as const), value: fc.constant(null) }),
		fc.record({ type: fc.constant('boolean' as const), value: fc.boolean() }),
	),
})).value;

// Annotation generators
const arbitraryAnnotationVisibility: fc.Arbitrary<DalvikExecutableAnnotationItemVisibility> = fc.oneof(
	fc.constant('build' as const),
	fc.constant('runtime' as const),
	fc.constant('system' as const),
);

const arbitraryDalvikExecutableAnnotationElement: fc.Arbitrary<DalvikExecutableAnnotationElement> = fc.record({
	name: arbitraryJavaIdentifier,
	value: arbitraryDalvikExecutableEncodedValue,
});

const arbitraryDalvikExecutableAnnotation: fc.Arbitrary<DalvikExecutableAnnotation> = fc.record({
	visibility: arbitraryAnnotationVisibility,
	type: arbitraryDalvikClassName,
	elements: fc.array(arbitraryDalvikExecutableAnnotationElement, { maxLength: 3 }),
});

// Debug info generators
const arbitraryDalvikExecutableDebugByteCodeValue: fc.Arbitrary<DalvikExecutableDebugByteCodeValue> = fc.oneof(
	fc.record({
		type: fc.constant('advancePc' as const),
		addressDiff: fc.nat({ max: 255 }),
	}),
	fc.record({
		type: fc.constant('advanceLine' as const),
		lineDiff: fc.integer({ min: -128, max: 127 }),
	}),
	fc.record({
		type: fc.constant('startLocal' as const),
		registerNum: fc.nat({ max: 255 }),
		name: fc.option(arbitraryJavaIdentifier, { nil: undefined }),
		type_: fc.option(arbitraryDalvikTypeName, { nil: undefined }),
	}),
	fc.record({
		type: fc.constant('startLocalExtended' as const),
		registerNum: fc.nat({ max: 255 }),
		name: fc.option(arbitraryJavaIdentifier, { nil: undefined }),
		type_: fc.option(arbitraryDalvikTypeName, { nil: undefined }),
		signature: fc.option(fc.string(), { nil: undefined }),
	}),
	fc.record({
		type: fc.constant('endLocal' as const),
		registerNum: fc.nat({ max: 255 }),
	}),
	fc.record({
		type: fc.constant('restartLocal' as const),
		registerNum: fc.nat({ max: 255 }),
	}),
	fc.record({
		type: fc.constant('setPrologueEnd' as const),
	}),
	fc.record({
		type: fc.constant('setEpilogueBegin' as const),
	}),
	fc.record({
		type: fc.constant('setFile' as const),
		name: fc.option(fc.string(), { nil: undefined }),
	}),
	fc.record({
		type: fc.constant('special' as const),
		// Special opcodes must be >= 0x0A (values 0x00-0x09 are specific debug opcodes)
		value: fc.integer({ min: 0x0A, max: 255 }),
	}),
);

const arbitraryDalvikExecutableDebugInfo: fc.Arbitrary<DalvikExecutableDebugInfo> = fc.record({
	lineStart: fc.nat({ max: 65535 }),
	parameterNames: fc.array(fc.option(arbitraryJavaIdentifier, { nil: undefined }), { maxLength: 5 }),
	bytecode: fc.array(arbitraryDalvikExecutableDebugByteCodeValue, { maxLength: 10 }),
});

// Try-catch handler generators
interface DalvikExecutableTry {
	startAddress: number;
	instructionCount: number;
	handler: DalvikExecutableEncodedCatchHandler;
}

interface DalvikExecutableEncodedCatchHandler {
	handlers: DalvikExecutableEncodedTypeAddressPair[];
	catchAllAddress: undefined | number;
}

interface DalvikExecutableEncodedTypeAddressPair {
	type: string;
	address: number;
}

const arbitraryDalvikExecutableEncodedTypeAddressPair: fc.Arbitrary<DalvikExecutableEncodedTypeAddressPair> = fc.record({
	type: arbitraryDalvikClassName,
	address: fc.nat({ max: 65535 }),
});

const arbitraryDalvikExecutableEncodedCatchHandler: fc.Arbitrary<DalvikExecutableEncodedCatchHandler> = fc.record({
	handlers: fc.array(arbitraryDalvikExecutableEncodedTypeAddressPair, { maxLength: 3 }),
	catchAllAddress: fc.option(fc.nat({ max: 65535 }), { nil: undefined }),
});

const arbitraryDalvikExecutableTry: fc.Arbitrary<DalvikExecutableTry> = fc.record({
	startAddress: fc.nat({ max: 65535 }),
	instructionCount: fc.nat({ max: 255 }),
	handler: arbitraryDalvikExecutableEncodedCatchHandler,
});

// Generic factory function for DalvikExecutable
export const createArbitraryDalvikExecutable = <Instructions>(
	arbitraryInstructions: fc.Arbitrary<Instructions>,
): fc.Arbitrary<DalvikExecutable<Instructions>> => {
	// Code generator using provided instructions arbitrary
	const arbitraryDalvikExecutableCode: fc.Arbitrary<DalvikExecutableCode<Instructions>> = fc.record({
		registersSize: fc.nat({ max: 65535 }),
		insSize: fc.nat({ max: 255 }),
		outsSize: fc.nat({ max: 255 }),
		debugInfo: fc.option(arbitraryDalvikExecutableDebugInfo, { nil: undefined }),
		instructions: arbitraryInstructions,
		tries: fc.array(arbitraryDalvikExecutableTry, { maxLength: 2 }),
	});

	// Method with access and code
	const arbitraryDalvikExecutableMethodWithAccess: fc.Arbitrary<DalvikExecutableMethodWithAccess<Instructions>> = fc.record({
		method: arbitraryDalvikExecutableMethod,
		accessFlags: arbitraryDalvikExecutableMethodAccessFlags,
		code: fc.option(arbitraryDalvikExecutableCode, { nil: undefined }),
	});

	// Annotation collections
	const arbitraryDalvikExecutableClassFieldAnnotation: fc.Arbitrary<DalvikExecutableClassFieldAnnotation> = fc.record({
		field: arbitraryDalvikExecutableField,
		annotations: fc.option(fc.array(arbitraryDalvikExecutableAnnotation, { maxLength: 2 }), { nil: undefined }),
	});

	const arbitraryDalvikExecutableClassMethodAnnotation: fc.Arbitrary<DalvikExecutableClassMethodAnnotation> = fc.record({
		method: arbitraryDalvikExecutableMethod,
		annotations: fc.array(arbitraryDalvikExecutableAnnotation, { maxLength: 2 }),
	});

	const arbitraryDalvikExecutableClassParameterAnnotation: fc.Arbitrary<DalvikExecutableClassParameterAnnotation> = fc.record({
		method: arbitraryDalvikExecutableMethod,
		annotations: fc.array(
			fc.array(arbitraryDalvikExecutableAnnotation, { maxLength: 2 }),
			{ maxLength: 3 }
		),
	});

	const arbitraryDalvikExecutableClassAnnotations: fc.Arbitrary<DalvikExecutableClassAnnotations> = fc.record({
		classAnnotations: fc.array(arbitraryDalvikExecutableAnnotation, { maxLength: 2 }),
		fieldAnnotations: fc.array(arbitraryDalvikExecutableClassFieldAnnotation, { maxLength: 2 }),
		methodAnnotations: fc.array(arbitraryDalvikExecutableClassMethodAnnotation, { maxLength: 2 }),
		parameterAnnotations: fc.array(arbitraryDalvikExecutableClassParameterAnnotation, { maxLength: 2 }),
	}).map(annotations => ({
		...annotations,
		// Filter out field/method/parameter annotations with undefined or empty annotations array
		// In DEX format, fields/methods/parameters with no annotations should not appear in the annotations directory at all
		fieldAnnotations: annotations.fieldAnnotations.filter(fa => fa.annotations !== undefined && fa.annotations.length > 0),
		methodAnnotations: annotations.methodAnnotations.filter(ma => ma.annotations.length > 0),
		parameterAnnotations: annotations.parameterAnnotations.filter(pa => pa.annotations.length > 0 && pa.annotations.some(paramAnnots => paramAnnots.length > 0)),
	}));

	// Class data
	const arbitraryDalvikExecutableClassData: fc.Arbitrary<DalvikExecutableClassData<Instructions>> = fc.record({
		staticFields: fc.array(arbitraryDalvikExecutableFieldWithAccess, { maxLength: 3 }),
		instanceFields: fc.array(arbitraryDalvikExecutableFieldWithAccess, { maxLength: 3 }),
		directMethods: fc.array(arbitraryDalvikExecutableMethodWithAccess, { maxLength: 3 }),
		virtualMethods: fc.array(arbitraryDalvikExecutableMethodWithAccess, { maxLength: 3 }),
	}).filter(classData => 
		// Filter out empty classData (all arrays empty) as it's semantically equivalent to undefined
		classData.staticFields.length > 0 ||
		classData.instanceFields.length > 0 ||
		classData.directMethods.length > 0 ||
		classData.virtualMethods.length > 0
	);

	// Class definition
	const arbitraryDalvikExecutableClassDefinition: fc.Arbitrary<DalvikExecutableClassDefinition<Instructions>> = fc.record({
		class: arbitraryDalvikClassName,
		accessFlags: arbitraryDalvikExecutableAccessFlags,
		superclass: arbitraryDalvikClassName,
		interfaces: fc.array(arbitraryDalvikClassName, { maxLength: 3 }),
		sourceFile: fc.option(fc.stringMatching(/^[a-zA-Z0-9_]+\.java$/), { nil: undefined }),
		annotations: fc.option(arbitraryDalvikExecutableClassAnnotations, { nil: undefined }),
		staticValues: fc.array(arbitraryDalvikExecutableEncodedValue, { maxLength: 3 }),
		classData: fc.option(arbitraryDalvikExecutableClassData, { nil: undefined }),
	}).map(classDef => {
		// Match parser logic: if all members are synthetic, set class synthetic to true
		const allMembers = [
			...classDef.classData?.staticFields ?? [],
			...classDef.classData?.instanceFields ?? [],
			...classDef.classData?.directMethods ?? [],
			// Note: virtualMethods are not included to match parser behavior
		];
		const allMembersAreSynthetic = (
			allMembers.every(member => member.accessFlags.synthetic)
			&& allMembers.length > 0
		);

		if (allMembersAreSynthetic) {
			return {
				...classDef,
				accessFlags: {
					...classDef.accessFlags,
					synthetic: true,
				},
			};
		}

		return classDef;
	});

	// Root DalvikExecutable
	return fc.record({
		classDefinitions: fc.array(arbitraryDalvikExecutableClassDefinition, { minLength: 1, maxLength: 3 }),
		link: fc.option(fc.uint8Array({ minLength: 1, maxLength: 10 }), { nil: undefined }),
	});
};
