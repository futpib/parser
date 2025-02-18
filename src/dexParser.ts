import invariant from 'invariant';
import { MUtf8Decoder } from "mutf-8";
import { createElementParser } from './elementParser.js';
import { createExactElementParser } from './exactElementParser.js';
import { createExactSequenceParser } from './exactSequenceParser.js';
import { createFixedLengthSequenceParser } from './fixedLengthSequenceParser.js';
import { cloneParser, getParserName, setParserName, type Parser } from './parser.js';
import { parserCreatorCompose } from './parserCreatorCompose.js';
import { promiseCompose } from './promiseCompose.js';
import { createQuantifierParser } from './quantifierParser.js';
import { createTerminatedArrayParserUnsafe } from './terminatedArrayParser.js';
import { createTupleParser } from './tupleParser.js';
import { createParserAccessorParser } from './parserAccessorParser.js';
import { createSkipToParser } from './skipToParser.js';
import { createLookaheadParser } from './lookaheadParser.js';
import { getIsoTypedNumberArray, IndexIntoFieldIds, IndexIntoMethodIds, IndexIntoPrototypeIds, IndexIntoStringIds, IndexIntoTypeIds, isoIndexIntoFieldIds, isoIndexIntoMethodIds, isoIndexIntoPrototypeIds, isoIndexIntoStringIds, isoIndexIntoTypeIds, isoOffsetFromEncodedCatchHandlerListToEncodedCatchHandler, isoOffsetToAnnotationItem, isoOffsetToAnnotationsDirectoryItem, isoOffsetToAnnotationSetItem, isoOffsetToAnnotationSetRefListItem, isoOffsetToClassDataItem, isoOffsetToCodeItem, isoOffsetToDebugInfoItem, isoOffsetToEncodedArrayItem, isoOffsetToStringDataItem, isoOffsetToTypeList, OffsetFromEncodedCatchHandlerListToEncodedCatchHandler, OffsetToAnnotationItem, OffsetToAnnotationsDirectoryItem, OffsetToAnnotationSetItem, OffsetToAnnotationSetRefListItem, OffsetToClassDataItem, OffsetToCodeItem, OffsetToDebugInfoItem, OffsetToEncodedArrayItem, OffsetToStringDataItem, OffsetToTypeList, TypedNumberArray } from './dexParser/typedNumbers.js';
import { Iso } from 'monocle-ts';
import { sleb128NumberParser, uleb128NumberParser } from './leb128Parser.js';
import { createDisjunctionParser } from './disjunctionParser.js';

// https://source.android.com/docs/core/runtime/dex-format

export const uleb128p1NumberParser: Parser<number, Uint8Array> = async (parserContext) => {
	const value = await uleb128NumberParser(parserContext);
	return value - 1;
}

const ubyteParser: Parser<number, Uint8Array> = createElementParser();

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

const createByteAlignParser = (byteAlignment: number): Parser<void, Uint8Array> => async (parserContext) => {
	const toSkip = (byteAlignment - (parserContext.position % byteAlignment)) % byteAlignment;

	parserContext.skip(toSkip);
};

const byteAlign4Parser: Parser<void, Uint8Array> = createByteAlignParser(4);

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

type DexHeaderItem = {
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
	prototypeIds: SizeOffset,
	fieldIds: SizeOffset,
	methodIds: SizeOffset,
	classDefinitions: SizeOffset,
	data: SizeOffset,
};

const dexHeaderItemParser: Parser<DexHeaderItem, Uint8Array> = promiseCompose(
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
		prototypeIds,
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
		prototypeIds,
		fieldIds,
		methodIds,
		classDefinitions,
		data,
	}),
);

type DexStringIdItem = OffsetToStringDataItem;

const dexStringIdItemParser: Parser<DexStringIdItem, Uint8Array> = promiseCompose(
	cloneParser(uintParser),
	(offset) => isoOffsetToStringDataItem.wrap(offset),
);

type DexStringIdItems = TypedNumberArray<IndexIntoStringIds, DexStringIdItem>;

const isoDexStringIdItems = getIsoTypedNumberArray<IndexIntoStringIds, DexStringIdItem>();

const createSkipToThenStringIdItemsParser = ({ size, offset }: SizeOffset): Parser<DexStringIdItems, Uint8Array> => (
	size === 0
		? (() => isoDexStringIdItems.wrap([]))
		: promiseCompose(
			createTupleParser([
				createSkipToParser(offset),
				createQuantifierParser(
					dexStringIdItemParser,
					size,
				),
			]),
			([ _, stringIds ]) => isoDexStringIdItems.wrap(stringIds),
		)
);

type DexTypeIdItem = IndexIntoStringIds;

const dexTypeIdItemParser: Parser<DexTypeIdItem, Uint8Array> = promiseCompose(
	cloneParser(uintParser),
	(index) => isoIndexIntoStringIds.wrap(index),
);

type DexTypeIdItems = TypedNumberArray<IndexIntoTypeIds, DexTypeIdItem>;

const isoDexTypeIdItems = getIsoTypedNumberArray<IndexIntoTypeIds, DexTypeIdItem>();

const createSkipToThenTypeIdItemsParser = ({ size, offset }: SizeOffset): Parser<DexTypeIdItems, Uint8Array> => (
	size === 0
		? (() => isoDexTypeIdItems.wrap([]))
		: promiseCompose(
			createTupleParser([
				createSkipToParser(offset),
				createQuantifierParser(
					dexTypeIdItemParser,
					size,
				),
			]),
			([ _, typeIds ]) => isoDexTypeIdItems.wrap(typeIds),
		)
);

type DexPrototypeIdItem = {
	shortyIndex: IndexIntoStringIds;
	returnTypeIndex: IndexIntoTypeIds;
	parametersOffset: OffsetToTypeList;
};

const prototypeIdItemParser: Parser<DexPrototypeIdItem, Uint8Array> = promiseCompose(
	createTupleParser([
		byteAlign4Parser,
		uintParser,
		uintParser,
		uintParser,
	]),
	([ _, shortyIndex, returnTypeIndex, parametersOffset ]): DexPrototypeIdItem => ({
		shortyIndex: isoIndexIntoStringIds.wrap(shortyIndex),
		returnTypeIndex: isoIndexIntoTypeIds.wrap(returnTypeIndex),
		parametersOffset: isoOffsetToTypeList.wrap(parametersOffset),
	}),
);

type DexPrototypeIdItems = TypedNumberArray<IndexIntoPrototypeIds, DexPrototypeIdItem>;

const isoDexPrototypeIdItems = getIsoTypedNumberArray<IndexIntoPrototypeIds, DexPrototypeIdItem>();

const createSkipToThenPrototypeIdItemsParser = ({ size, offset }: SizeOffset): Parser<DexPrototypeIdItems, Uint8Array> => (
	size === 0
		? (() => isoDexPrototypeIdItems.wrap([]))
		: promiseCompose(
			createTupleParser([
				createSkipToParser(offset),
				createQuantifierParser(
					prototypeIdItemParser,
					size,
				),
			]),
			([ _, prototypeIds ]) => isoDexPrototypeIdItems.wrap(prototypeIds),
		)
);

const createSkipToThenItemByOffsetParser = <Offset, Item>({
	sizeOffset: { size, offset },
	itemParser,
	byteAlign4,
	isoOffset,
	parserName,
}: {
	sizeOffset: SizeOffset;
	itemParser: Parser<Item, Uint8Array>;
	byteAlign4: boolean;
	isoOffset: Iso<Offset, number>;
	parserName: string;
}): Parser<Map<Offset, Item>, Uint8Array> => {
	const skipToThenItemByOffsetParser: Parser<Map<Offset, Item>, Uint8Array> = async (parserContext) => {
		const itemByOffset = new Map<Offset, Item>();

		if (size === 0) {
			return itemByOffset;
		}

		await createSkipToParser(offset)(parserContext);

		for (let i = 0; i < size; i++) {
			if (byteAlign4) {
				await byteAlign4Parser(parserContext);
			}

			const offset = parserContext.position;

			const item = await itemParser(parserContext);

			itemByOffset.set(isoOffset.wrap(offset), item);
		}

		return itemByOffset;
	};

	setParserName(skipToThenItemByOffsetParser, parserName);

	return skipToThenItemByOffsetParser;
};

type DexFieldIdItem = {
	classIndex: IndexIntoTypeIds;
	typeIndex: IndexIntoTypeIds;
	nameIndex: IndexIntoStringIds;
};

const dexFieldIdItemParser: Parser<DexFieldIdItem, Uint8Array> = promiseCompose(
	createTupleParser([
		ushortParser,
		ushortParser,
		uintParser,
	]),
	([ classIndex, typeIndex, nameIndex ]): DexFieldIdItem => ({
		classIndex: isoIndexIntoTypeIds.wrap(classIndex),
		typeIndex: isoIndexIntoTypeIds.wrap(typeIndex),
		nameIndex: isoIndexIntoStringIds.wrap(nameIndex),
	}),
);

type DexFieldIdItems = TypedNumberArray<IndexIntoFieldIds, DexFieldIdItem>;

const isoDexFieldIdItems = getIsoTypedNumberArray<IndexIntoFieldIds, DexFieldIdItem>();

const createSkipToThenFieldIdItemsParser = ({ size, offset }: SizeOffset): Parser<DexFieldIdItems, Uint8Array> => (
	size === 0
		? (() => isoDexFieldIdItems.wrap([]))
		: promiseCompose(
			createTupleParser([
				createSkipToParser(offset),
				createQuantifierParser(
					dexFieldIdItemParser,
					size,
				),
			]),
			([ _, fieldIds ]) => isoDexFieldIdItems.wrap(fieldIds),
		)
);

type DexMethodIdItem = {
	classIndex: IndexIntoTypeIds;
	prototypeIndex: IndexIntoPrototypeIds;
	nameIndex: IndexIntoStringIds;
};

const dexMethodIdItemParser: Parser<DexMethodIdItem, Uint8Array> = promiseCompose(
	createTupleParser([
		ushortParser,
		ushortParser,
		uintParser,
	]),
	([ classIndex, prototypeIndex, nameIndex ]): DexMethodIdItem => ({
		classIndex: isoIndexIntoTypeIds.wrap(classIndex),
		prototypeIndex: isoIndexIntoPrototypeIds.wrap(prototypeIndex),
		nameIndex: isoIndexIntoStringIds.wrap(nameIndex),
	}),
);

type DexMethodIdItems = TypedNumberArray<IndexIntoMethodIds, DexMethodIdItem>;

const isoDexMethodIdItems = getIsoTypedNumberArray<IndexIntoMethodIds, DexMethodIdItem>();

const createSkipToThenMethodIdItemsParser = ({ size, offset }: SizeOffset): Parser<DexMethodIdItems, Uint8Array> => (
	size === 0
		? (() => isoDexMethodIdItems.wrap([]))
		: promiseCompose(
			createTupleParser([
				createSkipToParser(offset),
				createQuantifierParser(
					dexMethodIdItemParser,
					size,
				),
			]),
			([ _, methodIds ]) => isoDexMethodIdItems.wrap(methodIds),
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
	uleb128NumberParser,
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

type DexClassDefinitionItem = {
	classIndex: IndexIntoTypeIds;
	accessFlags: DexAccessFlags;
	superclassIndex: IndexIntoTypeIds;
	interfacesOffset: OffsetToTypeList;
	sourceFileIndex: undefined | IndexIntoStringIds;
	annotationsOffset: OffsetToAnnotationsDirectoryItem;
	classDataOffset: OffsetToClassDataItem;
	staticValuesOffset: OffsetToEncodedArrayItem;
};

const DEX_CLASS_DEFINITION_ITEM_SOURCE_FILE_NO_INDEX = 0xffffffff;

const createSkipToThenClassDefinitionItemsParser = ({ size, offset }: SizeOffset): Parser<DexClassDefinitionItem[], Uint8Array> => (
	size === 0
		? (() => [])
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
						]): DexClassDefinitionItem => ({
							classIndex: isoIndexIntoTypeIds.wrap(classIndex),
							accessFlags,
							superclassIndex: isoIndexIntoTypeIds.wrap(superclassIndex),
							interfacesOffset: isoOffsetToTypeList.wrap(interfacesOffset),
							sourceFileIndex: (
								sourceFileIndex === DEX_CLASS_DEFINITION_ITEM_SOURCE_FILE_NO_INDEX
									? undefined
									: isoIndexIntoStringIds.wrap(sourceFileIndex)
							),
							annotationsOffset: isoOffsetToAnnotationsDirectoryItem.wrap(annotationsOffset),
							classDataOffset: isoOffsetToClassDataItem.wrap(classDataOffset),
							staticValuesOffset: isoOffsetToEncodedArrayItem.wrap(staticValuesOffset),
						}),
					),
					size,
				),
			]),
			([ _, classDefinitions ]) => classDefinitions,
		)
);

const createRawDataParser = ({ size, offset }: SizeOffset): Parser<undefined | Uint8Array, Uint8Array> => (
	size === 0
		? (() => undefined)
		: promiseCompose(
			createTupleParser([
				createSkipToParser(offset),
				createFixedLengthSequenceParser(size),
			]),
			([ _, data ]) => data,
		)
);

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

const stringDataItemParser: Parser<DexStringDataItem, Uint8Array> = promiseCompose(
	createTupleParser([
		uleb128NumberParser,
		promiseCompose(
			createTerminatedArrayParserUnsafe(
				nonNullByteParser,
				nullByteParser,
			),
			([ stringData ]) => stringData,
		),
	]),
	([ utf16Size, data ]) => ({
		utf16Size,
		data: new Uint8Array(data),
	}),
);

type DexStringDataItemString = string;

const stringDataItemStringParser: Parser<DexStringDataItemString, Uint8Array> = promiseCompose(
	stringDataItemParser,
	({ utf16Size, data }) => {
		const mutf8Decoder = new MUtf8Decoder();
		const string = mutf8Decoder.decode(data);
		invariant(string.length === utf16Size, 'String length mismatch. Expected: %s, actual: %s', utf16Size, string.length);
		return string;
	},
);

type DexStringDataItemStringByOffset = Map<OffsetToStringDataItem, DexStringDataItemString>;

const createSkipToThenStringsParser = (sizeOffset: SizeOffset): Parser<DexStringDataItemStringByOffset, Uint8Array> => createSkipToThenItemByOffsetParser({
	sizeOffset,
	itemParser: stringDataItemStringParser,
	byteAlign4: false,
	isoOffset: isoOffsetToStringDataItem,
	parserName: 'skipToThenStringsParser',
});

type DexTypeItem = IndexIntoTypeIds;

const dexTypeItemParser: Parser<DexTypeItem, Uint8Array> = promiseCompose(
	cloneParser(ushortParser),
	(index) => isoIndexIntoTypeIds.wrap(index),
);

type DexTypeList = TypedNumberArray<IndexIntoTypeIds, DexTypeItem>;

const isoDexTypeList = getIsoTypedNumberArray<IndexIntoTypeIds, DexTypeItem>();

const dexTypeListParser: Parser<DexTypeList, Uint8Array> = parserCreatorCompose(
	() => createTupleParser([
		byteAlign4Parser,
		uintParser,
	]),
	([ _, size ]) => promiseCompose(
		createQuantifierParser(
			dexTypeItemParser,
			size,
		),
		(typeItems) => isoDexTypeList.wrap(typeItems),
	),
)();

type DexTypeListByOffset = Map<OffsetToTypeList, DexTypeList>;

const createSkipToThenTypeListByOffsetParser = (sizeOffset: SizeOffset): Parser<DexTypeListByOffset, Uint8Array> => createSkipToThenItemByOffsetParser({
	sizeOffset,
	itemParser: dexTypeListParser,
	byteAlign4: true,
	isoOffset: isoOffsetToTypeList,
	parserName: 'skipToThenTypeListByOffsetParser',
});

type DexFieldAnnotation = {
	fieldIndex: IndexIntoFieldIds;
	annotationsOffset: OffsetToAnnotationSetItem;
};

const fieldAnnotationParser: Parser<DexFieldAnnotation, Uint8Array> = promiseCompose(
	createTupleParser([
		uintParser,
		uintParser,
	]),
	([
		fieldIndex,
		annotationsOffset,
	]) => ({
		fieldIndex: isoIndexIntoFieldIds.wrap(fieldIndex),
		annotationsOffset: isoOffsetToAnnotationSetItem.wrap(annotationsOffset),
	}),
);

const createFieldAnnotationsParser = (fieldsSize: number): Parser<DexFieldAnnotation[], Uint8Array> => createQuantifierParser(
	fieldAnnotationParser,
	fieldsSize,
);

type DexMethodAnnotation = {
	methodIndex: IndexIntoMethodIds;
	annotationsOffset: OffsetToAnnotationSetItem;
};

const methodAnnotationParser: Parser<DexMethodAnnotation, Uint8Array> = promiseCompose(
	createTupleParser([
		uintParser,
		uintParser,
	]),
	([
		methodIndex,
		annotationsOffset,
	]) => ({
		methodIndex: isoIndexIntoMethodIds.wrap(methodIndex),
		annotationsOffset: isoOffsetToAnnotationSetItem.wrap(annotationsOffset),
	}),
);

const createMethodAnnotationsParser = (methodsSize: number): Parser<DexMethodAnnotation[], Uint8Array> => createQuantifierParser(
	methodAnnotationParser,
	methodsSize,
);

type DexParameterAnnotation = {
	methodIndex: IndexIntoMethodIds;
	annotationsOffset: OffsetToAnnotationSetRefListItem;
};

const parameterAnnotationParser: Parser<DexParameterAnnotation, Uint8Array> = promiseCompose(
	createTupleParser([
		uintParser,
		uintParser,
	]),
	([
		methodIndex,
		annotationsOffset,
	]) => ({
		methodIndex: isoIndexIntoMethodIds.wrap(methodIndex),
		annotationsOffset: isoOffsetToAnnotationSetRefListItem.wrap(annotationsOffset),
	}),
);

const createParameterAnnotationsParser = (parametersSize: number): Parser<DexParameterAnnotation[], Uint8Array> => createQuantifierParser(
	parameterAnnotationParser,
	parametersSize,
);

type DexAnnotationsDirectoryItem = {
	classAnnotationsOffset: OffsetToAnnotationSetItem;
	fieldAnnotations: DexFieldAnnotation[];
	methodAnnotations: DexMethodAnnotation[];
	parameterAnnotations: DexParameterAnnotation[];
};

const annotationsDirectoryItemParser: Parser<DexAnnotationsDirectoryItem, Uint8Array> = parserCreatorCompose(
	() => createTupleParser([
		byteAlign4Parser,
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
			() => isoOffsetToAnnotationSetItem.wrap(classAnnotationsOffset),
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

type DexAnnotationsDirectoryItemByOffset = Map<OffsetToAnnotationsDirectoryItem, DexAnnotationsDirectoryItem>;

const createSkipToThenAnnotationsDirectoryItemsParser = (sizeOffset: SizeOffset): Parser<DexAnnotationsDirectoryItemByOffset, Uint8Array> => createSkipToThenItemByOffsetParser({
	sizeOffset,
	itemParser: annotationsDirectoryItemParser,
	byteAlign4: true,
	isoOffset: isoOffsetToAnnotationsDirectoryItem,
	parserName: 'skipToThenAnnotationsDirectoryItemsParser',
});

type DexEncodedFieldDiff = {
	fieldIndexDiff: number;
	accessFlags: DexAccessFlags;
};

const encodedFieldParser: Parser<DexEncodedFieldDiff, Uint8Array> = promiseCompose(
	createTupleParser([
		uleb128NumberParser,
		uleb128AccessFlagsParser,
	]),
	([ fieldIndexDiff, accessFlags ]) => ({ fieldIndexDiff, accessFlags }),
);

type DexEncodedField = {
	fieldIndex: IndexIntoFieldIds;
	accessFlags: DexAccessFlags;
};

const createEncodedFieldsParser = (fieldsSize: number): Parser<DexEncodedField[], Uint8Array> => promiseCompose(
	createQuantifierParser(
		encodedFieldParser,
		fieldsSize,
	),
	(encodedFields) => {
		let previousFieldIndex = 0;
		return encodedFields.map(({ fieldIndexDiff, accessFlags }) => {
			previousFieldIndex += fieldIndexDiff;
			return {
				fieldIndex: isoIndexIntoFieldIds.wrap(previousFieldIndex),
				accessFlags,
			};
		});
	},
);

type DexEncodedMethodDiff = {
	methodIndexDiff: number;
	accessFlags: DexAccessFlags;
	codeOffset: OffsetToCodeItem;
};

const encodedMethodParser: Parser<DexEncodedMethodDiff, Uint8Array> = promiseCompose(
	createTupleParser([
		uleb128NumberParser,
		uleb128AccessFlagsParser,
		uleb128NumberParser,
	]),
	([
		methodIndexDiff,
		accessFlags,
		codeOffset,
	]) => ({
		methodIndexDiff,
		accessFlags,
		codeOffset: isoOffsetToCodeItem.wrap(codeOffset),
	}),
);

type DexEncodedMethod = {
	methodIndex: IndexIntoMethodIds;
	accessFlags: DexAccessFlags;
	codeOffset: OffsetToCodeItem;
};

const createEncodedMethodsParser = (methodsSize: number): Parser<DexEncodedMethod[], Uint8Array> => promiseCompose(
	createQuantifierParser(
		encodedMethodParser,
		methodsSize,
	),
	(encodedMethods) => {
		let previousMethodIndex = 0;
		return encodedMethods.map(({ methodIndexDiff, accessFlags, codeOffset }) => {
			previousMethodIndex += methodIndexDiff;
			return {
				methodIndex: isoIndexIntoMethodIds.wrap(previousMethodIndex),
				accessFlags,
				codeOffset,
			};
		});
	},
);

type DexClassDataItem = {
	staticFields: DexEncodedField[],
	instanceFields: DexEncodedField[],
	directMethods: DexEncodedMethod[],
	virtualMethods: DexEncodedMethod[],
};

const classDataItemParser: Parser<DexClassDataItem, Uint8Array> = parserCreatorCompose(
	() => createTupleParser([
		uleb128NumberParser,
		uleb128NumberParser,
		uleb128NumberParser,
		uleb128NumberParser,
	]),
	([
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

type DexClassDataItemByOffset = Map<OffsetToClassDataItem, DexClassDataItem>;

const createSkipToThenClassDataItemsParser = (sizeOffset: SizeOffset): Parser<DexClassDataItemByOffset, Uint8Array> => createSkipToThenItemByOffsetParser({
	sizeOffset,
	itemParser: classDataItemParser,
	byteAlign4: false,
	isoOffset: isoOffsetToClassDataItem,
	parserName: 'skipToThenClassDataItemsParser',
});

const createByteWith5LeastSignificantBitsEqualParser = (leastSignificant5: number): Parser<number, Uint8Array> => {
	const byteWith5LeastSignificantBitsEqualParser: Parser<number, Uint8Array> = async (parserContext) => {
		const byte = await parserContext.read(0);
		parserContext.invariant(
			(byte & 0b00011111) === leastSignificant5,
			'Expected byte with 5 least significant bits equal to %s, but got %s',
			leastSignificant5.toString(2).padStart(8, '0'),
			byte.toString(2).padStart(8, '0'),
		);
		return byte;
	};

	setParserName(byteWith5LeastSignificantBitsEqualParser, `createByteWith5LeastSignificantBitsEqualParser(${leastSignificant5.toString(2).padStart(5, '0')})`);

	return byteWith5LeastSignificantBitsEqualParser;
};

const createEncodedValueArgParser = (valueType: number): Parser<number, Uint8Array> => promiseCompose(
	createByteWith5LeastSignificantBitsEqualParser(valueType),
	(byte) => byte >> 5,
);

const encodedValueByteParser: Parser<number, Uint8Array> = promiseCompose(
	createTupleParser([
		createExactElementParser(0),
		ubyteParser,
	]),
	([ _, value ]) => value,
);

setParserName(encodedValueByteParser, 'encodedValueByteParser');

const encodedValueShortParser: Parser<number, Uint8Array> = parserCreatorCompose(
	() => createEncodedValueArgParser(0x02),
	sizeSubOne => {
		const size = sizeSubOne + 1;

		if (size === 1) {
			return promiseCompose(
				createFixedLengthSequenceParser(size),
				(uint8Array) => {
					const buffer = Buffer.from(uint8Array);
					return buffer.readInt8(0);
				},
			);
		}

		invariant(size === 2, '(encodedValueShortParser) Unexpected size: %s', size);

		return promiseCompose(
			createFixedLengthSequenceParser(size),
			(uint8Array) => {
				const buffer = Buffer.from(uint8Array);
				return buffer.readInt16LE(0);
			},
		);
	},
)();

setParserName(encodedValueShortParser, 'encodedValueShortParser');

const encodedValueCharParser: Parser<number, Uint8Array> = parserCreatorCompose(
	() => createEncodedValueArgParser(0x03),
	sizeSubOne => {
		const size = sizeSubOne + 1;

		if (size == 1) {
			return promiseCompose(
				createFixedLengthSequenceParser(size),
				(uint8Array) => {
					const buffer = Buffer.from([ 0, ...uint8Array ]);
					return buffer.readUInt16LE(0);
				},
			);
		}

		invariant(size === 2, '(encodedValueCharParser) Unexpected size: %s', size);

		return promiseCompose(
			createFixedLengthSequenceParser(size),
			(uint8Array) => {
				const buffer = Buffer.from(uint8Array);
				return buffer.readUInt16LE(0);
			},
		);
	},
)();

setParserName(encodedValueCharParser, 'encodedValueCharParser');

const encodedValueIntParser: Parser<number, Uint8Array> = parserCreatorCompose(
	() => createEncodedValueArgParser(0x04),
	sizeSubOne => {
		const size = sizeSubOne + 1;

		if (size === 1) {
			return promiseCompose(
				createFixedLengthSequenceParser(size),
				(uint8Array) => {
					const buffer = Buffer.from(uint8Array);
					return buffer.readInt8(0);
				},
			);
		}

		if (size === 2) {
			return promiseCompose(
				createFixedLengthSequenceParser(size),
				(uint8Array) => {
					const buffer = Buffer.from(uint8Array);
					return buffer.readInt16LE(0);
				},
			);
		}

		if (size === 3) {
			return promiseCompose(
				createFixedLengthSequenceParser(size),
				(uint8Array) => {
					const firstByte = uint8Array[0];
					const firstBit = (firstByte & 0b10000000) >> 7;
					const extensionByte = firstBit === 1 ? 0xff : 0x00;

					const buffer = Buffer.from([ extensionByte, ...uint8Array ]);
					return buffer.readInt32LE(0);
				},
			);
		}

		invariant(size === 4, '(encodedValueIntParser) Unexpected size: %s', size);

		return promiseCompose(
			createFixedLengthSequenceParser(size),
			(uint8Array) => {
				const buffer = Buffer.from(uint8Array);
				return buffer.readInt32LE(0);
			},
		);
	},
)();

setParserName(encodedValueIntParser, 'encodedValueIntParser');

const encodedValueLongParser: Parser<bigint, Uint8Array> = parserCreatorCompose(
	() => createEncodedValueArgParser(0x06),
	sizeSubOne => {
		const size = sizeSubOne + 1;

		if (size === 1) {
			return promiseCompose(
				createFixedLengthSequenceParser(size),
				(uint8Array) => {
					const buffer = Buffer.from(uint8Array);
					return BigInt(buffer.readInt8(0));
				},
			);
		}

		if (size === 2) {
			return promiseCompose(
				createFixedLengthSequenceParser(size),
				(uint8Array) => {
					const buffer = Buffer.from(uint8Array);
					return BigInt(buffer.readInt16LE(0));
				},
			);
		}

		if (size === 3) {
			return promiseCompose(
				createFixedLengthSequenceParser(size),
				(uint8Array) => {
					const firstByte = uint8Array[0];
					const firstBit = (firstByte & 0b10000000) >> 7;
					const extensionByte = firstBit === 1 ? 0xff : 0x00;

					const buffer = Buffer.from([ extensionByte, ...uint8Array ]);
					return BigInt(buffer.readInt32LE(0));
				},
			);
		}

		if (size === 4) {
			return promiseCompose(
				createFixedLengthSequenceParser(size),
				(uint8Array) => {
					const buffer = Buffer.from(uint8Array);
					return BigInt(buffer.readInt32LE(0));
				},
			);
		}

		invariant(size === 8, '(encodedValueLongParser) Unexpected size: %s', size);

		return promiseCompose(
			createFixedLengthSequenceParser(size),
			(uint8Array) => {
				const buffer = Buffer.from(uint8Array);
				return buffer.readBigInt64LE(0);
			},
		);
	},
)();

setParserName(encodedValueLongParser, 'encodedValueLongParser');

const encodedValueFloatParser: Parser<number, Uint8Array> = parserCreatorCompose(
	() => createEncodedValueArgParser(0x10),
	sizeSubOne => {
		const size = sizeSubOne + 1;

		if (size === 1) {
			return promiseCompose(
				createFixedLengthSequenceParser(size),
				(uint8Array) => {
					const buffer = Buffer.from([ ...uint8Array, 0, 0, 0 ]);
					return buffer.readFloatLE(0);
				},
			);
		}

		if (size === 2) {
			return promiseCompose(
				createFixedLengthSequenceParser(size),
				(uint8Array) => {
					const buffer = Buffer.from([ ...uint8Array, 0, 0 ]);
					return buffer.readFloatLE(0);
				},
			);
		}

		invariant(size === 4, '(encodedValueFloatParser) Unexpected size: %s', size);

		return promiseCompose(
			createFixedLengthSequenceParser(size),
			(uint8Array) => {
				const buffer = Buffer.from(uint8Array);
				return buffer.readFloatLE(0);
			},
		);
	},
)();

setParserName(encodedValueFloatParser, 'encodedValueFloatParser');

const encodedValueDoubleParser: Parser<number, Uint8Array> = parserCreatorCompose(
	() => createEncodedValueArgParser(0x11),
	sizeSubOne => {
		const size = sizeSubOne + 1;

		if (size === 1) {
			return promiseCompose(
				createFixedLengthSequenceParser(size),
				(uint8Array) => {
					const buffer = Buffer.from([ ...uint8Array, 0, 0, 0, 0, 0, 0, 0 ]);
					return buffer.readDoubleLE(0);
				},
			);
		}

		if (size === 2) {
			return promiseCompose(
				createFixedLengthSequenceParser(size),
				(uint8Array) => {
					const buffer = Buffer.from([ ...uint8Array, 0, 0, 0, 0, 0, 0 ]);
					return buffer.readDoubleLE(0);
				},
			);
		}

		if (size === 4) {
			return promiseCompose(
				createFixedLengthSequenceParser(size),
				(uint8Array) => {
					const buffer = Buffer.from([ ...uint8Array, 0, 0, 0, 0 ]);
					return buffer.readDoubleLE(0);
				},
			);
		}

		invariant(size === 8, '(encodedValueDoubleParser) Unexpected size: %s', size);

		return promiseCompose(
			createFixedLengthSequenceParser(size),
			(uint8Array) => {
				const buffer = Buffer.from(uint8Array);
				return buffer.readDoubleLE(0);
			},
		);
	},
)();

setParserName(encodedValueDoubleParser, 'encodedValueDoubleParser');

const encodedValueMethodTypeParser: Parser<number, Uint8Array> = parserCreatorCompose(
	() => createEncodedValueArgParser(0x15),
	sizeSubOne => {
		const size = sizeSubOne + 1;

		if (size === 1) {
			return promiseCompose(
				createFixedLengthSequenceParser(size),
				(uint8Array) => {
					const buffer = Buffer.from(uint8Array);
					return buffer.readUint8(0);
				},
			);
		}

		if (size === 2) {
			return promiseCompose(
				createFixedLengthSequenceParser(size),
				(uint8Array) => {
					const buffer = Buffer.from(uint8Array);
					return buffer.readUInt16LE(0);
				},
			);
		}

		invariant(size === 4, '(encodedValueMethodTypeParser) Unexpected size: %s', size);

		return promiseCompose(
			createFixedLengthSequenceParser(size),
			(uint8Array) => {
				const buffer = Buffer.from(uint8Array);
				return buffer.readUInt32LE(0);
			},
		);
	},
)();

setParserName(encodedValueMethodTypeParser, 'encodedValueMethodTypeParser');

const encodedValueMethodHandleParser: Parser<number, Uint8Array> = parserCreatorCompose(
	() => createEncodedValueArgParser(0x16),
	sizeSubOne => {
		const size = sizeSubOne + 1;

		if (size === 1) {
			return promiseCompose(
				createFixedLengthSequenceParser(size),
				(uint8Array) => {
					const buffer = Buffer.from(uint8Array);
					return buffer.readUInt8(0);
				},
			);
		}

		if (size === 2) {
			return promiseCompose(
				createFixedLengthSequenceParser(size),
				(uint8Array) => {
					const buffer = Buffer.from(uint8Array);
					return buffer.readUInt16LE(0);
				},
			);
		}

		invariant(size === 4, '(encodedValueMethodHandleParser) Unexpected size: %s', size);

		return promiseCompose(
			createFixedLengthSequenceParser(size),
			(uint8Array) => {
				const buffer = Buffer.from(uint8Array);
				return buffer.readUInt32LE(0);
			},
		);
	},
)();

setParserName(encodedValueMethodHandleParser, 'encodedValueMethodHandleParser');

const encodedValueStringParser: Parser<number, Uint8Array> = parserCreatorCompose(
	() => createEncodedValueArgParser(0x17),
	sizeSubOne => {
		const size = sizeSubOne + 1;

		if (size === 1) {
			return promiseCompose(
				createFixedLengthSequenceParser(size),
				(uint8Array) => {
					const buffer = Buffer.from(uint8Array);
					return buffer.readUInt8(0);
				},
			);
		}

		if (size === 2) {
			return promiseCompose(
				createFixedLengthSequenceParser(size),
				(uint8Array) => {
					const buffer = Buffer.from(uint8Array);
					return buffer.readUInt16LE(0);
				},
			);
		}

		invariant(size === 4, '(encodedValueStringParser) Unexpected size: %s', size);

		return promiseCompose(
			createFixedLengthSequenceParser(size),
			(uint8Array) => {
				const buffer = Buffer.from(uint8Array);
				return buffer.readUInt32LE(0);
			},
		);
	},
)();

setParserName(encodedValueStringParser, 'encodedValueStringParser');

const encodedValueTypeParser: Parser<number, Uint8Array> = parserCreatorCompose(
	() => createEncodedValueArgParser(0x18),
	sizeSubOne => {
		const size = sizeSubOne + 1;

		if (size === 1) {
			return promiseCompose(
				createFixedLengthSequenceParser(size),
				(uint8Array) => {
					const buffer = Buffer.from(uint8Array);
					return buffer.readUInt8(0);
				},
			);
		}

		if (size === 2) {
			return promiseCompose(
				createFixedLengthSequenceParser(size),
				(uint8Array) => {
					const buffer = Buffer.from(uint8Array);
					return buffer.readUInt16LE(0);
				},
			);
		}

		invariant(size === 4, '(encodedValueTypeParser) Unexpected size: %s', size);

		return promiseCompose(
			createFixedLengthSequenceParser(size),
			(uint8Array) => {
				const buffer = Buffer.from(uint8Array);
				return buffer.readUInt32LE(0);
			},
		);
	},
)();

setParserName(encodedValueTypeParser, 'encodedValueTypeParser');

const encodedValueFieldParser: Parser<number, Uint8Array> = parserCreatorCompose(
	() => createEncodedValueArgParser(0x19),
	sizeSubOne => {
		const size = sizeSubOne + 1;

		if (size === 1) {
			return promiseCompose(
				createFixedLengthSequenceParser(size),
				(uint8Array) => {
					const buffer = Buffer.from(uint8Array);
					return buffer.readUInt8(0);
				},
			);
		}

		if (size === 2) {
			return promiseCompose(
				createFixedLengthSequenceParser(size),
				(uint8Array) => {
					const buffer = Buffer.from(uint8Array);
					return buffer.readUInt16LE(0);
				},
			);
		}

		invariant(size === 4, '(encodedValueFieldParser) Unexpected size: %s', size);

		return promiseCompose(
			createFixedLengthSequenceParser(size),
			(uint8Array) => {
				const buffer = Buffer.from(uint8Array);
				return buffer.readUInt32LE(0);
			},
		);
	},
)();

setParserName(encodedValueFieldParser, 'encodedValueFieldParser');

const encodedValueMethodParser: Parser<number, Uint8Array> = parserCreatorCompose(
	() => createEncodedValueArgParser(0x1a),
	sizeSubOne => {
		const size = sizeSubOne + 1;

		if (size === 1) {
			return promiseCompose(
				createFixedLengthSequenceParser(size),
				(uint8Array) => {
					const buffer = Buffer.from(uint8Array);
					return buffer.readUInt8(0);
				},
			);
		}

		if (size === 2) {
			return promiseCompose(
				createFixedLengthSequenceParser(size),
				(uint8Array) => {
					const buffer = Buffer.from(uint8Array);
					return buffer.readUInt16LE(0);
				},
			);
		}

		invariant(size === 4, '(encodedValueMethodParser) Unexpected size: %s', size);

		return promiseCompose(
			createFixedLengthSequenceParser(size),
			(uint8Array) => {
				const buffer = Buffer.from(uint8Array);
				return buffer.readUInt32LE(0);
			},
		);
	},
)();

setParserName(encodedValueMethodParser, 'encodedValueMethodParser');

const encodedValueEnumParser: Parser<number, Uint8Array> = parserCreatorCompose(
	() => createEncodedValueArgParser(0x1b),
	sizeSubOne => {
		const size = sizeSubOne + 1;

		if (size === 1) {
			return promiseCompose(
				createFixedLengthSequenceParser(size),
				(uint8Array) => {
					const buffer = Buffer.from(uint8Array);
					return buffer.readUInt8(0);
				},
			);
		}

		if (size === 2) {
			return promiseCompose(
				createFixedLengthSequenceParser(size),
				(uint8Array) => {
					const buffer = Buffer.from(uint8Array);
					return buffer.readUInt16LE(0);
				},
			);
		}

		invariant(size === 4, '(encodedValueEnumParser) Unexpected size: %s', size);

		return promiseCompose(
			createFixedLengthSequenceParser(size),
			(uint8Array) => {
				const buffer = Buffer.from(uint8Array);
				return buffer.readUInt32LE(0);
			},
		);
	},
)();

setParserName(encodedValueEnumParser, 'encodedValueEnumParser');

type DexEncodedArray = DexEncodedValue[];

const encodedArrayParser: Parser<DexEncodedArray, Uint8Array> = parserCreatorCompose(
	() => uleb128NumberParser,
	(size) => createQuantifierParser(
		encodedValueParser,
		size,
	),
)();

setParserName(encodedArrayParser, 'encodedArrayParser');

const encodedValueArrayParser: Parser<DexEncodedValue[], Uint8Array> = promiseCompose(
	createTupleParser([
		parserCreatorCompose(
			() => createEncodedValueArgParser(0x1c),
			valueArg => parserContext => {
				parserContext.invariant(valueArg === 0, '(encodedValueArrayParser) valueArg: %s', valueArg);
			},
		)(),
		encodedArrayParser,
	]),
	([ _, array ]) => array,
);

setParserName(encodedValueArrayParser, 'encodedValueArrayParser');

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
		uleb128NumberParser,
		createParserAccessorParser(() => encodedValueParser),
	]),
	([ nameIndex, value ]) => ({ nameIndex, value }),
);

setParserName(annotationElementParser, 'annotationElementParser');

const encodedAnnotationParser: Parser<DexEncodedAnnotation, Uint8Array> = promiseCompose(
	parserCreatorCompose(
		() => createTupleParser([
			uleb128NumberParser,
			uleb128NumberParser,
		]),
		([
			typeIndex,
			size,
		]) => createTupleParser([
			() => typeIndex,
			createQuantifierParser(
				annotationElementParser,
				size,
			),
		]),
	)(),
	([ typeIndex, elements ]) => ({ typeIndex, elements }),
);

setParserName(encodedAnnotationParser, 'encodedAnnotationParser');

const encodedValueAnnotationParser: Parser<DexEncodedAnnotation, Uint8Array> = promiseCompose(
	createTupleParser([
		parserCreatorCompose(
			() => createEncodedValueArgParser(0x1d),
			valueArg => parserContext => {
				parserContext.invariant(valueArg === 0, '(encodedValueAnnotationParser) valueArg: %s', valueArg);
			},
		)(),
		encodedAnnotationParser,
	]),
	([ _, annotation ]) => annotation,
);

setParserName(encodedValueAnnotationParser, 'encodedValueAnnotationParser');

const encodedValueNullParser: Parser<null, Uint8Array> = parserCreatorCompose(
	() => createEncodedValueArgParser(0x1e),
	valueArg => parserContext => {
		parserContext.invariant(valueArg === 0, '(encodedValueNullParser) valueArg: %s', valueArg);
		return null;
	},
)();

setParserName(encodedValueNullParser, 'encodedValueNullParser');

const encodedValueBooleanParser: Parser<boolean, Uint8Array> = promiseCompose(
	createEncodedValueArgParser(0x1f),
	(value) => Boolean(value),
);

setParserName(encodedValueBooleanParser, 'encodedValueBooleanParser');

type DexEncodedValue = number | DexEncodedValue[] | undefined;

const encodedValueParser: Parser<DexEncodedValue, Uint8Array> = createDisjunctionParser([
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

setParserName(encodedValueParser, 'encodedValueParser');

type DexTryItem = {
	startAddress: number;
	instructionCount: number;
	handlerOffset: OffsetFromEncodedCatchHandlerListToEncodedCatchHandler;
};

type DexTry = {
	startAddress: number;
	instructionCount: number;
	handler: DexEncodedCatchHandler;
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
		handlerOffset: isoOffsetFromEncodedCatchHandlerListToEncodedCatchHandler.wrap(handlerOffset),
	}),
);

setParserName(tryItemParser, 'tryItemParser');

type DexEncodedTypeAddressPair = {
	typeIndex: IndexIntoTypeIds;
	address: number;
};

const encodedTypeAddressPairParser: Parser<DexEncodedTypeAddressPair, Uint8Array> = promiseCompose(
	createTupleParser([
		uleb128NumberParser,
		uleb128NumberParser,
	]),
	([
		typeIndex,
		address,
	]) => ({
		typeIndex: isoIndexIntoTypeIds.wrap(typeIndex),
		address,
	}),
);

type DexEncodedCatchHandler = {
	handlers: DexEncodedTypeAddressPair[],
	catchAllAddress: undefined | number,
};

const encodedCatchHandlerParser: Parser<DexEncodedCatchHandler, Uint8Array> = parserCreatorCompose(
	() => sleb128NumberParser,
	size => promiseCompose(
		createTupleParser([
			createQuantifierParser(
				encodedTypeAddressPairParser,
				Math.abs(size),
			),
			size <= 0 ? uleb128NumberParser : () => undefined,
		]),
		([
			handlers,
			catchAllAddress,
		]) => ({
			size,
			handlers,
			catchAllAddress,
		}),
	),
)();

setParserName(encodedCatchHandlerParser, 'encodedCatchHandlerParser');

type DexEncodedCatchHandlerByRelativeOffset = Map<OffsetFromEncodedCatchHandlerListToEncodedCatchHandler, DexEncodedCatchHandler>;

const encodedCatchHandlerListParser: Parser<DexEncodedCatchHandlerByRelativeOffset, Uint8Array> = async (parserContext) => {
	const listOffset = parserContext.position;
	const handlers: DexEncodedCatchHandlerByRelativeOffset = new Map();

	const size = await uleb128NumberParser(parserContext);

	for (let i = 0; i < size; i += 1) {
		const handlerRelativeOffset = isoOffsetFromEncodedCatchHandlerListToEncodedCatchHandler.wrap(
			parserContext.position - listOffset,
		);
		const handler = await encodedCatchHandlerParser(parserContext);

		handlers.set(handlerRelativeOffset, handler);
	}

	return handlers;
};

setParserName(encodedCatchHandlerListParser, 'encodedCatchHandlerListParser');

type DexCodeItem = {
	registersSize: number;
	insSize: number;
	outsSize: number;
	debugInfoOffset: OffsetToDebugInfoItem;
	instructions: Uint8Array;
	tryItems: DexTryItem[];
	handlers: DexEncodedCatchHandlerByRelativeOffset;
};

type DexCode = {
	registersSize: number;
	insSize: number;
	outsSize: number;
	debugInfo: undefined | DexDebugInfo;
	instructions: Uint8Array;
	tries: DexTry[];
};

const dexCodeItemParser: Parser<DexCodeItem, Uint8Array> = parserCreatorCompose(
	() => createTupleParser([
		byteAlign4Parser,
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
	]) => {
		return promiseCompose(
			createTupleParser([
				setParserName(createFixedLengthSequenceParser(instructionsSize * 2), `instructionsParser(${instructionsSize * 2})`),
				byteAlign4Parser,
				(
					triesSize !== 0
						? createQuantifierParser(
							tryItemParser,
							triesSize,
						)
						: () => []
				),
				(
					triesSize !== 0
						? encodedCatchHandlerListParser
						: () => new Map()
				),
			]),
			([
				instructions,
				_padding,
				tryItems,
				handlers,
			]) => {
				return {
					registersSize,
					insSize,
					outsSize,
					triesSize,
					debugInfoOffset: isoOffsetToDebugInfoItem.wrap(debugInfoOffset),
					instructions,
					tryItems,
					handlers,
				};
			},
		);
	},
)();

setParserName(dexCodeItemParser, 'dexCodeItemParser');

type DexCodeItemByOffset = Map<OffsetToCodeItem, DexCodeItem>;

const createSkipToThenCodeItemsParser = (sizeOffset: SizeOffset): Parser<DexCodeItemByOffset, Uint8Array> => createSkipToThenItemByOffsetParser({
	sizeOffset,
	itemParser: dexCodeItemParser,
	byteAlign4: true,
	isoOffset: isoOffsetToCodeItem,
	parserName: 'skipToThenCodeItemsParser',
});

type DexDebugByteCodeValueItem =
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
		nameIndex: IndexIntoStringIds;
		typeIndex: IndexIntoTypeIds;
	}
	| {
		type: 'startLocalExtended';
		registerNum: number;
		nameIndex: IndexIntoStringIds;
		typeIndex: IndexIntoTypeIds;
		signatureIndex: IndexIntoStringIds;
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
		nameIndex: IndexIntoStringIds;
	}
	| {
		type: 'special';
		value: number;
	}
;

type DexDebugByteCodeValue =
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

const dexDebugByteCodeValueParser: Parser<DexDebugByteCodeValueItem, Uint8Array> = parserCreatorCompose(
	() => ubyteParser,
	(value): Parser<DexDebugByteCodeValueItem, Uint8Array> => {
		switch (value) {
			case 0x01: return promiseCompose(
				uleb128NumberParser,
				(addressDiff) => ({ type: 'advancePc', addressDiff }),
			);
			case 0x02: return promiseCompose(
				sleb128NumberParser,
				(lineDiff) => ({ type: 'advanceLine', lineDiff }),
			);
			case 0x03: return promiseCompose(
				createTupleParser([
					uleb128NumberParser,
					uleb128NumberParser,
					uleb128NumberParser,
				]),
				([ registerNum, nameIndex, typeIndex ]) => ({
					type: 'startLocal',
					registerNum,
					nameIndex: isoIndexIntoStringIds.wrap(nameIndex),
					typeIndex: isoIndexIntoTypeIds.wrap(typeIndex),
				}),
			);
			case 0x04: return promiseCompose(
				createTupleParser([
					uleb128NumberParser,
					uleb128NumberParser,
					uleb128NumberParser,
					uleb128NumberParser,
				]),
				([ registerNum, nameIndex, typeIndex, signatureIndex ]) => ({
					type: 'startLocalExtended',
					registerNum,
					nameIndex: isoIndexIntoStringIds.wrap(nameIndex),
					typeIndex: isoIndexIntoTypeIds.wrap(typeIndex),
					signatureIndex: isoIndexIntoStringIds.wrap(signatureIndex),
				}),
			);
			case 0x05: return promiseCompose(
				uleb128NumberParser,
				(registerNum) => ({ type: 'endLocal', registerNum }),
			);
			case 0x06: return promiseCompose(
				uleb128NumberParser,
				(registerNum) => ({ type: 'restartLocal', registerNum }),
			);
			case 0x07: return () => ({ type: 'setPrologueEnd' });
			case 0x08: return () => ({ type: 'setEpilogueBegin' });
			case 0x09: return promiseCompose(
				uleb128NumberParser,
				(nameIndex) => ({ type: 'setFile', nameIndex: isoIndexIntoStringIds.wrap(nameIndex) }),
			);
			default: return parserContext => {
				parserContext.invariant(value >= 0x0a, 'Unexpected special value: %s', value);
				return { type: 'special', value };
			};
		}
	}
)();

setParserName(dexDebugByteCodeValueParser, 'dexDebugByteCodeValueParser');

type DexDebugByteCodeItem = DexDebugByteCodeValueItem[];

type DexDebugByteCode = DexDebugByteCodeValue[];

const debugByteCodeParser: Parser<DexDebugByteCodeItem, Uint8Array> = promiseCompose(
	createTerminatedArrayParserUnsafe(
		dexDebugByteCodeValueParser,
		nullByteParser,
	),
	([ values ]) => values,
);

setParserName(debugByteCodeParser, 'debugByteCodeParser');

type DexDebugInfoItem = {
	lineStart: number;
	parameterNames: (undefined | IndexIntoStringIds)[];
	bytecode: DexDebugByteCodeItem;
};

const DEX_DEBUG_INFO_ITEM_PARAMETER_NAME_NO_INDEX = -1;

type DexDebugInfo = {
	lineStart: number;
	parameterNames: (undefined | string)[];
	bytecode: DexDebugByteCode;
};

const debugInfoItemParser: Parser<DexDebugInfoItem, Uint8Array> = parserCreatorCompose(
	() => createTupleParser([
		uleb128NumberParser,
		uleb128NumberParser,
	]),
	([
		lineStart,
		parametersSize,
	]) => promiseCompose(
		createTupleParser([
			createQuantifierParser(
				uleb128p1NumberParser,
				parametersSize,
			),
			debugByteCodeParser,
		]),
		([ parameterNames, bytecode ]) => ({
			lineStart,
			parameterNames: parameterNames.map(parameterName => parameterName === DEX_DEBUG_INFO_ITEM_PARAMETER_NAME_NO_INDEX ? undefined : isoIndexIntoStringIds.wrap(parameterName)),
			bytecode,
		}),
	),
)();

setParserName(debugInfoItemParser, 'debugInfoItemParser');

type DexDebugInfoItemByOffset = Map<OffsetToDebugInfoItem, DexDebugInfoItem>;

const createSkipToThenDebugInfoItemsParser = (sizeOffset: SizeOffset): Parser<DexDebugInfoItemByOffset, Uint8Array> => createSkipToThenItemByOffsetParser({
	sizeOffset,
	itemParser: debugInfoItemParser,
	byteAlign4: false,
	isoOffset: isoOffsetToDebugInfoItem,
	parserName: 'skipToThenDebugInfoItemsParser',
});

type DexAnnotationItemVisibility =
	| 'build'
	| 'runtime'
	| 'system'
;

const dexAnnotationItemVisibilityParser: Parser<DexAnnotationItemVisibility, Uint8Array> = promiseCompose(
	ubyteParser,
	(visibility) => {
		switch (visibility) {
			case 0x00: return 'build';
			case 0x01: return 'runtime';
			case 0x02: return 'system';
			default: invariant(false, 'Unexpected visibility: %s', visibility);
		}
	},
);

setParserName(dexAnnotationItemVisibilityParser, 'dexAnnotationItemVisibilityParser');

type DexAnnotationItem = {
	visibility: DexAnnotationItemVisibility;
	encodedAnnotation: DexEncodedAnnotation;
};

const dexAnnotationItemParser: Parser<DexAnnotationItem, Uint8Array> = promiseCompose(
	createTupleParser([
		dexAnnotationItemVisibilityParser,
		encodedAnnotationParser,
	]),
	([ visibility, encodedAnnotation ]) => ({ visibility, encodedAnnotation }),
);

setParserName(dexAnnotationItemParser, 'dexAnnotationItemParser');

type DexAnnotationItemByOffset = Map<OffsetToAnnotationItem, DexAnnotationItem>;

const createSkipToThenAnnotationItemsParser = (sizeOffset: SizeOffset): Parser<DexAnnotationItemByOffset, Uint8Array> => createSkipToThenItemByOffsetParser({
	sizeOffset,
	itemParser: dexAnnotationItemParser,
	byteAlign4: false,
	isoOffset: isoOffsetToAnnotationItem,
	parserName: 'skipToThenAnnotationItemsParser',
});

type DexHeaderAndMap = {
	headerItem: DexHeaderItem;
	mapList: DexMapList;
};

const dexHeaderAndMapParser: Parser<DexHeaderAndMap, Uint8Array> = parserCreatorCompose(
	() => dexHeaderItemParser,
	(headerItem) => promiseCompose(
		createLookaheadParser(createDexMapListParser(headerItem.mapOffset)),
		(mapList) => ({ headerItem, mapList }),
	),
)();

type DexPrototype = {
	shorty: string;
	returnType: string;
	parameters: string[];
};

type DexField = {
	class: string;
	type: string;
	name: string;
};

type DexFieldWithAccess = {
	field: DexField;
	accessFlags: DexAccessFlags;
};

type DexMethod = {
	class: string;
	prototype: DexPrototype;
	name: string;
};

type DexMethodWithAccess = {
	method: DexMethod;
	accessFlags: DexAccessFlags;
	code: undefined | DexCode;
};

type DexAnnotationOffsetItem = {
	annotationOffset: OffsetToAnnotationItem;
}

const dexAnnotationOffsetItemParser: Parser<DexAnnotationOffsetItem, Uint8Array> = promiseCompose(
	uintParser,
	(annotationOffset) => ({
		annotationOffset: isoOffsetToAnnotationItem.wrap(annotationOffset),
	}),
);

type DexAnnotationSetItem = {
	entries: DexAnnotationOffsetItem[];
};

const dexAnnotationSetItemParser: Parser<DexAnnotationSetItem, Uint8Array> = parserCreatorCompose(
	() => createTupleParser([
		byteAlign4Parser,
		uintParser,
	]),
	([ _, size ]) => promiseCompose(
		createQuantifierParser(
			dexAnnotationOffsetItemParser,
			size,
		),
		(entries) => ({ entries }),
	),
)();

type DexAnnotationSetItemByOffset = Map<OffsetToAnnotationSetItem, DexAnnotationSetItem>;

const createSkipToThenAnnotationSetItemsParser = (sizeOffset: SizeOffset): Parser<DexAnnotationSetItemByOffset, Uint8Array> => createSkipToThenItemByOffsetParser({
	sizeOffset,
	itemParser: dexAnnotationSetItemParser,
	byteAlign4: true,
	isoOffset: isoOffsetToAnnotationSetItem,
	parserName: 'skipToThenAnnotationSetItemsParser',
});

type DexAnnotationSetRefItem = OffsetToAnnotationSetItem;

const dexAnnotationSetRefItemParser: Parser<DexAnnotationSetRefItem, Uint8Array> = promiseCompose(
	uintParser,
	(annotationsOffset) => isoOffsetToAnnotationSetItem.wrap(annotationsOffset),
);

type DexAnnotationSetRefList = {
	list: DexAnnotationSetRefItem[];
};

const dexAnnotationSetRefListParser: Parser<DexAnnotationSetRefList, Uint8Array> = parserCreatorCompose(
	() => createTupleParser([
		byteAlign4Parser,
		uintParser,
	]),
	([ _, size ]) => promiseCompose(
		createQuantifierParser(
			dexAnnotationSetRefItemParser,
			size,
		),
		(list) => ({ list }),
	),
)();

type DexAnnotationSetRefListItemByOffset = Map<OffsetToAnnotationSetRefListItem, DexAnnotationSetRefList>;

const createSkipToThenAnnotationSetRefListsParser = (sizeOffset: SizeOffset): Parser<DexAnnotationSetRefListItemByOffset, Uint8Array> => createSkipToThenItemByOffsetParser({
	sizeOffset,
	itemParser: dexAnnotationSetRefListParser,
	byteAlign4: true,
	isoOffset: isoOffsetToAnnotationSetRefListItem,
	parserName: 'skipToThenAnnotationSetRefListsParser',
});

type DexClassFieldAnnotation = {
	field: DexField;
	annotations: undefined | DexAnnotationSetItem;
};

type DexClassMethodAnnotation = {
	method: DexMethod;
	annotations: undefined | DexAnnotationSetItem;
};

type DexClassParameterAnnotation = {
	method: DexMethod;
	annotations: undefined | (undefined | DexAnnotationItem[])[];
};

type DexClassAnnotations = {
	classAnnotations: undefined | DexAnnotationSetItem;
	fieldAnnotations: DexClassFieldAnnotation[];
	methodAnnotations: DexClassMethodAnnotation[];
	parameterAnnotations: DexClassParameterAnnotation[];
};

type DexClassData = {
	staticFields: DexFieldWithAccess[];
	instanceFields: DexFieldWithAccess[];
	directMethods: DexMethodWithAccess[];
	virtualMethods: DexMethodWithAccess[];
};

type DexClassDefinition = {
	class: string;
	accessFlags: DexAccessFlags,
	superclass: string;
	interfaces: string[];
	sourceFile: undefined | string;
	annotations: undefined | DexClassAnnotations;
	staticValues: DexEncodedValue[];
	classData: undefined | DexClassData;
};

type DexMapItemType =
	| 'headerItem'
	| 'stringIdItem'
	| 'typeIdItem'
	| 'prototypeIdItem'
	| 'fieldIdItem'
	| 'methodIdItem'
	| 'classDefinitionItem'
	| 'callSiteIdItem'
	| 'methodHandleItem'
	| 'mapList'
	| 'typeList'
	| 'annotationSetRefList'
	| 'annotationSetItem'
	| 'classDataItem'
	| 'codeItem'
	| 'stringDataItem'
	| 'debugInfoItem'
	| 'annotationItem'
	| 'encodedArrayItem'
	| 'annotationsDirectoryItem'
	| 'hiddenApiClassDataItem'
;

const dexMapItemTypeParser: Parser<DexMapItemType, Uint8Array> = promiseCompose(
	ushortParser,
	(type) => {
		switch (type) {
			case 0x0000: return 'headerItem';
			case 0x0001: return 'stringIdItem';
			case 0x0002: return 'typeIdItem';
			case 0x0003: return 'prototypeIdItem';
			case 0x0004: return 'fieldIdItem';
			case 0x0005: return 'methodIdItem';
			case 0x0006: return 'classDefinitionItem';
			case 0x0007: return 'callSiteIdItem';
			case 0x0008: return 'methodHandleItem';
			case 0x1000: return 'mapList';
			case 0x1001: return 'typeList';
			case 0x1002: return 'annotationSetRefList';
			case 0x1003: return 'annotationSetItem';
			case 0x2000: return 'classDataItem';
			case 0x2001: return 'codeItem';
			case 0x2002: return 'stringDataItem';
			case 0x2003: return 'debugInfoItem';
			case 0x2004: return 'annotationItem';
			case 0x2005: return 'encodedArrayItem';
			case 0x2006: return 'annotationsDirectoryItem';
			case 0xF000: return 'hiddenApiClassDataItem';
			default: invariant(false, 'Unexpected map item type: %s', type);
		}
	},
);

type DexMapItem = {
	type: DexMapItemType;
	size: number;
	offset: number;
};

const dexMapItemParser: Parser<DexMapItem, Uint8Array> = promiseCompose(
	createTupleParser([
		dexMapItemTypeParser,
		ushortParser,
		uintParser,
		uintParser,
	]),
	([ type, _unused, size, offset ]) => ({ type, size, offset }),
);

type DexMapList = DexMapItem[];

const dexMapListParser: Parser<DexMapList, Uint8Array> = parserCreatorCompose(
	() => uintParser,
	size => {
		return createQuantifierParser(
			dexMapItemParser,
			size,
		);
	},
)();

setParserName(dexMapListParser, 'dexMapListParser');

const createDexMapListParser = (mapOffset: number): Parser<DexMapList, Uint8Array> => {
	const dexMapParser = promiseCompose(
		createTupleParser([
			createSkipToParser(mapOffset),
			dexMapListParser,
		]),
		([ _, map ]) => map,
	);

	setParserName(dexMapParser, 'dexMapParser');

	return dexMapParser;
};

type DexEncodedArrayItem = DexEncodedArray;

type DexEncodedArrayItemByOffset = Map<OffsetToEncodedArrayItem, DexEncodedArrayItem>;

const createSkipToThenEncodedArrayItemsParser = (sizeOffset: SizeOffset): Parser<DexEncodedArrayItemByOffset, Uint8Array> => createSkipToThenItemByOffsetParser({
	sizeOffset,
	itemParser: encodedArrayParser,
	byteAlign4: false,
	isoOffset: isoOffsetToEncodedArrayItem,
	parserName: 'skipToThenEncodedArrayItemsParser',
});

type DexCallSiteIdItem = unknown; // TODO

type DexMethodHandleItem = unknown; // TODO

type DexHiddenApiClassDataItem = unknown; // TODO

type DexData = {
	headerItem: DexHeaderItem;
	stringIdItems: DexStringIdItems;
	typeIdItems: DexTypeIdItems;
	prototypeIdItems: DexPrototypeIdItems;
	fieldIdItems: DexFieldIdItems;
	methodIdItems: DexMethodIdItems;
	classDefinitionItems: DexClassDefinitionItem[];
	callSiteIdItems: DexCallSiteIdItem[];
	methodHandleItems: DexMethodHandleItem[];
	mapList: DexMapList;
	typeListByOffset: DexTypeListByOffset;
	annotationSetRefListItemByOffset: DexAnnotationSetRefListItemByOffset;
	annotationSetItemByOffset: DexAnnotationSetItemByOffset;
	classDataItemByOffset: DexClassDataItemByOffset;
	codeItemByOffset: DexCodeItemByOffset;
	stringDataItemStringByOffset: DexStringDataItemStringByOffset;
	debugInfoItemByOffset: DexDebugInfoItemByOffset;
	annotationItemByOffset: DexAnnotationItemByOffset;
	encodedArrayItemByOffset: DexEncodedArrayItemByOffset;
	annotationsDirectoryItemByOffset: DexAnnotationsDirectoryItemByOffset;
	hiddenApiClassDataItems: DexHiddenApiClassDataItem[];
};

const createDexDataParser = ({
	headerItem,
	mapList,
}: DexHeaderAndMap): Parser<DexData, Uint8Array> => {
	const dexDataParser: Parser<DexData, Uint8Array> = async (parserContext) => {
		let stringIdItems: DexStringIdItems = isoDexStringIdItems.wrap([]);
		let typeIdItems: DexTypeIdItems = isoDexTypeIdItems.wrap([]);
		let prototypeIdItems: DexPrototypeIdItems = isoDexPrototypeIdItems.wrap([]);
		let fieldIdItems: DexFieldIdItems = isoDexFieldIdItems.wrap([]);
		let methodIdItems: DexMethodIdItems = isoDexMethodIdItems.wrap([]);
		let classDefinitionItems: DexClassDefinitionItem[] = [];
		let callSiteIdItems: DexCallSiteIdItem[] = [];
		let methodHandleItems: DexMethodHandleItem[] = [];
		let typeListByOffset: DexTypeListByOffset = new Map();
		let annotationSetRefListItemByOffset: DexAnnotationSetRefListItemByOffset = new Map();
		let annotationSetItemByOffset: DexAnnotationSetItemByOffset = new Map();
		let classDataItemByOffset: DexClassDataItemByOffset = new Map();
		let codeItemByOffset: DexCodeItemByOffset = new Map();
		let stringDataItemStringByOffset: DexStringDataItemStringByOffset = new Map();
		let debugInfoItemByOffset: DexDebugInfoItemByOffset = new Map();
		let annotationItemByOffset: DexAnnotationItemByOffset = new Map();
		let encodedArrayItemByOffset: DexEncodedArrayItemByOffset = new Map();
		let annotationsDirectoryItemByOffset: DexAnnotationsDirectoryItemByOffset = new Map();
		let hiddenApiClassDataItems: DexHiddenApiClassDataItem[] = [];

		for (const dexMapItem of mapList) {
			if (dexMapItem.type === 'headerItem') {
				continue;
			}

			if (dexMapItem.type === 'stringIdItem') {
				stringIdItems = await createSkipToThenStringIdItemsParser(dexMapItem)(parserContext);
				continue;
			}

			if (dexMapItem.type === 'typeIdItem') {
				typeIdItems = await createSkipToThenTypeIdItemsParser(dexMapItem)(parserContext);
				continue;
			}

			if (dexMapItem.type === 'prototypeIdItem') {
				prototypeIdItems = await createSkipToThenPrototypeIdItemsParser(dexMapItem)(parserContext);
				continue;
			}

			if (dexMapItem.type === 'fieldIdItem') {
				fieldIdItems = await createSkipToThenFieldIdItemsParser(dexMapItem)(parserContext);
				continue;
			}

			if (dexMapItem.type === 'methodIdItem') {
				methodIdItems = await createSkipToThenMethodIdItemsParser(dexMapItem)(parserContext);
				continue;
			}

			if (dexMapItem.type === 'classDefinitionItem') {
				classDefinitionItems = await createSkipToThenClassDefinitionItemsParser(dexMapItem)(parserContext);
				continue;
			}

			if (dexMapItem.type === 'callSiteIdItem') {
				// TODO
			}

			if (dexMapItem.type === 'methodHandleItem') {
				// TODO
			}

			if (dexMapItem.type === 'mapList') {
				continue;
			}

			if (dexMapItem.type === 'typeList') {
				typeListByOffset = await createSkipToThenTypeListByOffsetParser(dexMapItem)(parserContext);
				continue;
			}

			if (dexMapItem.type === 'annotationSetRefList') {
				annotationSetRefListItemByOffset = await createSkipToThenAnnotationSetRefListsParser(dexMapItem)(parserContext);
				continue;
			}

			if (dexMapItem.type === 'annotationSetItem') {
				annotationSetItemByOffset = await createSkipToThenAnnotationSetItemsParser(dexMapItem)(parserContext);
				continue;
			}

			if (dexMapItem.type === 'classDataItem') {
				classDataItemByOffset = await createSkipToThenClassDataItemsParser(dexMapItem)(parserContext);
				continue;
			}

			if (dexMapItem.type === 'codeItem') {
				codeItemByOffset = await createSkipToThenCodeItemsParser(dexMapItem)(parserContext);
				continue;
			}

			if (dexMapItem.type === 'stringDataItem') {
				stringDataItemStringByOffset = await createSkipToThenStringsParser(dexMapItem)(parserContext);
				continue;
			}

			if (dexMapItem.type === 'debugInfoItem') {
				debugInfoItemByOffset = await createSkipToThenDebugInfoItemsParser(dexMapItem)(parserContext);
				continue;
			}

			if (dexMapItem.type === 'annotationItem') {
				annotationItemByOffset = await createSkipToThenAnnotationItemsParser(dexMapItem)(parserContext);
				continue;
			}

			if (dexMapItem.type === 'encodedArrayItem') {
				encodedArrayItemByOffset = await createSkipToThenEncodedArrayItemsParser(dexMapItem)(parserContext);
				continue;
			}

			if (dexMapItem.type === 'annotationsDirectoryItem') {
				annotationsDirectoryItemByOffset = await createSkipToThenAnnotationsDirectoryItemsParser(dexMapItem)(parserContext);
				continue;
			}

			if (dexMapItem.type === 'hiddenApiClassDataItem') {
				// TODO
			}

			invariant(false, 'Unexpected map item type: %s', dexMapItem.type);
		}

		return {
			headerItem,
			stringIdItems,
			typeIdItems,
			prototypeIdItems,
			fieldIdItems,
			methodIdItems,
			classDefinitionItems,
			callSiteIdItems,
			methodHandleItems,
			mapList,
			typeListByOffset,
			annotationSetRefListItemByOffset,
			annotationSetItemByOffset,
			classDataItemByOffset,
			codeItemByOffset,
			stringDataItemStringByOffset,
			debugInfoItemByOffset,
			annotationItemByOffset,
			encodedArrayItemByOffset,
			annotationsDirectoryItemByOffset,
			hiddenApiClassDataItems,
		};
	};

	setParserName(dexDataParser, 'dexDataParser');

	return dexDataParser;
};

type Dex = {
	classDefinitions: DexClassDefinition[];
	link: undefined | Uint8Array,
};

export const dexParser: Parser<Dex, Uint8Array> = parserCreatorCompose(
	() => dexHeaderAndMapParser,
	({
		headerItem,
		mapList,
	}) => promiseCompose(
		createTupleParser([
			createLookaheadParser(createDexDataParser({ headerItem, mapList })),
			createRawDataParser(headerItem.link),
		]),
		async ([
			{
				headerItem: _headerItem,
				stringIdItems,
				typeIdItems,
				prototypeIdItems,
				fieldIdItems,
				methodIdItems,
				classDefinitionItems,
				// callSiteIdItems,
				// methodHandleItems,
				mapList: _mapList,
				typeListByOffset,
				annotationSetRefListItemByOffset,
				annotationSetItemByOffset,
				classDataItemByOffset,
				codeItemByOffset,
				stringDataItemStringByOffset,
				debugInfoItemByOffset,
				annotationItemByOffset,
				encodedArrayItemByOffset,
				annotationsDirectoryItemByOffset,
				// hiddenApiClassDataItems,
			},
			link,
		]) => {
			const strings = stringIdItems.map((stringId) => {
				const stringOffset = stringId;
				const string = stringDataItemStringByOffset.get(stringOffset);
				invariant(string !== undefined, 'String must be there. String offset: %s', stringOffset);

				return string;
			});

			const types = typeIdItems.map((typeId) => {
				const type = strings.at(typeId);
				invariant(type, 'Type string must be there. Type id: %s', typeId);

				return type;
			});

			const resolvedTypeListByOffset = new Map<OffsetToTypeList, string[]>([
				[ isoOffsetToTypeList.wrap(0), [] ],
			]);

			for (const [ offset, typeIndexes ] of typeListByOffset) {
				const typeNames = isoDexTypeList.unwrap(typeIndexes).map((typeIndex) => {
					const type = types.at(typeIndex);
					invariant(type, 'Type must be there. Type id: %s', typeIndex);

					return type;
				});

				resolvedTypeListByOffset.set(offset, typeNames);
			}

			const prototypes = prototypeIdItems.map((prototypeId) => {
				const shorty = strings.at(prototypeId.shortyIndex);
				invariant(shorty, 'Shorty must be there. Shorty id: %s', prototypeId.shortyIndex);

				const returnType = types.at(prototypeId.returnTypeIndex);
				invariant(returnType, 'Return type must be there. Return type id: %s', prototypeId.returnTypeIndex);

				const parameters = resolvedTypeListByOffset.get(prototypeId.parametersOffset);
				invariant(parameters !== undefined, 'Parameters must be there. Parameters offset: %s', prototypeId.parametersOffset);

				return { shorty, returnType, parameters };
			});

			const fields = fieldIdItems.map((fieldId) => {
				const class_ = types.at(fieldId.classIndex);
				invariant(class_, 'Class must be there. Class id: %s', fieldId.classIndex);

				const type = types.at(fieldId.typeIndex);
				invariant(type, 'Type must be there. Type id: %s', fieldId.typeIndex);

				const name = strings.at(fieldId.nameIndex);
				invariant(name, 'Name string must be there. String offset: %s', fieldId.nameIndex);

				return { class: class_, type, name };
			});

			const methods = methodIdItems.map((methodId) => {
				const class_ = types.at(methodId.classIndex);
				invariant(class_, 'Class must be there. Class id: %s', methodId.classIndex);

				const prototype = prototypes.at(methodId.prototypeIndex);
				invariant(prototype, 'Prototype must be there. Prototype id: %s', methodId.prototypeIndex);

				const name = strings.at(methodId.nameIndex);
				invariant(name, 'Name string must be there. String offset: %s', methodId.nameIndex);

				return { class: class_, prototype, name };
			});

			const debugInfoByOffset = new Map<OffsetToDebugInfoItem, undefined | DexDebugInfo>([
				[ isoOffsetToDebugInfoItem.wrap(0), undefined ],
			]);

			for (const [ offset, debugInfoItem ] of debugInfoItemByOffset) {
				debugInfoByOffset.set(offset, {
					lineStart: debugInfoItem.lineStart,
					parameterNames: debugInfoItem.parameterNames.map((index) => {
						if (index === undefined) {
							return undefined;
						}

						const string = strings.at(index);
						invariant(string !== undefined, 'String must be there. String id: %s', index);

						return string;
					}),
					bytecode: debugInfoItem.bytecode.map((value) => {
						switch (value.type) {
							case 'startLocal': return {
								type: 'startLocal',
								registerNum: value.registerNum,
								name: value.nameIndex === undefined ? undefined : strings.at(value.nameIndex),
								type_: value.typeIndex === undefined ? undefined : types.at(value.typeIndex),
							};
							case 'startLocalExtended': return {
								type: 'startLocalExtended',
								registerNum: value.registerNum,
								name: value.nameIndex === undefined ? undefined : strings.at(value.nameIndex),
								type_: value.typeIndex === undefined ? undefined : types.at(value.typeIndex),
								signature: value.signatureIndex === undefined ? undefined : strings.at(value.signatureIndex),
							};
							case 'setFile': return { type: 'setFile', name: strings.at(value.nameIndex) };
							default: return value;
						}
					}),
				});
			}

			const codeByOffset = new Map<OffsetToCodeItem, undefined | DexCode>([
				[ isoOffsetToCodeItem.wrap(0), undefined ],
			]);

			for (const [ offset, codeItem ] of codeItemByOffset) {
				const debugInfo = debugInfoByOffset.get(codeItem.debugInfoOffset);

				codeByOffset.set(offset, {
					registersSize: codeItem.registersSize,
					insSize: codeItem.insSize,
					outsSize: codeItem.outsSize,
					debugInfo: debugInfo,
					instructions: codeItem.instructions,
					tries: codeItem.tryItems.map((tryItem) => {
						const handler = codeItem.handlers.get(tryItem.handlerOffset);
						invariant(handler, 'Handler must be there. Handler offset: %s', tryItem.handlerOffset);

						return {
							startAddress: tryItem.startAddress,
							instructionCount: tryItem.instructionCount,
							handler,
						};
					}),
				});
			}

			const classDataByOffset = new Map<OffsetToClassDataItem, undefined | DexClassData>([
				[ isoOffsetToClassDataItem.wrap(0), undefined ],
			]);

			for (const [ offset, classDataItem ] of classDataItemByOffset) {
				classDataByOffset.set(offset, {
					staticFields: classDataItem.staticFields.map((encodedField) => {
						const field = fields.at(encodedField.fieldIndex);
						invariant(field, 'Field must be there. Field id: %s', encodedField.fieldIndex);

						return {
							field,
							accessFlags: encodedField.accessFlags,
						};
					}),

					instanceFields: classDataItem.instanceFields.map((encodedField) => {
						const field = fields.at(encodedField.fieldIndex);
						invariant(field, 'Field must be there. Field id: %s', encodedField.fieldIndex);

						return {
							field,
							accessFlags: encodedField.accessFlags,
						};
					}),

					directMethods: classDataItem.directMethods.map((method) => {
						const method_ = methods.at(method.methodIndex);
						invariant(method_, 'Method must be there. Method id: %s', method.methodIndex);

						const code = codeByOffset.get(method.codeOffset);

						return {
							method: method_,
							accessFlags: method.accessFlags,
							code,
						};
					}),

					virtualMethods: classDataItem.virtualMethods.map((method) => {
						const method_ = methods.at(method.methodIndex);
						invariant(method_, 'Method must be there. Method id: %s', method.methodIndex);

						const code = codeByOffset.get(method.codeOffset);

						return {
							method: method_,
							accessFlags: method.accessFlags,
							code,
						};
					}),
				});
			}

			const classDefinitions = classDefinitionItems.map((classDefinitionItem) => {
				const class_ = types.at(classDefinitionItem.classIndex);
				invariant(class_, 'Class must be there. Class id: %s', classDefinitionItem.classIndex);

				const superclass = types.at(classDefinitionItem.superclassIndex);
				invariant(superclass, 'Superclass must be there. Superclass id: %s', classDefinitionItem.superclassIndex);

				const interfaces = resolvedTypeListByOffset.get(classDefinitionItem.interfacesOffset);
				invariant(interfaces !== undefined, 'Interfaces must be there. Interfaces offset: %s', classDefinitionItem.interfacesOffset);

				const sourceFile = classDefinitionItem.sourceFileIndex === undefined ? undefined : strings.at(classDefinitionItem.sourceFileIndex);

				const annotationsDirectoryItem = annotationsDirectoryItemByOffset.get(classDefinitionItem.annotationsOffset);
				invariant(
					isoOffsetToAnnotationsDirectoryItem.unwrap(classDefinitionItem.annotationsOffset) === 0 || annotationsDirectoryItem,
					'Annotations directory item must be there. Annotations offset: %s',
					classDefinitionItem.annotationsOffset,
				);

				const annotations = (() => {
					if (!annotationsDirectoryItem) {
						return undefined;
					}

					const classAnnotations = annotationSetItemByOffset.get(annotationsDirectoryItem.classAnnotationsOffset);
					invariant(
						isoOffsetToAnnotationSetItem.unwrap(annotationsDirectoryItem.classAnnotationsOffset) === 0 || classAnnotations,
						'Class annotations must be there. Class annotations offset: %s',
						annotationsDirectoryItem.classAnnotationsOffset,
					);

					const fieldAnnotations = annotationsDirectoryItem.fieldAnnotations.map((fieldAnnotation) => {
						const field = fields.at(fieldAnnotation.fieldIndex);
						invariant(field, 'Field must be there. Field id: %s', fieldAnnotation.fieldIndex);

						const annotations = annotationSetItemByOffset.get(fieldAnnotation.annotationsOffset);
						invariant(
							isoOffsetToAnnotationSetItem.unwrap(fieldAnnotation.annotationsOffset) === 0 || annotations,
							'Annotations must be there. Annotations offset: %s',
							fieldAnnotation.annotationsOffset,
						);

						return { field, annotations };
					});

					const methodAnnotations = annotationsDirectoryItem.methodAnnotations.map((methodAnnotation) => {
						const method = methods.at(methodAnnotation.methodIndex);
						invariant(method, 'Method must be there. Method id: %s', methodAnnotation.methodIndex);

						const annotations = annotationSetItemByOffset.get(methodAnnotation.annotationsOffset);
						invariant(
							isoOffsetToAnnotationSetItem.unwrap(methodAnnotation.annotationsOffset) === 0 || annotations,
							'Annotations must be there. Annotations offset: %s',
							methodAnnotation.annotationsOffset,
						);

						return { method, annotations };
					});

					const parameterAnnotations = annotationsDirectoryItem.parameterAnnotations.map((parameterAnnotation) => {
						const method = methods.at(parameterAnnotation.methodIndex);
						invariant(method, 'Method must be there. Method id: %s', parameterAnnotation.methodIndex);

						const annotationSetRefList = annotationSetRefListItemByOffset.get(parameterAnnotation.annotationsOffset);
						invariant(
							isoOffsetToAnnotationSetRefListItem.unwrap(parameterAnnotation.annotationsOffset) === 0 || annotationSetRefList,
							'Annotations must be there. Annotations offset: %s',
							parameterAnnotation.annotationsOffset,
						);

						const annotations = annotationSetRefList?.list.map((annotationSetRefItem) => {
							const annotationSetItem = annotationSetItemByOffset.get(annotationSetRefItem);
							invariant(
								isoOffsetToAnnotationSetItem.unwrap(annotationSetRefItem) === 0 || annotationSetItem,
								'Annotations must be there. Annotations offset: %s',
								annotationSetRefItem,
							);

							const annotationItems = annotationSetItem?.entries.map((annotationOffsetItem) => {
								const annotationItem = annotationItemByOffset.get(annotationOffsetItem.annotationOffset);
								invariant(
									annotationItem,
									'Annotation must be there. Annotation offset: %s',
									annotationOffsetItem.annotationOffset,
								);

								return annotationItem;
							});

							return annotationItems;
						});

						return { method, annotations };
					});

					return {
						classAnnotations,
						fieldAnnotations,
						methodAnnotations,
						parameterAnnotations,
					};
				})();

				const classData = classDataByOffset.get(classDefinitionItem.classDataOffset);

				const staticValues = isoOffsetToEncodedArrayItem.unwrap(classDefinitionItem.staticValuesOffset) === 0 ? [] : encodedArrayItemByOffset.get(classDefinitionItem.staticValuesOffset);
				invariant(staticValues, 'Static values must be there. Static values offset: %s', classDefinitionItem.staticValuesOffset);

				return {
					class: class_,
					accessFlags: classDefinitionItem.accessFlags,
					superclass,
					interfaces,
					sourceFile,
					annotations,
					classData,
					staticValues,
				};
			});

			return {
				classDefinitions,
				link,
			};
		},
	),
)();

setParserName(dexParser, 'dexParser');
