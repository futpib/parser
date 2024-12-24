import invariant from 'invariant';
import { MUtf8Decoder } from "mutf-8";
import { createElementParser } from './elementParser.js';
import { createExactElementParser } from './exactElementParser.js';
import { createExactSequenceParser } from './exactSequenceParser.js';
import { createFixedLengthSequenceParser } from './fixedLengthSequenceParser.js';
import { runParser, type Parser } from './parser.js';
import { parserCreatorCompose } from './parserCreatorCompose.js';
import { promiseCompose } from './promiseCompose.js';
import { createQuantifierParser } from './quantifierParser.js';
import { createTerminatedArrayParser } from './terminatedArrayParser.js';
import { createTupleParser } from './tupleParser.js';
import { uint8ArrayParserInputCompanion } from './parserInputCompanion.js';
import { createUnionParser } from './unionParser.js';
import { createParserAccessorParser } from './parserAccessorParser.js';

// https://source.android.com/docs/core/runtime/dex-format

const ubyteParser: Parser<number, Uint8Array> = createExactElementParser(1);

const byteParser: Parser<number, Uint8Array> = promiseCompose(
	ubyteParser,
	(ubyte) => ubyte > 127 ? ubyte - 256 : ubyte,
);

const shortParser: Parser<number, Uint8Array> = promiseCompose(
	createFixedLengthSequenceParser<Uint8Array>(2),
	(uint8Array) => {
		const buffer = Buffer.from(uint8Array);
		return buffer.readInt16LE(0);
	},
);

const ushortParser: Parser<number, Uint8Array> = promiseCompose(
	createFixedLengthSequenceParser<Uint8Array>(2),
	(uint8Array) => {
		const buffer = Buffer.from(uint8Array);
		return buffer.readUInt16LE(0);
	},
);

const intParser: Parser<number, Uint8Array> = promiseCompose(
	createFixedLengthSequenceParser<Uint8Array>(4),
	(uint8Array) => {
		const buffer = Buffer.from(uint8Array);
		return buffer.readInt32LE(0);
	},
);

const uintParser: Parser<number, Uint8Array> = promiseCompose(
	createFixedLengthSequenceParser<Uint8Array>(4),
	(uint8Array) => {
		const buffer = Buffer.from(uint8Array);
		return buffer.readUInt32LE(0);
	},
);

const longParser: Parser<bigint, Uint8Array> = promiseCompose(
	createFixedLengthSequenceParser<Uint8Array>(8),
	(uint8Array) => {
		const buffer = Buffer.from(uint8Array);
		return buffer.readBigInt64LE(0);
	},
);

const ulongParser: Parser<bigint, Uint8Array> = promiseCompose(
	createFixedLengthSequenceParser<Uint8Array>(8),
	(uint8Array) => {
		const buffer = Buffer.from(uint8Array);
		return buffer.readBigUInt64LE(0);
	},
);

export const sleb128Parser: Parser<number, Uint8Array> = async (parserContext) => {
	let value = 0;
	let leastSignificantValueBitIndex = 0;

	while (true) {
		const byte = await parserContext.read(0);
		const byteValue = byte & 0b01111111;
		const byteNotLast = byte & 0b10000000;

		value |= byteValue << leastSignificantValueBitIndex;

		if (byteNotLast) {
			leastSignificantValueBitIndex += 7;
			continue;
		}

		const mostSignificantInputBit = byte & 0b01000000;

		if (mostSignificantInputBit) {
			const mostSignificantValueBit = 1 << (leastSignificantValueBitIndex + 1);
			const mask = mostSignificantValueBit - 1;
			value |= -mostSignificantValueBit | (value & mask);
		}

		break;
	}

	return value;
};

export const uleb128Parser: Parser<number, Uint8Array> = async (parserContext) => {
	let leastSignificantValueBitIndex = 0;
	let value = 0;

	while (true) {
		const byte = await parserContext.read(0);
		const byteValue = byte & 0b01111111;
		const byteNotLast = byte & 0b10000000;

		value |= byteValue << leastSignificantValueBitIndex;

		if (byteNotLast) {
			leastSignificantValueBitIndex += 7;
			continue;
		}

		break;
	}

	return value;
}

export const uleb128p1Parser: Parser<number, Uint8Array> = async (parserContext) => {
	const value = await uleb128Parser(parserContext);
	return value - 1;
}

const dexHeaderVersionParser: Parser<number, Uint8Array> = promiseCompose(
	createTupleParser([
		createExactSequenceParser<Uint8Array>(Buffer.from('dex\n', 'utf8')),
		createFixedLengthSequenceParser(3),
		createExactElementParser(0),
	]),
	([ _magic1, versionUint8Array, _magic2 ]) => {
		const versionBuffer = Buffer.from(versionUint8Array);
		const versionString = versionBuffer.toString('utf8');
		const version = Number.parseInt(versionString, 10);
		return version;
	},
);

type SizeOffset = {
	size: number,
	offset: number,
};

const sizeOffsetParser: Parser<SizeOffset, Uint8Array> = promiseCompose(
	createTupleParser([
		uintParser,
		uintParser,
	]),
	([ size, offset ]) => ({ size, offset }),
);

type DexHeader = {
	version: number,
	checksum: number,
	sha1Hash: Uint8Array,
	fileSize: number,
	headerSize: number,
	endianTag: number,
	link: SizeOffset,
	mapOffset: number,
	stringIds: SizeOffset,
	typeIds: SizeOffset,
	protoIds: SizeOffset,
	fieldIds: SizeOffset,
	methodIds: SizeOffset,
	classDefinitions: SizeOffset,
	data: SizeOffset,
};

const dexHeaderParser: Parser<DexHeader, Uint8Array> = promiseCompose(
	createTupleParser([
		dexHeaderVersionParser,
		uintParser,
		createFixedLengthSequenceParser(20),
		uintParser,
		uintParser,
		uintParser,
		sizeOffsetParser,
		uintParser,
		sizeOffsetParser,
		sizeOffsetParser,
		sizeOffsetParser,
		sizeOffsetParser,
		sizeOffsetParser,
		sizeOffsetParser,
		sizeOffsetParser,
	]),
	([
		version,
		checksum,
		sha1Hash,
		fileSize,
		headerSize,
		endianTag,
		link,
		mapOffset,
		stringIds,
		typeIds,
		protoIds,
		fieldIds,
		methodIds,
		classDefinitions,
		data,
	]) => ({
		version,
		checksum,
		sha1Hash,
		fileSize,
		headerSize,
		endianTag,
		link,
		mapOffset,
		stringIds,
		typeIds,
		protoIds,
		fieldIds,
		methodIds,
		classDefinitions,
		data,
	}),
);

const createSkipToParser = (offset: number): Parser<void, Uint8Array> => async (parserContext) => {
	parserContext.skip(offset - parserContext.position);
};

const createStringIdsParser = ({ size, offset }: SizeOffset): Parser<number[], Uint8Array> => (
	size === 0
		? (async () => [])
		: promiseCompose(
			createTupleParser([
				createSkipToParser(offset),
				createQuantifierParser(
					uintParser,
					size,
				),
			]),
			([ _, stringIds ]) => stringIds,
		)
);

const createTypeIdsParser = createStringIdsParser;

type DexProtoIdItem = {
	shortyIndex: number,
	returnTypeIndex: number,
	parametersOffset: number,
};

const createProtoIdsParser = ({ size, offset }: SizeOffset): Parser<DexProtoIdItem[], Uint8Array> => (
	size === 0
		? (async () => [])
		: promiseCompose(
			createTupleParser([
				createSkipToParser(offset),
				createQuantifierParser(
					promiseCompose(
						createTupleParser([
							uintParser,
							uintParser,
							uintParser,
						]),
						([ shortyIndex, returnTypeIndex, parametersOffset ]): DexProtoIdItem => ({
							shortyIndex,
							returnTypeIndex,
							parametersOffset,
						}),
					),
					size,
				),
			]),
			([ _, protoIds ]) => protoIds,
		)
);

type DexFieldIdItem = {
	classIndex: number,
	typeIndex: number,
	nameIndex: number,
};

const createFieldIdsParser = ({ size, offset }: SizeOffset): Parser<DexFieldIdItem[], Uint8Array> => (
	size === 0
		? (async () => [])
		: promiseCompose(
			createTupleParser([
				createSkipToParser(offset),
				createQuantifierParser(
					promiseCompose(
						createTupleParser([
							ushortParser,
							ushortParser,
							uintParser,
						]),
						([ classIndex, typeIndex, nameIndex ]): DexFieldIdItem => ({
							classIndex,
							typeIndex,
							nameIndex,
						}),
					),
					size,
				),
			]),
			([ _, fieldIds ]) => fieldIds,
		)
);

type DexMethodIdItem = {
	classIndex: number,
	protoIndex: number,
	nameIndex: number,
};

const createMethodIdsParser = ({ size, offset }: SizeOffset): Parser<DexMethodIdItem[], Uint8Array> => (
	size === 0
		? (async () => [])
		: promiseCompose(
			createTupleParser([
				createSkipToParser(offset),
				createQuantifierParser(
					promiseCompose(
						createTupleParser([
							ushortParser,
							ushortParser,
							uintParser,
						]),
						([ classIndex, protoIndex, nameIndex ]): DexMethodIdItem => ({
							classIndex,
							protoIndex,
							nameIndex,
						}),
					),
					size,
				),
			]),
			([ _, methodIds ]) => methodIds,
		)
);

type DexAccessFlags = {
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

const uintAccessFlagsParser: Parser<DexAccessFlags, Uint8Array> = promiseCompose(
	uintParser,
	(flags) => ({
		public: Boolean(flags & 0b00000001),
		private: Boolean(flags & 0b00000010),
		protected: Boolean(flags & 0b00000100),
		static: Boolean(flags & 0b00001000),
		final: Boolean(flags & 0b00010000),
		synchronized: Boolean(flags & 0b00100000),
		volatile: Boolean(flags & 0b01000000),
		bridge: Boolean(flags & 0b01000000),
		transient: Boolean(flags & 0b10000000),
		varargs: Boolean(flags & 0b10000000),
		native: false,
		interface: false,
		abstract: false,
		strict: false,
		synthetic: false,
		annotation: false,
		enum: false,
		constructor: false,
		declaredSynchronized: false,
	}),
);

const uleb128AccessFlagsParser: Parser<DexAccessFlags, Uint8Array> = promiseCompose(
	uleb128Parser,
	flags => ({
		public: Boolean(flags & 0b00000001),
		private: Boolean(flags & 0b00000010),
		protected: Boolean(flags & 0b00000100),
		static: Boolean(flags & 0b00001000),
		final: Boolean(flags & 0b00010000),
		synchronized: Boolean(flags & 0b00100000),
		volatile: Boolean(flags & 0b01000000),
		bridge: Boolean(flags & 0b01000000),
		transient: Boolean(flags & 0b10000000),
		varargs: Boolean(flags & 0b10000000),
		native: Boolean(flags & 0b00000001_00000000),
		interface: Boolean(flags & 0b00000010_00000000),
		abstract: Boolean(flags & 0b00000100_00000000),
		strict: Boolean(flags & 0b00001000_00000000),
		synthetic: Boolean(flags & 0b00010000_00000000),
		annotation: Boolean(flags & 0b00100000_00000000),
		enum: Boolean(flags & 0b01000000_00000000),
		constructor: Boolean(flags & 0b00000001_00000000_00000000),
		declaredSynchronized: Boolean(flags & 0b00000010_00000000_00000000),
	}),
);

type DexClassDefItem = {
	classIndex: number,
	accessFlags: DexAccessFlags,
	superclassIndex: number,
	interfacesOffset: number,
	sourceFileIndex: number,
	annotationsOffset: number,
	classDataOffset: number,
	staticValuesOffset: number,
};

const createClassDefinitionsParser = ({ size, offset }: SizeOffset): Parser<DexClassDefItem[], Uint8Array> => (
	size === 0
		? (async () => [])
		: promiseCompose(
			createTupleParser([
				createSkipToParser(offset),
				createQuantifierParser(
					promiseCompose(
						createTupleParser([
							uintParser,
							uintAccessFlagsParser,
							uintParser,
							uintParser,
							uintParser,
							uintParser,
							uintParser,
							uintParser,
						]),
						([
							classIndex,
							accessFlags,
							superclassIndex,
							interfacesOffset,
							sourceFileIndex,
							annotationsOffset,
							classDataOffset,
							staticValuesOffset,
						]): DexClassDefItem => ({
							classIndex,
							accessFlags,
							superclassIndex,
							interfacesOffset,
							sourceFileIndex,
							annotationsOffset,
							classDataOffset,
							staticValuesOffset,
						}),
					),
					size,
				),
			]),
			([ _, classDefinitions ]) => classDefinitions,
		)
);

const createDataParser = ({ size, offset }: SizeOffset): Parser<undefined | Uint8Array, Uint8Array> => (
	size === 0
		? (async () => undefined)
		: promiseCompose(
			createTupleParser([
				createSkipToParser(offset),
				createFixedLengthSequenceParser(size),
			]),
			([ _, data ]) => data,
		)
);

const createByteAlignParser = (byteAlignment: number): Parser<void, Uint8Array> => async (parserContext) => {
	parserContext.skip(parserContext.position % byteAlignment);
};

const byteAlign4Parser: Parser<void, Uint8Array> = createByteAlignParser(4);

const nullByteParser: Parser<number, Uint8Array> = createExactElementParser(0);
const nonNullByteParser: Parser<number, Uint8Array> = parserCreatorCompose(
	createElementParser,
	byte => async parserContext => {
		parserContext.invariant(byte !== 0, 'Unexpected null byte');
		return byte;
	},
)();

type DexStringDataItem = {
	utf16Size: number,
	data: Uint8Array,
};

const createStringDataItemParser = (stringDataOffset: number): Parser<DexStringDataItem, Uint8Array> => promiseCompose(
	createTupleParser([
		createSkipToParser(stringDataOffset),
		uleb128Parser,
		promiseCompose(
			createTerminatedArrayParser(
				nonNullByteParser,
				nullByteParser,
			),
			([ stringData ]) => stringData,
		),
	]),
	([ _, utf16Size, data ]) => ({
		utf16Size,
		data: new Uint8Array(data),
	}),
);

const createStringParser = (stringDataOffset: number): Parser<string, Uint8Array> => promiseCompose(
	createStringDataItemParser(stringDataOffset),
	({ utf16Size, data }) => {
		const mutf8Decoder = new MUtf8Decoder();
		const string = mutf8Decoder.decode(data);
		invariant(string.length === utf16Size, 'String length mismatch. Expected: %d, actual: %d', utf16Size, string.length);
		return string;
	},
);

const createTypeListParser = (typeListOffset: number): Parser<number[], Uint8Array> => parserCreatorCompose(
	() => createTupleParser([
		createSkipToParser(typeListOffset),
		uintParser,
	]),
	([ _, size ]) => createQuantifierParser(
		ushortParser,
		size,
	),
)();

type DexFieldAnnotation = {
	fieldIndex: number,
	annotationsOffset: number,
};

const fieldAnnotationParser: Parser<DexFieldAnnotation, Uint8Array> = promiseCompose(
	createTupleParser([
		uleb128Parser,
		uleb128Parser,
	]),
	([ fieldIndex, annotationsOffset ]) => ({ fieldIndex, annotationsOffset }),
);

const createFieldAnnotationsParser = (fieldsSize: number): Parser<DexFieldAnnotation[], Uint8Array> => createQuantifierParser(
	fieldAnnotationParser,
	fieldsSize,
);

type DexMethodAnnotation = {
	methodIndex: number,
	annotationsOffset: number,
};

const methodAnnotationParser: Parser<DexMethodAnnotation, Uint8Array> = promiseCompose(
	createTupleParser([
		uintParser,
		uintParser,
	]),
	([ methodIndex, annotationsOffset ]) => ({ methodIndex, annotationsOffset }),
);

const createMethodAnnotationsParser = (methodsSize: number): Parser<DexMethodAnnotation[], Uint8Array> => createQuantifierParser(
	methodAnnotationParser,
	methodsSize,
);

type DexParameterAnnotation = {
	methodIndex: number,
	annotationsOffset: number,
};

const parameterAnnotationParser: Parser<DexParameterAnnotation, Uint8Array> = promiseCompose(
	createTupleParser([
		uintParser,
		uintParser,
	]),
	([ methodIndex, annotationsOffset ]) => ({ methodIndex, annotationsOffset }),
);

const createParameterAnnotationsParser = (parametersSize: number): Parser<DexParameterAnnotation[], Uint8Array> => createQuantifierParser(
	parameterAnnotationParser,
	parametersSize,
);

type DexAnnotationsDirectoryItem = {
	classAnnotationsOffset: number,
	fieldAnnotations: DexFieldAnnotation[],
	methodAnnotations: DexMethodAnnotation[],
	parameterAnnotations: DexParameterAnnotation[],
};

const createAnnotationsDirectoryItemParser = (annotationsDirectoryOffset: number): Parser<DexAnnotationsDirectoryItem, Uint8Array> => parserCreatorCompose(
	() => createTupleParser([
		createSkipToParser(annotationsDirectoryOffset),
		uintParser,
		uintParser,
		uintParser,
		uintParser,
	]),
	([
		_,
		classAnnotationsOffset,
		fieldsSize,
		annotatedMethodsSize,
		annotatedParametersSize,
	]) => promiseCompose(
		createTupleParser([
			async () => classAnnotationsOffset,
			createFieldAnnotationsParser(fieldsSize),
			createMethodAnnotationsParser(annotatedMethodsSize),
			createParameterAnnotationsParser(annotatedParametersSize),
		]),
		([
			classAnnotationsOffset,
			fieldAnnotations,
			methodAnnotations,
			parameterAnnotations,
		]) => ({
			classAnnotationsOffset,
			fieldAnnotations,
			methodAnnotations,
			parameterAnnotations,
		}),
	),
)();

type DexEncodedField = {
	fieldIndexDiff: number,
	accessFlags: DexAccessFlags,
};

const encodedFieldParser: Parser<DexEncodedField, Uint8Array> = promiseCompose(
	createTupleParser([
		uleb128Parser,
		uleb128AccessFlagsParser,
	]),
	([ fieldIndexDiff, accessFlags ]) => ({ fieldIndexDiff, accessFlags }),
);

type DexEncodedField_ = DexEncodedField & {
	fieldIndex: number,
};

const createEncodedFieldsParser = (fieldsSize: number): Parser<DexEncodedField_[], Uint8Array> => promiseCompose(
	createQuantifierParser(
		encodedFieldParser,
		fieldsSize,
	),
	(encodedFields) => {
		let previousFieldIndex = 0;
		return encodedFields.map(({ fieldIndexDiff, accessFlags }) => {
			previousFieldIndex += fieldIndexDiff;
			return { fieldIndex: previousFieldIndex, fieldIndexDiff, accessFlags };
		});
	},
);

type DexEncodedMethod = {
	methodIndexDiff: number,
	accessFlags: DexAccessFlags,
	codeOffset: number,
};

const encodedMethodParser: Parser<DexEncodedMethod, Uint8Array> = promiseCompose(
	createTupleParser([
		uleb128Parser,
		uleb128AccessFlagsParser,
		uleb128Parser,
	]),
	([ methodIndexDiff, accessFlags, codeOffset ]) => ({ methodIndexDiff, accessFlags, codeOffset }),
);

type DexEncodedMethod_ = DexEncodedMethod & {
	methodIndex: number,
};

const createEncodedMethodsParser = (methodsSize: number): Parser<DexEncodedMethod_[], Uint8Array> => promiseCompose(
	createQuantifierParser(
		encodedMethodParser,
		methodsSize,
	),
	(encodedMethods) => {
		let previousMethodIndex = 0;
		return encodedMethods.map(({ methodIndexDiff, accessFlags, codeOffset }) => {
			previousMethodIndex += methodIndexDiff;
			return { methodIndex: previousMethodIndex, methodIndexDiff, accessFlags, codeOffset };
		});
	},
);

type DexClassDataItem = {
	staticFields: DexEncodedField_[],
	instanceFields: DexEncodedField_[],
	directMethods: DexEncodedMethod_[],
	virtualMethods: DexEncodedMethod_[],
};

const createClassDataItemParser = (classDataOffset: number): Parser<DexClassDataItem, Uint8Array> => parserCreatorCompose(
	() => createTupleParser([
		createSkipToParser(classDataOffset),
		uleb128Parser,
		uleb128Parser,
		uleb128Parser,
		uleb128Parser,
	]),
	([
		_,
		staticFieldsSize,
		instanceFieldsSize,
		directMethodsSize,
		virtualMethodsSize,
	]) => promiseCompose(
		createTupleParser([
			createEncodedFieldsParser(staticFieldsSize),
			createEncodedFieldsParser(instanceFieldsSize),
			createEncodedMethodsParser(directMethodsSize),
			createEncodedMethodsParser(virtualMethodsSize),
		]),
		([
			staticFields,
			instanceFields,
			directMethods,
			virtualMethods,
		]) => ({
			staticFields,
			instanceFields,
			directMethods,
			virtualMethods,
		}),
	),
)();

const createByteWithSetBitsParser = (mask: number): Parser<number, Uint8Array> => async (parserContext) => {
	const byte = await parserContext.read(0);
	parserContext.invariant(
		(byte & mask) !== 0,
		'Expected bits set: %s, got: %s',
		mask.toString(2).padStart(8, '0'),
		byte.toString(2).padStart(8, '0'),
	);
	return byte;
};

const createEncodedValueArgParser = (valueType: number): Parser<number, Uint8Array> => promiseCompose(
	createByteWithSetBitsParser(valueType),
	(byte) => byte >> 5,
);

const encodedValueByteParser: Parser<number, Uint8Array> = promiseCompose(
	createTupleParser([
		createExactElementParser(0),
		ubyteParser,
	]),
	([ _, value ]) => value,
);

const encodedValueShortParser: Parser<number, Uint8Array> = parserCreatorCompose(
	() => createEncodedValueArgParser(0x02),
	size => {
		return invariant(false, 'TODO size: %s', size) as Parser<number, Uint8Array>;
	},
)();

const encodedValueCharParser: Parser<number, Uint8Array> = encodedValueShortParser; // TODO
const encodedValueIntParser: Parser<number, Uint8Array> = encodedValueShortParser; // TODO
const encodedValueLongParser: Parser<number, Uint8Array> = encodedValueShortParser; // TODO
const encodedValueFloatParser: Parser<number, Uint8Array> = encodedValueShortParser; // TODO
const encodedValueDoubleParser: Parser<number, Uint8Array> = encodedValueShortParser; // TODO
const encodedValueMethodTypeParser: Parser<number, Uint8Array> = encodedValueShortParser; // TODO
const encodedValueMethodHandleParser: Parser<number, Uint8Array> = encodedValueShortParser; // TODO
const encodedValueStringParser: Parser<number, Uint8Array> = encodedValueShortParser; // TODO
const encodedValueTypeParser: Parser<number, Uint8Array> = encodedValueShortParser; // TODO
const encodedValueFieldParser: Parser<number, Uint8Array> = encodedValueShortParser; // TODO
const encodedValueMethodParser: Parser<number, Uint8Array> = encodedValueShortParser; // TODO
const encodedValueEnumParser: Parser<number, Uint8Array> = encodedValueShortParser; // TODO

const encodedArrayParser: Parser<DexEncodedValue[], Uint8Array> = parserCreatorCompose(
	() => uleb128Parser,
	(size) => createQuantifierParser(
		encodedValueParser,
		size,
	),
)();

const encodedValueArrayParser: Parser<DexEncodedValue[], Uint8Array> = promiseCompose(
	createTupleParser([
		createEncodedValueArgParser(0x1c),
		encodedArrayParser,
	]),
	([ _, array ]) => array,
);

type DexAnnotationElement = {
	nameIndex: number,
	value: DexEncodedValue,
};

type DexEncodedAnnotation = {
	typeIndex: number,
	elements: DexAnnotationElement[],
};

const annotationElementParser: Parser<DexAnnotationElement, Uint8Array> = promiseCompose(
	createTupleParser([
		uleb128Parser,
		createParserAccessorParser(() => encodedValueParser),
	]),
	([ nameIndex, value ]) => ({ nameIndex, value }),
);

const encodedAnnotationParser: Parser<DexEncodedAnnotation, Uint8Array> = promiseCompose(
	parserCreatorCompose(
		() => createTupleParser([
			uleb128Parser,
			uleb128Parser,
		]),
		([
			typeIndex,
			size,
		]) => createTupleParser([
			async () => typeIndex,
			createQuantifierParser(
				annotationElementParser,
				size,
			),
		]),
	)(),
	([ typeIndex, elements ]) => ({ typeIndex, elements }),
);

const encodedValueAnnotationParser: Parser<DexEncodedAnnotation, Uint8Array> = promiseCompose(
	createTupleParser([
		createEncodedValueArgParser(0x1d),
		encodedAnnotationParser,
	]),
	([ _, annotation ]) => annotation,
);

const encodedValueNullParser: Parser<null, Uint8Array> = promiseCompose(
	createEncodedValueArgParser(0x1e),
	() => null,
);

const encodedValueBooleanParser: Parser<boolean, Uint8Array> = promiseCompose(
	createEncodedValueArgParser(0x1f),
	(value) => Boolean(value),
);

type DexEncodedValue = number | DexEncodedValue[] | undefined;

const encodedValueParser: Parser<DexEncodedValue, Uint8Array> = createUnionParser([
	encodedValueByteParser,
	encodedValueShortParser,
	encodedValueCharParser,
	encodedValueIntParser,
	encodedValueLongParser,
	encodedValueFloatParser,
	encodedValueDoubleParser,
	encodedValueMethodTypeParser,
	encodedValueMethodHandleParser,
	encodedValueStringParser,
	encodedValueTypeParser,
	encodedValueFieldParser,
	encodedValueMethodParser,
	encodedValueEnumParser,
	encodedValueArrayParser,
	encodedValueAnnotationParser,
	encodedValueNullParser,
	encodedValueBooleanParser,
]);

const createEncodedArrayParser = (encodedArrayOffset: number): Parser<DexEncodedValue[], Uint8Array> => promiseCompose(
	createTupleParser([
		createSkipToParser(encodedArrayOffset),
		encodedArrayParser,
	]),
	([ _, encodedArray ]) => encodedArray,
);

type DexTryItem = {
	startAddress: number,
	instructionCount: number,
	handlerOffset: number,
};

const tryItemParser: Parser<DexTryItem, Uint8Array> = promiseCompose(
	createTupleParser([
		uintParser,
		ushortParser,
		ushortParser,
	]),
	([
		startAddress,
		instructionCount,
		handlerOffset,
	]) => ({
		startAddress,
		instructionCount,
		handlerOffset,
	}),
);

type DexEncodedTypeAddressPair = {
	typeIndex: number,
	address: number,
};

const encodedTypeAddressPairParser: Parser<DexEncodedTypeAddressPair, Uint8Array> = promiseCompose(
	createTupleParser([
		uleb128Parser,
		uleb128Parser,
	]),
	([ typeIndex, address ]) => ({ typeIndex, address }),
);

type DexEncodedCatchHandler = {
	addresses: DexEncodedTypeAddressPair[],
	catchAllAddress: undefined | number,
};

const encodedCatchHandlerParser: Parser<DexEncodedCatchHandler, Uint8Array> = parserCreatorCompose(
	() => sleb128Parser,
	size => promiseCompose(
		createTupleParser([
			createQuantifierParser(
				encodedTypeAddressPairParser,
				Math.abs(size),
			),
			size < 0 ? uleb128Parser : async () => undefined,
		]),
		([ addresses, catchAllAddress ]) => ({ addresses, catchAllAddress }),
	),
)();

const encodedCatchHandlersParser: Parser<DexEncodedCatchHandler[], Uint8Array> = parserCreatorCompose(
	() => uleb128Parser,
	size => createQuantifierParser(
		encodedCatchHandlerParser,
		size,
	),
)();

type DexCodeItem = {
	registersSize: number,
	insSize: number,
	outsSize: number,
	triesSize: number,
	debugInfoOffset: number,
	instructions: Uint8Array,
	tries: DexTryItem[],
	handlers: DexEncodedCatchHandler[],
};

const createCodeItemParser = (codeOffset: number): Parser<DexCodeItem, Uint8Array> => parserCreatorCompose(
	() => createTupleParser([
		createSkipToParser(codeOffset),
		ushortParser,
		ushortParser,
		ushortParser,
		ushortParser,
		uintParser,
		uintParser,
	]),
	([
		_,
		registersSize,
		insSize,
		outsSize,
		triesSize,
		debugInfoOffset,
		instructionsSize,
	]) => promiseCompose(
		createTupleParser([
			createFixedLengthSequenceParser(instructionsSize * 2),
			(
				triesSize !== 0 && instructionsSize % 2 === 1
					? createExactSequenceParser(new Uint8Array(2))
					: async () => undefined
			),
			(
				triesSize !== 0
					? createQuantifierParser(
						tryItemParser,
						triesSize,
					)
					: async () => []
			),
			(
				triesSize !== 0
					? encodedCatchHandlersParser
					: async () => []
			),
		]),
		([
			instructions,
			_padding,
			tries,
			handlers,
		]) => ({
			registersSize,
			insSize,
			outsSize,
			triesSize,
			debugInfoOffset,
			instructions,
			tries,
			handlers,
		}),
	),
)();

type DexDebugInfoItem = {
	lineStart: number,
	parameterNames: number[],
	bytecode: Uint8Array,
};

const createDebugInfoItemParser = (debugInfoOffset: number): Parser<DexDebugInfoItem, Uint8Array> => parserCreatorCompose(
	() => createTupleParser([
		createSkipToParser(debugInfoOffset),
		uleb128Parser,
		uleb128Parser,
	]),
	([
		_,
		lineStart,
		parametersSize,
	]) => promiseCompose(
		createTupleParser([
			createQuantifierParser(
				uleb128Parser,
				parametersSize,
			),
			createTerminatedArrayParser(
				nonNullByteParser,
				nullByteParser,
			),
		]),
		([ parameterNames, [ bytecode ] ]) => ({
			lineStart,
			parameterNames,
			bytecode: new Uint8Array(bytecode),
		}),
	),
)();

export const dexParser: Parser<unknown, Uint8Array> = parserCreatorCompose(
	() => dexHeaderParser,
	(dexHeader) => promiseCompose(
		createTupleParser([
			createStringIdsParser(dexHeader.stringIds),
			createTypeIdsParser(dexHeader.typeIds),
			createProtoIdsParser(dexHeader.protoIds),
			createFieldIdsParser(dexHeader.fieldIds),
			createMethodIdsParser(dexHeader.methodIds),
			createClassDefinitionsParser(dexHeader.classDefinitions),
			createDataParser(dexHeader.data),
			createDataParser(dexHeader.link),
		]),
		async ([
			stringIds,
			typeIds,
			protoIds,
			fieldIds,
			methodIds,
			classDefIds,
			data,
			link,
		]) => {
			const strings = await Promise.all(stringIds.map(async (stringDataOffset) => {
				invariant(data, 'data must be there if stringIds has elements');

				const stringDataItem = await runParser(
					createStringParser(stringDataOffset - dexHeader.data.offset),
					data,
					uint8ArrayParserInputCompanion,
				);

				return stringDataItem;
			}));

			const types = typeIds.map((typeId) => {
				const type = strings[typeId];
				invariant(type, 'Type string must be there. Type id: %d', typeId);
				return type;
			});

			const prototypes = await Promise.all(protoIds.map(async (protoId) => {
				const shorty = strings[protoId.shortyIndex];
				invariant(shorty, 'Shorty string must be there. Shorty id: %d', protoId.shortyIndex);

				const returnType = types[protoId.returnTypeIndex];
				invariant(returnType, 'Return type must be there. Return type id: %d', protoId.returnTypeIndex);

				if (protoId.parametersOffset === 0) {
					return { shorty, returnType, parameters: [] };
				}

				invariant(data, 'data must be there if protoId.parametersOffset is not 0');

				const parameterIndexes = await runParser(
					createTypeListParser(protoId.parametersOffset - dexHeader.data.offset),
					data,
					uint8ArrayParserInputCompanion,
				);

				const parameters = parameterIndexes.map((parameterIndex) => {
					const parameter = types[parameterIndex];
					invariant(parameter, 'Parameter type must be there. Parameter type id: %d', parameterIndex);
					return parameter;
				});

				return { shorty, returnType, parameters };
			}));

			const fields = fieldIds.map((fieldId) => {
				const class_ = types[fieldId.classIndex];
				invariant(class_, 'Class type must be there. Class type id: %d', fieldId.classIndex);

				const type = types[fieldId.typeIndex];
				invariant(type, 'Type must be there. Type id: %d', fieldId.typeIndex);

				const name = strings[fieldId.nameIndex];
				invariant(name, 'Name must be there. Name id: %d', fieldId.nameIndex);

				return { class: class_, type, name };
			});

			const methods = methodIds.map((methodId) => {
				const class_ = types[methodId.classIndex];
				invariant(class_, 'Class type must be there. Class type id: %d', methodId.classIndex);

				const prototype = prototypes[methodId.protoIndex];
				invariant(prototype, 'Proto must be there. Proto id: %d', methodId.protoIndex);

				const name = strings[methodId.nameIndex];
				invariant(name, 'Name must be there. Name id: %d', methodId.nameIndex);

				return { class: class_, prototype, name };
			});

			const classDefinitions = await Promise.all(classDefIds.map(async (classDef) => {
				const class_ = types[classDef.classIndex];
				invariant(class_, 'Class type must be there. Class type id: %d', classDef.classIndex);

				const superclass = types[classDef.superclassIndex];
				invariant(superclass, 'Superclass type must be there. Superclass type id: %d', classDef.superclassIndex);

				let interfaces: string[];

				if (classDef.interfacesOffset === 0) {
					interfaces = [];
				} else {
					invariant(data, 'data must be there if classDef.interfacesOffset is not 0');

					const interfaceIndexes = await runParser(
						createTypeListParser(classDef.interfacesOffset - dexHeader.data.offset),
						data,
						uint8ArrayParserInputCompanion,
					);

					interfaces = interfaceIndexes.map((interfaceIndex) => {
						const interface_ = types[interfaceIndex];
						invariant(interface_, 'Interface type must be there. Interface type id: %d', interfaceIndex);
						return interface_;
					});
				}

				let annotations: unknown;

				if (classDef.annotationsOffset === 0) {
					annotations = undefined;
				} else {
					invariant(data, 'data must be there if classDef.annotationsOffset is not 0');

					annotations = await runParser(
						createAnnotationsDirectoryItemParser(classDef.annotationsOffset - dexHeader.data.offset),
						data,
						uint8ArrayParserInputCompanion,
					);
				}

				let classDataItem: DexClassDataItem | undefined;

				if (classDef.classDataOffset !== 0) {
					invariant(data, 'data must be there if classDef.classDataOffset is not 0');

					classDataItem = await runParser(
						createClassDataItemParser(classDef.classDataOffset - dexHeader.data.offset),
						data,
						uint8ArrayParserInputCompanion,
					);
				}

				const [
					directMethods,
					virtualMethods,
				] = await Promise.all([
					Promise.all((classDataItem?.directMethods ?? []).map(async (directMethod) => {
						const method = methods[directMethod.methodIndex];
						invariant(method, 'Method must be there. Method id: %d', directMethod.methodIndex);

						let codeItem: DexCodeItem | undefined;

						if (directMethod.codeOffset !== 0) {
							invariant(data, 'data must be there if directMethod.codeOffset is not 0');

							codeItem = await runParser(
								createCodeItemParser(directMethod.codeOffset - dexHeader.data.offset),
								data,
								uint8ArrayParserInputCompanion,
							);
						}

						let debugInfoItem: DexDebugInfoItem | undefined;

						if (codeItem?.debugInfoOffset) {
							invariant(data, 'data must be there if codeItem.debugInfoOffset is not 0');

							debugInfoItem = await runParser(
								createDebugInfoItemParser(codeItem.debugInfoOffset - dexHeader.data.offset),
								data,
								uint8ArrayParserInputCompanion,
							);
						}

						return {
							method,
							accessFlags: directMethod.accessFlags,
							codeItem: codeItem && {
								registersSize: codeItem.registersSize,
								insSize: codeItem.insSize,
								outsSize: codeItem.outsSize,
								tries: codeItem.tries,
								handlers: codeItem.handlers,
								instructions: codeItem.instructions,
								debugInfo: debugInfoItem,
							},
						};
					})),
					Promise.all((classDataItem?.virtualMethods ?? []).map(async (virtualMethod) => {
						const method = methods[virtualMethod.methodIndex];
						invariant(method, 'Method must be there. Method id: %d', virtualMethod.methodIndex);

						let codeItem: DexCodeItem | undefined;

						if (virtualMethod.codeOffset !== 0) {
							invariant(data, 'data must be there if virtualMethod.codeOffset is not 0');

							codeItem = await runParser(
								createCodeItemParser(virtualMethod.codeOffset - dexHeader.data.offset),
								data,
								uint8ArrayParserInputCompanion,
							);
						}

						return {
							method,
							accessFlags: virtualMethod.accessFlags,
							codeItem,
						};
					})),
				] as const);

				const classData = {
					staticFields: classDataItem?.staticFields.map((field) => ({
						field: fields[field.fieldIndex],
						accessFlags: field.accessFlags,
					})) ?? [],
					instanceFields: classDataItem?.instanceFields.map((field) => ({
						field: fields[field.fieldIndex],
						accessFlags: field.accessFlags,
					})) ?? [],
					directMethods,
					virtualMethods,
				};

				let staticValues: DexEncodedValue[] = [];

				if (classDef.staticValuesOffset !== 0) {
					invariant(data, 'data must be there if classDef.staticValuesOffset is not 0');

					staticValues = await runParser(
						createEncodedArrayParser(classDef.staticValuesOffset - dexHeader.data.offset),
						data,
						uint8ArrayParserInputCompanion,
					);
				}

				return {
					class: class_,
					accessFlags: classDef.accessFlags,
					superclass,
					interfaces,
					sourceFile: strings[classDef.sourceFileIndex],
					annotations,
					classData,
					staticValues,
				};
			}));

			return {
				strings,
				types,
				prototypes,
				fields,
				methods,
				classDefinitions,
				link,
			};
		},
	),
)();
