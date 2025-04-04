import invariant from 'invariant';
import { MUtf8Decoder } from "mutf-8";
import { createExactElementParser } from './exactElementParser.js';
import { createExactSequenceParser } from './exactSequenceParser.js';
import { createFixedLengthSequenceParser } from './fixedLengthSequenceParser.js';
import { cloneParser, setParserName, type Parser } from './parser.js';
import { parserCreatorCompose } from './parserCreatorCompose.js';
import { promiseCompose } from './promiseCompose.js';
import { createQuantifierParser } from './quantifierParser.js';
import { createTupleParser } from './tupleParser.js';
import { createParserAccessorParser } from './parserAccessorParser.js';
import { createSkipToParser } from './skipToParser.js';
import { createLookaheadParser } from './lookaheadParser.js';
import { getIsoTypedNumberArray, IndexIntoFieldIds, IndexIntoMethodIds, IndexIntoPrototypeIds, IndexIntoStringIds, IndexIntoTypeIds, isoIndexIntoFieldIds, isoIndexIntoMethodIds, isoIndexIntoPrototypeIds, isoIndexIntoStringIds, isoIndexIntoTypeIds, isoOffsetFromEncodedCatchHandlerListToEncodedCatchHandler, isoOffsetToAnnotationItem, isoOffsetToAnnotationsDirectoryItem, isoOffsetToAnnotationSetItem, isoOffsetToAnnotationSetRefListItem, isoOffsetToClassDataItem, isoOffsetToCodeItem, isoOffsetToDebugInfoItem, isoOffsetToEncodedArrayItem, isoOffsetToStringDataItem, isoOffsetToTypeList, OffsetFromEncodedCatchHandlerListToEncodedCatchHandler, OffsetToAnnotationItem, OffsetToAnnotationsDirectoryItem, OffsetToAnnotationSetItem, OffsetToAnnotationSetRefListItem, OffsetToClassDataItem, OffsetToCodeItem, OffsetToDebugInfoItem, OffsetToEncodedArrayItem, OffsetToStringDataItem, OffsetToTypeList, TypedNumberArray } from './dalvikExecutableParser/typedNumbers.js';
import { Iso } from 'monocle-ts';
import { sleb128NumberParser, uleb128NumberParser } from './leb128Parser.js';
import { createDisjunctionParser } from './disjunctionParser.js';
import { createElementTerminatedSequenceParser } from './elementTerminatedSequenceParser.js';
import { createElementTerminatedArrayParserUnsafe } from './elementTerminatedArrayParser.js';
import { createDalvikBytecodeParser, DalvikBytecode, DalvikBytecodeOperation, DalvikBytecodeOperationResolvers, resolveDalvikBytecodeOperation } from './dalvikBytecodeParser.js';
import { ubyteParser, uintParser, uleb128p1NumberParser, ushortParser } from './dalvikExecutableParser/typeParsers.js';
import { DalvikExecutable, DalvikExecutableAccessFlags, DalvikExecutableAnnotation, DalvikExecutableClassAnnotations, DalvikExecutableClassData, DalvikExecutableClassFieldAnnotation, DalvikExecutableClassMethodAnnotation, DalvikExecutableClassParameterAnnotation, DalvikExecutableCode, DalvikExecutableDebugInfo, DalvikExecutableEncodedValue } from './dalvikExecutable.js';

// https://source.android.com/docs/core/runtime/dex-format

const createByteAlignParser = (byteAlignment: number): Parser<void, Uint8Array> => async (parserContext) => {
	const toSkip = (byteAlignment - (parserContext.position % byteAlignment)) % byteAlignment;

	parserContext.skip(toSkip);
};

const byteAlign4Parser: Parser<void, Uint8Array> = createByteAlignParser(4);

const dalvikExecutableHeaderVersionParser: Parser<number, Uint8Array> = promiseCompose(
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

type DalvikExecutableHeaderItem = {
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

const dalvikExecutableHeaderItemParser: Parser<DalvikExecutableHeaderItem, Uint8Array> = promiseCompose(
	createTupleParser([
		dalvikExecutableHeaderVersionParser,
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

type DalvikExecutableStringIdItem = OffsetToStringDataItem;

const dalvikExecutableStringIdItemParser: Parser<DalvikExecutableStringIdItem, Uint8Array> = promiseCompose(
	cloneParser(uintParser),
	(offset) => isoOffsetToStringDataItem.wrap(offset),
);

type DalvikExecutableStringIdItems = TypedNumberArray<IndexIntoStringIds, DalvikExecutableStringIdItem>;

const isoDalvikExecutableStringIdItems = getIsoTypedNumberArray<IndexIntoStringIds, DalvikExecutableStringIdItem>();

const createSkipToThenStringIdItemsParser = ({ size, offset }: SizeOffset): Parser<DalvikExecutableStringIdItems, Uint8Array> => (
	size === 0
		? (() => isoDalvikExecutableStringIdItems.wrap([]))
		: promiseCompose(
			createTupleParser([
				createSkipToParser(offset),
				createQuantifierParser(
					dalvikExecutableStringIdItemParser,
					size,
				),
			]),
			([ _, stringIds ]) => isoDalvikExecutableStringIdItems.wrap(stringIds),
		)
);

type DalvikExecutableTypeIdItem = IndexIntoStringIds;

const dalvikExecutableTypeIdItemParser: Parser<DalvikExecutableTypeIdItem, Uint8Array> = promiseCompose(
	cloneParser(uintParser),
	(index) => isoIndexIntoStringIds.wrap(index),
);

type DalvikExecutableTypeIdItems = TypedNumberArray<IndexIntoTypeIds, DalvikExecutableTypeIdItem>;

const isoDalvikExecutableTypeIdItems = getIsoTypedNumberArray<IndexIntoTypeIds, DalvikExecutableTypeIdItem>();

const createSkipToThenTypeIdItemsParser = ({ size, offset }: SizeOffset): Parser<DalvikExecutableTypeIdItems, Uint8Array> => (
	size === 0
		? (() => isoDalvikExecutableTypeIdItems.wrap([]))
		: promiseCompose(
			createTupleParser([
				createSkipToParser(offset),
				createQuantifierParser(
					dalvikExecutableTypeIdItemParser,
					size,
				),
			]),
			([ _, typeIds ]) => isoDalvikExecutableTypeIdItems.wrap(typeIds),
		)
);

type DalvikExecutablePrototypeIdItem = {
	shortyIndex: IndexIntoStringIds;
	returnTypeIndex: IndexIntoTypeIds;
	parametersOffset: OffsetToTypeList;
};

const prototypeIdItemParser: Parser<DalvikExecutablePrototypeIdItem, Uint8Array> = promiseCompose(
	createTupleParser([
		byteAlign4Parser,
		uintParser,
		uintParser,
		uintParser,
	]),
	([ _, shortyIndex, returnTypeIndex, parametersOffset ]): DalvikExecutablePrototypeIdItem => ({
		shortyIndex: isoIndexIntoStringIds.wrap(shortyIndex),
		returnTypeIndex: isoIndexIntoTypeIds.wrap(returnTypeIndex),
		parametersOffset: isoOffsetToTypeList.wrap(parametersOffset),
	}),
);

type DalvikExecutablePrototypeIdItems = TypedNumberArray<IndexIntoPrototypeIds, DalvikExecutablePrototypeIdItem>;

const isoDalvikExecutablePrototypeIdItems = getIsoTypedNumberArray<IndexIntoPrototypeIds, DalvikExecutablePrototypeIdItem>();

const createSkipToThenPrototypeIdItemsParser = ({ size, offset }: SizeOffset): Parser<DalvikExecutablePrototypeIdItems, Uint8Array> => (
	size === 0
		? (() => isoDalvikExecutablePrototypeIdItems.wrap([]))
		: promiseCompose(
			createTupleParser([
				createSkipToParser(offset),
				createQuantifierParser(
					prototypeIdItemParser,
					size,
				),
			]),
			([ _, prototypeIds ]) => isoDalvikExecutablePrototypeIdItems.wrap(prototypeIds),
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

type DalvikExecutableFieldIdItem = {
	classIndex: IndexIntoTypeIds;
	typeIndex: IndexIntoTypeIds;
	nameIndex: IndexIntoStringIds;
};

const dalvikExecutableFieldIdItemParser: Parser<DalvikExecutableFieldIdItem, Uint8Array> = promiseCompose(
	createTupleParser([
		ushortParser,
		ushortParser,
		uintParser,
	]),
	([ classIndex, typeIndex, nameIndex ]): DalvikExecutableFieldIdItem => ({
		classIndex: isoIndexIntoTypeIds.wrap(classIndex),
		typeIndex: isoIndexIntoTypeIds.wrap(typeIndex),
		nameIndex: isoIndexIntoStringIds.wrap(nameIndex),
	}),
);

type DalvikExecutableFieldIdItems = TypedNumberArray<IndexIntoFieldIds, DalvikExecutableFieldIdItem>;

const isoDalvikExecutableFieldIdItems = getIsoTypedNumberArray<IndexIntoFieldIds, DalvikExecutableFieldIdItem>();

const createSkipToThenFieldIdItemsParser = ({ size, offset }: SizeOffset): Parser<DalvikExecutableFieldIdItems, Uint8Array> => (
	size === 0
		? (() => isoDalvikExecutableFieldIdItems.wrap([]))
		: promiseCompose(
			createTupleParser([
				createSkipToParser(offset),
				createQuantifierParser(
					dalvikExecutableFieldIdItemParser,
					size,
				),
			]),
			([ _, fieldIds ]) => isoDalvikExecutableFieldIdItems.wrap(fieldIds),
		)
);

type DalvikExecutableMethodIdItem = {
	classIndex: IndexIntoTypeIds;
	prototypeIndex: IndexIntoPrototypeIds;
	nameIndex: IndexIntoStringIds;
};

const dalvikExecutableMethodIdItemParser: Parser<DalvikExecutableMethodIdItem, Uint8Array> = promiseCompose(
	createTupleParser([
		ushortParser,
		ushortParser,
		uintParser,
	]),
	([ classIndex, prototypeIndex, nameIndex ]): DalvikExecutableMethodIdItem => ({
		classIndex: isoIndexIntoTypeIds.wrap(classIndex),
		prototypeIndex: isoIndexIntoPrototypeIds.wrap(prototypeIndex),
		nameIndex: isoIndexIntoStringIds.wrap(nameIndex),
	}),
);

type DalvikExecutableMethodIdItems = TypedNumberArray<IndexIntoMethodIds, DalvikExecutableMethodIdItem>;

const isoDalvikExecutableMethodIdItems = getIsoTypedNumberArray<IndexIntoMethodIds, DalvikExecutableMethodIdItem>();

const createSkipToThenMethodIdItemsParser = ({ size, offset }: SizeOffset): Parser<DalvikExecutableMethodIdItems, Uint8Array> => (
	size === 0
		? (() => isoDalvikExecutableMethodIdItems.wrap([]))
		: promiseCompose(
			createTupleParser([
				createSkipToParser(offset),
				createQuantifierParser(
					dalvikExecutableMethodIdItemParser,
					size,
				),
			]),
			([ _, methodIds ]) => isoDalvikExecutableMethodIdItems.wrap(methodIds),
		)
);

const uintAccessFlagsParser: Parser<DalvikExecutableAccessFlags, Uint8Array> = promiseCompose(
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

const uleb128AccessFlagsParser: Parser<DalvikExecutableAccessFlags, Uint8Array> = promiseCompose(
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

type DalvikExecutableClassDefinitionItem = {
	classIndex: IndexIntoTypeIds;
	accessFlags: DalvikExecutableAccessFlags;
	superclassIndex: IndexIntoTypeIds;
	interfacesOffset: OffsetToTypeList;
	sourceFileIndex: undefined | IndexIntoStringIds;
	annotationsOffset: OffsetToAnnotationsDirectoryItem;
	classDataOffset: OffsetToClassDataItem;
	staticValuesOffset: OffsetToEncodedArrayItem;
};

const DEX_CLASS_DEFINITION_ITEM_SOURCE_FILE_NO_INDEX = 0xffffffff;

const createSkipToThenClassDefinitionItemsParser = ({ size, offset }: SizeOffset): Parser<DalvikExecutableClassDefinitionItem[], Uint8Array> => (
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
						]): DalvikExecutableClassDefinitionItem => ({
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

type DalvikExecutableStringDataItem = {
	utf16Size: number;
	data: Uint8Array;
};

const stringDataItemParser: Parser<DalvikExecutableStringDataItem, Uint8Array> = promiseCompose(
	createTupleParser([
		uleb128NumberParser,
		createElementTerminatedSequenceParser(
			0,
		),
	]),
	([ utf16Size, data ]) => ({
		utf16Size,
		data: new Uint8Array(data),
	}),
);

type DalvikExecutableStringDataItemString = string;

const stringDataItemStringParser: Parser<DalvikExecutableStringDataItemString, Uint8Array> = promiseCompose(
	stringDataItemParser,
	({ utf16Size, data }) => {
		const mutf8Decoder = new MUtf8Decoder();
		const string = mutf8Decoder.decode(data);
		invariant(string.length === utf16Size, 'String length mismatch. Expected: %s, actual: %s', utf16Size, string.length);
		return string;
	},
);

type DalvikExecutableStringDataItemStringByOffset = Map<OffsetToStringDataItem, DalvikExecutableStringDataItemString>;

const createSkipToThenStringsParser = (sizeOffset: SizeOffset): Parser<DalvikExecutableStringDataItemStringByOffset, Uint8Array> => createSkipToThenItemByOffsetParser({
	sizeOffset,
	itemParser: stringDataItemStringParser,
	byteAlign4: false,
	isoOffset: isoOffsetToStringDataItem,
	parserName: 'skipToThenStringsParser',
});

type DalvikExecutableTypeItem = IndexIntoTypeIds;

const dalvikExecutableTypeItemParser: Parser<DalvikExecutableTypeItem, Uint8Array> = promiseCompose(
	cloneParser(ushortParser),
	(index) => isoIndexIntoTypeIds.wrap(index),
);

type DalvikExecutableTypeList = TypedNumberArray<IndexIntoTypeIds, DalvikExecutableTypeItem>;

const isoDalvikExecutableTypeList = getIsoTypedNumberArray<IndexIntoTypeIds, DalvikExecutableTypeItem>();

const dalvikExecutableTypeListParser: Parser<DalvikExecutableTypeList, Uint8Array> = parserCreatorCompose(
	() => createTupleParser([
		byteAlign4Parser,
		uintParser,
	]),
	([ _, size ]) => promiseCompose(
		createQuantifierParser(
			dalvikExecutableTypeItemParser,
			size,
		),
		(typeItems) => isoDalvikExecutableTypeList.wrap(typeItems),
	),
)();

type DalvikExecutableTypeListByOffset = Map<OffsetToTypeList, DalvikExecutableTypeList>;

const createSkipToThenTypeListByOffsetParser = (sizeOffset: SizeOffset): Parser<DalvikExecutableTypeListByOffset, Uint8Array> => createSkipToThenItemByOffsetParser({
	sizeOffset,
	itemParser: dalvikExecutableTypeListParser,
	byteAlign4: true,
	isoOffset: isoOffsetToTypeList,
	parserName: 'skipToThenTypeListByOffsetParser',
});

type DalvikExecutableFieldAnnotation = {
	fieldIndex: IndexIntoFieldIds;
	annotationsOffset: OffsetToAnnotationSetItem;
};

const fieldAnnotationParser: Parser<DalvikExecutableFieldAnnotation, Uint8Array> = promiseCompose(
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

const createFieldAnnotationsParser = (fieldsSize: number): Parser<DalvikExecutableFieldAnnotation[], Uint8Array> => createQuantifierParser(
	fieldAnnotationParser,
	fieldsSize,
);

type DalvikExecutableMethodAnnotation = {
	methodIndex: IndexIntoMethodIds;
	annotationsOffset: OffsetToAnnotationSetItem;
};

const methodAnnotationParser: Parser<DalvikExecutableMethodAnnotation, Uint8Array> = promiseCompose(
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

const createMethodAnnotationsParser = (methodsSize: number): Parser<DalvikExecutableMethodAnnotation[], Uint8Array> => createQuantifierParser(
	methodAnnotationParser,
	methodsSize,
);

type DalvikExecutableParameterAnnotation = {
	methodIndex: IndexIntoMethodIds;
	annotationsOffset: OffsetToAnnotationSetRefListItem;
};

const parameterAnnotationParser: Parser<DalvikExecutableParameterAnnotation, Uint8Array> = promiseCompose(
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

const createParameterAnnotationsParser = (parametersSize: number): Parser<DalvikExecutableParameterAnnotation[], Uint8Array> => createQuantifierParser(
	parameterAnnotationParser,
	parametersSize,
);

type DalvikExecutableAnnotationsDirectoryItem = {
	classAnnotationsOffset: OffsetToAnnotationSetItem;
	fieldAnnotations: DalvikExecutableFieldAnnotation[];
	methodAnnotations: DalvikExecutableMethodAnnotation[];
	parameterAnnotations: DalvikExecutableParameterAnnotation[];
};

const annotationsDirectoryItemParser: Parser<DalvikExecutableAnnotationsDirectoryItem, Uint8Array> = parserCreatorCompose(
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

type DalvikExecutableAnnotationsDirectoryItemByOffset = Map<OffsetToAnnotationsDirectoryItem, DalvikExecutableAnnotationsDirectoryItem>;

const createSkipToThenAnnotationsDirectoryItemsParser = (sizeOffset: SizeOffset): Parser<DalvikExecutableAnnotationsDirectoryItemByOffset, Uint8Array> => createSkipToThenItemByOffsetParser({
	sizeOffset,
	itemParser: annotationsDirectoryItemParser,
	byteAlign4: true,
	isoOffset: isoOffsetToAnnotationsDirectoryItem,
	parserName: 'skipToThenAnnotationsDirectoryItemsParser',
});

type DalvikExecutableEncodedFieldDiff = {
	fieldIndexDiff: number;
	accessFlags: DalvikExecutableAccessFlags;
};

const encodedFieldParser: Parser<DalvikExecutableEncodedFieldDiff, Uint8Array> = promiseCompose(
	createTupleParser([
		uleb128NumberParser,
		uleb128AccessFlagsParser,
	]),
	([ fieldIndexDiff, accessFlags ]) => ({ fieldIndexDiff, accessFlags }),
);

type DalvikExecutableEncodedField = {
	fieldIndex: IndexIntoFieldIds;
	accessFlags: DalvikExecutableAccessFlags;
};

const createEncodedFieldsParser = (fieldsSize: number): Parser<DalvikExecutableEncodedField[], Uint8Array> => promiseCompose(
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

type DalvikExecutableEncodedMethodDiff = {
	methodIndexDiff: number;
	accessFlags: DalvikExecutableAccessFlags;
	codeOffset: OffsetToCodeItem;
};

const encodedMethodParser: Parser<DalvikExecutableEncodedMethodDiff, Uint8Array> = promiseCompose(
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

type DalvikExecutableEncodedMethod = {
	methodIndex: IndexIntoMethodIds;
	accessFlags: DalvikExecutableAccessFlags;
	codeOffset: OffsetToCodeItem;
};

const createEncodedMethodsParser = (methodsSize: number): Parser<DalvikExecutableEncodedMethod[], Uint8Array> => promiseCompose(
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

type DalvikExecutableClassDataItem = {
	staticFields: DalvikExecutableEncodedField[],
	instanceFields: DalvikExecutableEncodedField[],
	directMethods: DalvikExecutableEncodedMethod[],
	virtualMethods: DalvikExecutableEncodedMethod[],
};

const classDataItemParser: Parser<DalvikExecutableClassDataItem, Uint8Array> = parserCreatorCompose(
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

type DalvikExecutableClassDataItemByOffset = Map<OffsetToClassDataItem, DalvikExecutableClassDataItem>;

const createSkipToThenClassDataItemsParser = (sizeOffset: SizeOffset): Parser<DalvikExecutableClassDataItemByOffset, Uint8Array> => createSkipToThenItemByOffsetParser({
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

		if (size === 5) {
			return promiseCompose(
				createFixedLengthSequenceParser(size),
				(uint8Array) => {
					const firstByte = uint8Array[0];
					const firstBit = (firstByte & 0b10000000) >> 7;
					const extensionByte = firstBit === 1 ? 0xff : 0x00;

					const buffer = Buffer.from([ extensionByte, extensionByte, extensionByte, ...uint8Array ]);
					return BigInt(buffer.readBigInt64LE(0));
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

type DalvikExecutableEncodedArray = DalvikExecutableEncodedValue[];

const encodedArrayParser: Parser<DalvikExecutableEncodedArray, Uint8Array> = parserCreatorCompose(
	() => uleb128NumberParser,
	(size) => createQuantifierParser(
		encodedValueParser,
		size,
	),
)();

setParserName(encodedArrayParser, 'encodedArrayParser');

const encodedValueArrayParser: Parser<DalvikExecutableEncodedValue[], Uint8Array> = promiseCompose(
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

type DalvikExecutableAnnotationElement = {
	nameIndex: IndexIntoStringIds;
	value: DalvikExecutableEncodedValue;
};

type DalvikExecutableEncodedAnnotation = {
	typeIndex: IndexIntoTypeIds;
	elements: DalvikExecutableAnnotationElement[];
};

const annotationElementParser: Parser<DalvikExecutableAnnotationElement, Uint8Array> = promiseCompose(
	createTupleParser([
		uleb128NumberParser,
		createParserAccessorParser(() => encodedValueParser),
	]),
	([
		nameIndex,
		value,
	]) => ({
		nameIndex: isoIndexIntoStringIds.wrap(nameIndex),
		value,
	}),
);

setParserName(annotationElementParser, 'annotationElementParser');

const encodedAnnotationParser: Parser<DalvikExecutableEncodedAnnotation, Uint8Array> = promiseCompose(
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
	([
		typeIndex,
		elements,
	]) => ({
		typeIndex: isoIndexIntoTypeIds.wrap(typeIndex),
		elements,
	}),
);

setParserName(encodedAnnotationParser, 'encodedAnnotationParser');

const encodedValueAnnotationParser: Parser<DalvikExecutableEncodedAnnotation, Uint8Array> = promiseCompose(
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

const encodedValueParser: Parser<DalvikExecutableEncodedValue, Uint8Array> = createDisjunctionParser([
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

type DalvikExecutableTryItem = {
	startAddress: number;
	instructionCount: number;
	handlerOffset: OffsetFromEncodedCatchHandlerListToEncodedCatchHandler;
};

const tryItemParser: Parser<DalvikExecutableTryItem, Uint8Array> = promiseCompose(
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

type DalvikExecutableEncodedTypeAddressPair_ = {
	typeIndex: IndexIntoTypeIds;
	address: number;
};

const encodedTypeAddressPairParser: Parser<DalvikExecutableEncodedTypeAddressPair_, Uint8Array> = promiseCompose(
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

type DalvikExecutableEncodedCatchHandler_ = {
	handlers: DalvikExecutableEncodedTypeAddressPair_[],
	catchAllAddress: undefined | number,
};

const encodedCatchHandlerParser: Parser<DalvikExecutableEncodedCatchHandler_, Uint8Array> = parserCreatorCompose(
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

type DalvikExecutableEncodedCatchHandlerByRelativeOffset = Map<OffsetFromEncodedCatchHandlerListToEncodedCatchHandler, DalvikExecutableEncodedCatchHandler_>;

const encodedCatchHandlerListParser: Parser<DalvikExecutableEncodedCatchHandlerByRelativeOffset, Uint8Array> = async (parserContext) => {
	const listOffset = parserContext.position;
	const handlers: DalvikExecutableEncodedCatchHandlerByRelativeOffset = new Map();

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

type DalvikExecutableCodeItem<Instructions> = {
	registersSize: number;
	insSize: number;
	outsSize: number;
	debugInfoOffset: OffsetToDebugInfoItem;
	instructions: Instructions;
	tryItems: DalvikExecutableTryItem[];
	handlers: DalvikExecutableEncodedCatchHandlerByRelativeOffset;
};

type CreateInstructionsParser<Instructions> = (size: number) => Parser<Instructions, Uint8Array>;

const createDalvikExecutableCodeItemParser = <Instructions>({
	createInstructionsParser,
}: {
	createInstructionsParser: CreateInstructionsParser<Instructions>;
}): Parser<DalvikExecutableCodeItem<Instructions>, Uint8Array> => {
	const dalvikExecutableCodeItemParser = parserCreatorCompose(
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
					createInstructionsParser(instructionsSize * 2),
					(
						(
							triesSize !== 0
								&& instructionsSize % 2 === 1
						)
							? byteAlign4Parser
							: () => undefined
					),
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

	setParserName(dalvikExecutableCodeItemParser, 'dalvikExecutableCodeItemParser');

	return dalvikExecutableCodeItemParser;
};

type DalvikExecutableCodeItemByOffset<Instructions> = Map<OffsetToCodeItem, DalvikExecutableCodeItem<Instructions>>;

const createSkipToThenCodeItemsParser = <Instructions>({
	sizeOffset,
	createInstructionsParser,
}: {
	sizeOffset: SizeOffset;
	createInstructionsParser: CreateInstructionsParser<Instructions>;
}): Parser<DalvikExecutableCodeItemByOffset<Instructions>, Uint8Array> => createSkipToThenItemByOffsetParser({
	sizeOffset,
	itemParser: createDalvikExecutableCodeItemParser({
		createInstructionsParser,
	}),
	byteAlign4: true,
	isoOffset: isoOffsetToCodeItem,
	parserName: 'skipToThenCodeItemsParser',
});

type DalvikExecutableDebugByteCodeValueItem =
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

const dalvikExecutableDebugByteCodeValueParser: Parser<DalvikExecutableDebugByteCodeValueItem, Uint8Array> = parserCreatorCompose(
	() => ubyteParser,
	(value): Parser<DalvikExecutableDebugByteCodeValueItem, Uint8Array> => {
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

setParserName(dalvikExecutableDebugByteCodeValueParser, 'dalvikExecutableDebugByteCodeValueParser');

type DalvikExecutableDebugByteCodeItem = DalvikExecutableDebugByteCodeValueItem[];

const debugByteCodeParser: Parser<DalvikExecutableDebugByteCodeItem, Uint8Array> = createElementTerminatedArrayParserUnsafe(
	dalvikExecutableDebugByteCodeValueParser,
	0,
);

setParserName(debugByteCodeParser, 'debugByteCodeParser');

type DalvikExecutableDebugInfoItem = {
	lineStart: number;
	parameterNames: (undefined | IndexIntoStringIds)[];
	bytecode: DalvikExecutableDebugByteCodeItem;
};

const DEX_DEBUG_INFO_ITEM_PARAMETER_NAME_NO_INDEX = -1;

const debugInfoItemParser: Parser<DalvikExecutableDebugInfoItem, Uint8Array> = parserCreatorCompose(
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

type DalvikExecutableDebugInfoItemByOffset = Map<OffsetToDebugInfoItem, DalvikExecutableDebugInfoItem>;

const createSkipToThenDebugInfoItemsParser = (sizeOffset: SizeOffset): Parser<DalvikExecutableDebugInfoItemByOffset, Uint8Array> => createSkipToThenItemByOffsetParser({
	sizeOffset,
	itemParser: debugInfoItemParser,
	byteAlign4: false,
	isoOffset: isoOffsetToDebugInfoItem,
	parserName: 'skipToThenDebugInfoItemsParser',
});

type DalvikExecutableAnnotationItemVisibility =
	| 'build'
	| 'runtime'
	| 'system'
;

const dalvikExecutableAnnotationItemVisibilityParser: Parser<DalvikExecutableAnnotationItemVisibility, Uint8Array> = promiseCompose(
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

setParserName(dalvikExecutableAnnotationItemVisibilityParser, 'dalvikExecutableAnnotationItemVisibilityParser');

type DalvikExecutableAnnotationItem = {
	visibility: DalvikExecutableAnnotationItemVisibility;
	encodedAnnotation: DalvikExecutableEncodedAnnotation;
};

const dalvikExecutableAnnotationItemParser: Parser<DalvikExecutableAnnotationItem, Uint8Array> = promiseCompose(
	createTupleParser([
		dalvikExecutableAnnotationItemVisibilityParser,
		encodedAnnotationParser,
	]),
	([ visibility, encodedAnnotation ]) => ({ visibility, encodedAnnotation }),
);

setParserName(dalvikExecutableAnnotationItemParser, 'dalvikExecutableAnnotationItemParser');

type DalvikExecutableAnnotationItemByOffset = Map<OffsetToAnnotationItem, DalvikExecutableAnnotationItem>;

const createSkipToThenAnnotationItemsParser = (sizeOffset: SizeOffset): Parser<DalvikExecutableAnnotationItemByOffset, Uint8Array> => createSkipToThenItemByOffsetParser({
	sizeOffset,
	itemParser: dalvikExecutableAnnotationItemParser,
	byteAlign4: false,
	isoOffset: isoOffsetToAnnotationItem,
	parserName: 'skipToThenAnnotationItemsParser',
});

type DalvikExecutableHeaderAndMap = {
	headerItem: DalvikExecutableHeaderItem;
	mapList: DalvikExecutableMapList;
};

const dalvikExecutableHeaderAndMapParser: Parser<DalvikExecutableHeaderAndMap, Uint8Array> = parserCreatorCompose(
	() => dalvikExecutableHeaderItemParser,
	(headerItem) => promiseCompose(
		createLookaheadParser(createDalvikExecutableMapListParser(headerItem.mapOffset)),
		(mapList) => ({ headerItem, mapList }),
	),
)();

type DalvikExecutableAnnotationOffsetItem = {
	annotationOffset: OffsetToAnnotationItem;
}

const dalvikExecutableAnnotationOffsetItemParser: Parser<DalvikExecutableAnnotationOffsetItem, Uint8Array> = promiseCompose(
	uintParser,
	(annotationOffset) => ({
		annotationOffset: isoOffsetToAnnotationItem.wrap(annotationOffset),
	}),
);

type DalvikExecutableAnnotationSetItem = {
	entries: DalvikExecutableAnnotationOffsetItem[];
};

const dalvikExecutableAnnotationSetItemParser: Parser<DalvikExecutableAnnotationSetItem, Uint8Array> = parserCreatorCompose(
	() => createTupleParser([
		byteAlign4Parser,
		uintParser,
	]),
	([ _, size ]) => promiseCompose(
		createQuantifierParser(
			dalvikExecutableAnnotationOffsetItemParser,
			size,
		),
		(entries) => ({ entries }),
	),
)();

type DalvikExecutableAnnotationSetItemByOffset = Map<OffsetToAnnotationSetItem, DalvikExecutableAnnotationSetItem>;

const createSkipToThenAnnotationSetItemsParser = (sizeOffset: SizeOffset): Parser<DalvikExecutableAnnotationSetItemByOffset, Uint8Array> => createSkipToThenItemByOffsetParser({
	sizeOffset,
	itemParser: dalvikExecutableAnnotationSetItemParser,
	byteAlign4: true,
	isoOffset: isoOffsetToAnnotationSetItem,
	parserName: 'skipToThenAnnotationSetItemsParser',
});

type DalvikExecutableAnnotationSetRefItem = OffsetToAnnotationSetItem;

const dalvikExecutableAnnotationSetRefItemParser: Parser<DalvikExecutableAnnotationSetRefItem, Uint8Array> = promiseCompose(
	uintParser,
	(annotationsOffset) => isoOffsetToAnnotationSetItem.wrap(annotationsOffset),
);

type DalvikExecutableAnnotationSetRefList = {
	list: DalvikExecutableAnnotationSetRefItem[];
};

const dalvikExecutableAnnotationSetRefListParser: Parser<DalvikExecutableAnnotationSetRefList, Uint8Array> = parserCreatorCompose(
	() => createTupleParser([
		byteAlign4Parser,
		uintParser,
	]),
	([ _, size ]) => promiseCompose(
		createQuantifierParser(
			dalvikExecutableAnnotationSetRefItemParser,
			size,
		),
		(list) => ({ list }),
	),
)();

type DalvikExecutableAnnotationSetRefListItemByOffset = Map<OffsetToAnnotationSetRefListItem, DalvikExecutableAnnotationSetRefList>;

const createSkipToThenAnnotationSetRefListsParser = (sizeOffset: SizeOffset): Parser<DalvikExecutableAnnotationSetRefListItemByOffset, Uint8Array> => createSkipToThenItemByOffsetParser({
	sizeOffset,
	itemParser: dalvikExecutableAnnotationSetRefListParser,
	byteAlign4: true,
	isoOffset: isoOffsetToAnnotationSetRefListItem,
	parserName: 'skipToThenAnnotationSetRefListsParser',
});

type DalvikExecutableMapItemType =
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

const dalvikExecutableMapItemTypeParser: Parser<DalvikExecutableMapItemType, Uint8Array> = promiseCompose(
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

type DalvikExecutableMapItem = {
	type: DalvikExecutableMapItemType;
	size: number;
	offset: number;
};

const dalvikExecutableMapItemParser: Parser<DalvikExecutableMapItem, Uint8Array> = promiseCompose(
	createTupleParser([
		dalvikExecutableMapItemTypeParser,
		ushortParser,
		uintParser,
		uintParser,
	]),
	([ type, _unused, size, offset ]) => ({ type, size, offset }),
);

type DalvikExecutableMapList = DalvikExecutableMapItem[];

const dalvikExecutableMapListParser: Parser<DalvikExecutableMapList, Uint8Array> = parserCreatorCompose(
	() => uintParser,
	size => {
		return createQuantifierParser(
			dalvikExecutableMapItemParser,
			size,
		);
	},
)();

setParserName(dalvikExecutableMapListParser, 'dalvikExecutableMapListParser');

const createDalvikExecutableMapListParser = (mapOffset: number): Parser<DalvikExecutableMapList, Uint8Array> => {
	const dalvikExecutableMapParser = promiseCompose(
		createTupleParser([
			createSkipToParser(mapOffset),
			dalvikExecutableMapListParser,
		]),
		([ _, map ]) => map,
	);

	setParserName(dalvikExecutableMapParser, 'dalvikExecutableMapParser');

	return dalvikExecutableMapParser;
};

type DalvikExecutableEncodedArrayItem = DalvikExecutableEncodedArray;

type DalvikExecutableEncodedArrayItemByOffset = Map<OffsetToEncodedArrayItem, DalvikExecutableEncodedArrayItem>;

const createSkipToThenEncodedArrayItemsParser = (sizeOffset: SizeOffset): Parser<DalvikExecutableEncodedArrayItemByOffset, Uint8Array> => createSkipToThenItemByOffsetParser({
	sizeOffset,
	itemParser: encodedArrayParser,
	byteAlign4: false,
	isoOffset: isoOffsetToEncodedArrayItem,
	parserName: 'skipToThenEncodedArrayItemsParser',
});

type DalvikExecutableCallSiteIdItem = unknown; // TODO

type DalvikExecutableMethodHandleItem = unknown; // TODO

type DalvikExecutableHiddenApiClassDataItem = unknown; // TODO

type DalvikExecutableData<Instructions> = {
	headerItem: DalvikExecutableHeaderItem;
	stringIdItems: DalvikExecutableStringIdItems;
	typeIdItems: DalvikExecutableTypeIdItems;
	prototypeIdItems: DalvikExecutablePrototypeIdItems;
	fieldIdItems: DalvikExecutableFieldIdItems;
	methodIdItems: DalvikExecutableMethodIdItems;
	classDefinitionItems: DalvikExecutableClassDefinitionItem[];
	callSiteIdItems: DalvikExecutableCallSiteIdItem[];
	methodHandleItems: DalvikExecutableMethodHandleItem[];
	mapList: DalvikExecutableMapList;
	typeListByOffset: DalvikExecutableTypeListByOffset;
	annotationSetRefListItemByOffset: DalvikExecutableAnnotationSetRefListItemByOffset;
	annotationSetItemByOffset: DalvikExecutableAnnotationSetItemByOffset;
	classDataItemByOffset: DalvikExecutableClassDataItemByOffset;
	codeItemByOffset: DalvikExecutableCodeItemByOffset<Instructions>;
	stringDataItemStringByOffset: DalvikExecutableStringDataItemStringByOffset;
	debugInfoItemByOffset: DalvikExecutableDebugInfoItemByOffset;
	annotationItemByOffset: DalvikExecutableAnnotationItemByOffset;
	encodedArrayItemByOffset: DalvikExecutableEncodedArrayItemByOffset;
	annotationsDirectoryItemByOffset: DalvikExecutableAnnotationsDirectoryItemByOffset;
	hiddenApiClassDataItems: DalvikExecutableHiddenApiClassDataItem[];
};

const createDalvikExecutableDataParser = <Instructions>({
	headerItem,
	mapList,
	createInstructionsParser,
}: DalvikExecutableHeaderAndMap & {
	createInstructionsParser: CreateInstructionsParser<Instructions>;
}): Parser<DalvikExecutableData<Instructions>, Uint8Array> => {
	const dalvikExecutableDataParser: Parser<DalvikExecutableData<Instructions>, Uint8Array> = async (parserContext) => {
		let stringIdItems: DalvikExecutableStringIdItems = isoDalvikExecutableStringIdItems.wrap([]);
		let typeIdItems: DalvikExecutableTypeIdItems = isoDalvikExecutableTypeIdItems.wrap([]);
		let prototypeIdItems: DalvikExecutablePrototypeIdItems = isoDalvikExecutablePrototypeIdItems.wrap([]);
		let fieldIdItems: DalvikExecutableFieldIdItems = isoDalvikExecutableFieldIdItems.wrap([]);
		let methodIdItems: DalvikExecutableMethodIdItems = isoDalvikExecutableMethodIdItems.wrap([]);
		let classDefinitionItems: DalvikExecutableClassDefinitionItem[] = [];
		let callSiteIdItems: DalvikExecutableCallSiteIdItem[] = [];
		let methodHandleItems: DalvikExecutableMethodHandleItem[] = [];
		let typeListByOffset: DalvikExecutableTypeListByOffset = new Map();
		let annotationSetRefListItemByOffset: DalvikExecutableAnnotationSetRefListItemByOffset = new Map();
		let annotationSetItemByOffset: DalvikExecutableAnnotationSetItemByOffset = new Map();
		let classDataItemByOffset: DalvikExecutableClassDataItemByOffset = new Map();
		let codeItemByOffset: DalvikExecutableCodeItemByOffset<Instructions> = new Map();
		let stringDataItemStringByOffset: DalvikExecutableStringDataItemStringByOffset = new Map();
		let debugInfoItemByOffset: DalvikExecutableDebugInfoItemByOffset = new Map();
		let annotationItemByOffset: DalvikExecutableAnnotationItemByOffset = new Map();
		let encodedArrayItemByOffset: DalvikExecutableEncodedArrayItemByOffset = new Map();
		let annotationsDirectoryItemByOffset: DalvikExecutableAnnotationsDirectoryItemByOffset = new Map();
		let hiddenApiClassDataItems: DalvikExecutableHiddenApiClassDataItem[] = [];

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
				await createDalvikExecutableMapListParser(dexMapItem.offset)(parserContext);
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
				codeItemByOffset = await createSkipToThenCodeItemsParser({
					sizeOffset: dexMapItem,
					createInstructionsParser,
				})(parserContext);
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

	setParserName(dalvikExecutableDataParser, 'dalvikExecutableDataParser');

	return dalvikExecutableDataParser;
};

const createDalvikExecutableParser = <Instructions>({
	createInstructionsParser,
}: {
	createInstructionsParser: CreateInstructionsParser<Instructions>;
}): Parser<DalvikExecutable<Instructions>, Uint8Array> => parserCreatorCompose(
	() => dalvikExecutableHeaderAndMapParser,
	({
		headerItem,
		mapList,
	}) => promiseCompose(
		createTupleParser([
			createDalvikExecutableDataParser({
				headerItem,
				mapList,
				createInstructionsParser,
			}),
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
				const typeNames = isoDalvikExecutableTypeList.unwrap(typeIndexes).map((typeIndex) => {
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

			const debugInfoByOffset = new Map<OffsetToDebugInfoItem, undefined | DalvikExecutableDebugInfo>([
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

			const codeByOffset = new Map<OffsetToCodeItem, undefined | DalvikExecutableCode<Instructions>>([
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
						const handler_ = codeItem.handlers.get(tryItem.handlerOffset);
						invariant(handler_, 'Handler must be there. Handler offset: %s', tryItem.handlerOffset);

						const handler = {
							...handler_,
							handlers: handler_.handlers.map((encodedHandler) => {
								const type = types.at(encodedHandler.typeIndex);
								invariant(type, 'Type must be there. Type id: %s', encodedHandler.typeIndex);

								return {
									type,
									address: encodedHandler.address,
								};
							}),
						};

						return {
							startAddress: tryItem.startAddress,
							instructionCount: tryItem.instructionCount,
							handler,
						};
					}),
				});
			}

			const classDataByOffset = new Map<OffsetToClassDataItem, undefined | DalvikExecutableClassData<Instructions>>([
				[ isoOffsetToClassDataItem.wrap(0), undefined ],
			]);

			const resolvers: DalvikBytecodeOperationResolvers = {
				resolveIndexIntoStringIds(indexIntoStringIds) {
					const string = strings.at(indexIntoStringIds);
					invariant(string, 'String must be there. String id: %s', indexIntoStringIds);

					return string;
				},

				resolveIndexIntoTypeIds(indexIntoTypeIds) {
					const type = types.at(indexIntoTypeIds);
					invariant(type, 'Type must be there. Type id: %s', indexIntoTypeIds);

					return type;
				},

				resolveIndexIntoMethodIds(indexIntoMethodIds) {
					const method = methods.at(indexIntoMethodIds);
					invariant(method, 'Method must be there. Method id: %s', indexIntoMethodIds);

					return method;
				},

				resolveIndexIntoFieldIds(indexIntoFieldIds) {
					const field = fields.at(indexIntoFieldIds);
					invariant(field, 'Field must be there. Field id: %s', indexIntoFieldIds);

					return field;
				},
			};

			function resolveCode(code: undefined | DalvikExecutableCode<Instructions>): undefined | DalvikExecutableCode<Instructions> {
				if (!code) {
					return code;
				}

				const { instructions, ...rest } = code;

				if (!Array.isArray(instructions)) {
					return code;
				}

				return {
					...rest,
					instructions: instructions.map((instruction: DalvikBytecodeOperation) => {
						return resolveDalvikBytecodeOperation(instruction, resolvers);
					}) as Instructions,
				};
			}

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
						invariant(!method.codeOffset || code, 'Code must be there. Code offset: %s', method.codeOffset);

						return {
							method: method_,
							accessFlags: method.accessFlags,
							code: resolveCode(code),
						};
					}),

					virtualMethods: classDataItem.virtualMethods.map((method) => {
						const method_ = methods.at(method.methodIndex);
						invariant(method_, 'Method must be there. Method id: %s', method.methodIndex);

						const code = codeByOffset.get(method.codeOffset);
						invariant(!method.codeOffset || code, 'Code must be there. Code offset: %s', method.codeOffset);

						return {
							method: method_,
							accessFlags: method.accessFlags,
							code: resolveCode(code),
						};
					}),
				});
			}

			function resolveAnnotationOffsetItem({ annotationOffset }: DalvikExecutableAnnotationOffsetItem): DalvikExecutableAnnotation {
				const annotationItem = annotationItemByOffset.get(annotationOffset);
				invariant(annotationItem, 'Annotation must be there. Annotation offset: %s', annotationOffset);

				const type = types.at(annotationItem.encodedAnnotation.typeIndex);
				invariant(type, 'Type must be there. Type id: %s', annotationItem.encodedAnnotation.typeIndex);

				const elements = annotationItem.encodedAnnotation.elements.map((element) => {
					const name = strings.at(element.nameIndex);
					invariant(name, 'Name string must be there. String offset: %s', element.nameIndex);

					return {
						name,
						value: element.value,
					};
				});

				return {
					visibility: annotationItem.visibility,
					type,
					elements,
				};
			}

			function resolveAnnotationSetItem(annotationSetItem: undefined | DalvikExecutableAnnotationSetItem): undefined | DalvikExecutableAnnotation[] {
				return annotationSetItem?.entries.map(resolveAnnotationOffsetItem);
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

				const annotations: undefined | DalvikExecutableClassAnnotations = (() => {
					if (!annotationsDirectoryItem) {
						return undefined;
					}

					const classAnnotationSetItem = annotationSetItemByOffset.get(annotationsDirectoryItem.classAnnotationsOffset);
					invariant(
						isoOffsetToAnnotationSetItem.unwrap(annotationsDirectoryItem.classAnnotationsOffset) === 0 || classAnnotationSetItem,
						'Class annotations must be there. Class annotations offset: %s',
						annotationsDirectoryItem.classAnnotationsOffset,
					);

					const classAnnotations = (
						classAnnotationSetItem
							? resolveAnnotationSetItem(classAnnotationSetItem)
							: undefined
					);

					const fieldAnnotations: DalvikExecutableClassFieldAnnotation[] = annotationsDirectoryItem.fieldAnnotations.map((fieldAnnotation) => {
						const field = fields.at(fieldAnnotation.fieldIndex);
						invariant(field, 'Field must be there. Field id: %s', fieldAnnotation.fieldIndex);

						const annotations = annotationSetItemByOffset.get(fieldAnnotation.annotationsOffset);
						invariant(
							isoOffsetToAnnotationSetItem.unwrap(fieldAnnotation.annotationsOffset) === 0 || annotations,
							'Annotations must be there. Annotations offset: %s',
							fieldAnnotation.annotationsOffset,
						);

						return { field, annotations: annotations?.entries.map(resolveAnnotationOffsetItem) };
					});

					const methodAnnotations: DalvikExecutableClassMethodAnnotation[] = annotationsDirectoryItem.methodAnnotations.map((methodAnnotation) => {
						const method = methods.at(methodAnnotation.methodIndex);
						invariant(method, 'Method must be there. Method id: %s', methodAnnotation.methodIndex);

						const annotationSetItem = annotationSetItemByOffset.get(methodAnnotation.annotationsOffset);
						invariant(
							isoOffsetToAnnotationSetItem.unwrap(methodAnnotation.annotationsOffset) === 0 || annotationSetItem,
							'Annotations must be there. Annotations offset: %s',
							methodAnnotation.annotationsOffset,
						);

						return { method, annotations: resolveAnnotationSetItem(annotationSetItem) };
					});

					const parameterAnnotations: DalvikExecutableClassParameterAnnotation[] = annotationsDirectoryItem.parameterAnnotations.map((parameterAnnotation) => {
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

							return resolveAnnotationSetItem(annotationSetItem);
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

export const dalvikExecutableParser: Parser<DalvikExecutable<DalvikBytecode>, Uint8Array> = createDalvikExecutableParser({
	createInstructionsParser: createDalvikBytecodeParser,
});

setParserName(dalvikExecutableParser, 'dalvikExecutableParser');

export const dalvikExecutableWithRawInstructionsParser: Parser<DalvikExecutable<Uint8Array>, Uint8Array> = createDalvikExecutableParser<Uint8Array>({
	createInstructionsParser: createFixedLengthSequenceParser,
});
