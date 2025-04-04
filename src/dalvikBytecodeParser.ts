import { createArrayParser } from "./arrayParser.js";
import { createDalvikBytecodeFormat21cParser, createDalvikBytecodeFormat21sParser, createDalvikBytecodeFormat21tParser, createDalvikBytecodeFormat22bParser, createDalvikBytecodeFormat22cParser, createDalvikBytecodeFormat22sParser, createDalvikBytecodeFormat22tParser, dalvikBytecodeFormat23xParser, dalvikBytecodeFormat31iParser, createDalvikBytecodeFormat35cParser, createDalvikBytecodeFormat3rcParser, dalvikBytecodeFormat10tParser, dalvikBytecodeFormat10xParser, dalvikBytecodeFormat11xParser, dalvikBytecodeFormat12xParser, dalvikBytecodeFormat20tParser, dalvikBytecodeFormat22xParser, nibblesParser, dalvikBytecodeFormat32xParser } from "./dalvikBytecodeParser/formatParsers.js";
import { DalvikExecutableField, DalvikExecutableMethod } from "./dalvikExecutable.js";
import { IndexIntoFieldIds, IndexIntoMethodIds, IndexIntoStringIds, IndexIntoTypeIds, isoIndexIntoFieldIds, isoIndexIntoMethodIds, isoIndexIntoStringIds, isoIndexIntoTypeIds } from "./dalvikExecutableParser/typedNumbers.js";
import { createExactElementParser } from "./exactElementParser.js";
import { Parser, setParserName } from "./parser.js";
import { promiseCompose } from "./promiseCompose.js";
import { createSliceBoundedParser } from "./sliceBoundedParser.js";
import { createTupleParser } from "./tupleParser.js";
import { createUnionParser } from "./unionParser.js";

// https://source.android.com/docs/core/runtime/dalvik-bytecode

const dalvikBytecodeOperationUnusedParser: Parser<void, Uint8Array> = async (parserContext) => {
	const opcode = await parserContext.read(0);

	parserContext.invariant(
		(
			(opcode >= 0x3e && opcode <= 0x43)
				|| (opcode === 0x73)
				|| (opcode >= 0x79 && opcode <= 0x7a)
				|| (opcode >= 0xe3 && opcode <= 0xf9)
		),
		'Expected unused opcode',
	);

	parserContext.skip(1);
};

setParserName(dalvikBytecodeOperationUnusedParser, 'dalvikBytecodeOperationUnusedParser');

type DalvikBytecodeOperationNoOperation = {
	operation: 'no-operation';
};

const dalvikBytecodeOperationNoOperationParser: Parser<DalvikBytecodeOperationNoOperation, Uint8Array> = promiseCompose(
	createExactElementParser(0x00),
	() => ({
		operation: 'no-operation',
	}),
);

setParserName(dalvikBytecodeOperationNoOperationParser, 'dalvikBytecodeOperationNoOperationParser');

const createDalvikBytecodeOperationInvoke = <T extends string>(operation: T, opcode: number): Parser<{
	operation: T;
	methodIndex: IndexIntoMethodIds;
	registers: number[];
}, Uint8Array> => promiseCompose(
	createTupleParser([
		createExactElementParser(opcode),
		createDalvikBytecodeFormat35cParser({
			isoIndex: isoIndexIntoMethodIds,
		}),
	]),
	([
		_opcode,
		{ index, registers }
	]) => ({
		operation,
		methodIndex: index,
		registers,
	}),
);

const dalvikBytecodeOperationInvokeVirtualParser = createDalvikBytecodeOperationInvoke('invoke-virtual', 0x6e);

type DalvikBytecodeOperationInvokeVirtual = Awaited<ReturnType<typeof dalvikBytecodeOperationInvokeVirtualParser>>;

const dalvikBytecodeOperationInvokeSuperParser = createDalvikBytecodeOperationInvoke('invoke-super', 0x6f);

type DalvikBytecodeOperationInvokeSuper = Awaited<ReturnType<typeof dalvikBytecodeOperationInvokeSuperParser>>;

const dalvikBytecodeOperationInvokeDirectParser = createDalvikBytecodeOperationInvoke('invoke-direct', 0x70);

type DalvikBytecodeOperationInvokeDirect = Awaited<ReturnType<typeof dalvikBytecodeOperationInvokeDirectParser>>;

const dalvikBytecodeOperationInvokeStaticParser = createDalvikBytecodeOperationInvoke('invoke-static', 0x71);

type DalvikBytecodeOperationInvokeStatic = Awaited<ReturnType<typeof dalvikBytecodeOperationInvokeStaticParser>>;

const dalvikBytecodeOperationInvokeInterfaceParser = createDalvikBytecodeOperationInvoke('invoke-interface', 0x72);

type DalvikBytecodeOperationInvokeInterface = Awaited<ReturnType<typeof dalvikBytecodeOperationInvokeInterfaceParser>>;

type DalvikBytecodeOperationInvoke =
	| DalvikBytecodeOperationInvokeVirtual
	| DalvikBytecodeOperationInvokeSuper
	| DalvikBytecodeOperationInvokeDirect
	| DalvikBytecodeOperationInvokeStatic
	| DalvikBytecodeOperationInvokeInterface
;

const dalvikBytecodeOperationInvokeParser: Parser<DalvikBytecodeOperationInvoke, Uint8Array> = createUnionParser([
	dalvikBytecodeOperationInvokeVirtualParser,
	dalvikBytecodeOperationInvokeSuperParser,
	dalvikBytecodeOperationInvokeDirectParser,
	dalvikBytecodeOperationInvokeStaticParser,
	dalvikBytecodeOperationInvokeInterfaceParser,
]);

setParserName(dalvikBytecodeOperationInvokeParser, 'dalvikBytecodeOperationInvokeParser');

const createDalvikBytecodeOperationInvokeRange = <T extends string>(operation: T, opcode: number): Parser<{
	operation: T;
	methodIndex: IndexIntoMethodIds;
	registers: number[];
}, Uint8Array> => promiseCompose(
	createTupleParser([
		createExactElementParser(opcode),
		createDalvikBytecodeFormat3rcParser({
			isoIndex: isoIndexIntoMethodIds,
		}),
	]),
	([
		_opcode,
		{ index, registers }
	]) => ({
		operation,
		methodIndex: index,
		registers,
	}),
);

const dalvikBytecodeOperationInvokeVirtualRangeParser = createDalvikBytecodeOperationInvokeRange('invoke-virtual/range', 0x74);

type DalvikBytecodeOperationInvokeVirtualRange = Awaited<ReturnType<typeof dalvikBytecodeOperationInvokeVirtualRangeParser>>;

const dalvikBytecodeOperationInvokeSuperRangeParser = createDalvikBytecodeOperationInvokeRange('invoke-super/range', 0x75);

type DalvikBytecodeOperationInvokeSuperRange = Awaited<ReturnType<typeof dalvikBytecodeOperationInvokeSuperRangeParser>>;

const dalvikBytecodeOperationInvokeDirectRangeParser = createDalvikBytecodeOperationInvokeRange('invoke-direct/range', 0x76);

type DalvikBytecodeOperationInvokeDirectRange = Awaited<ReturnType<typeof dalvikBytecodeOperationInvokeDirectRangeParser>>;

const dalvikBytecodeOperationInvokeStaticRangeParser = createDalvikBytecodeOperationInvokeRange('invoke-static/range', 0x77);

type DalvikBytecodeOperationInvokeStaticRange = Awaited<ReturnType<typeof dalvikBytecodeOperationInvokeStaticRangeParser>>;

const dalvikBytecodeOperationInvokeInterfaceRangeParser = createDalvikBytecodeOperationInvokeRange('invoke-interface/range', 0x78);

type DalvikBytecodeOperationInvokeInterfaceRange = Awaited<ReturnType<typeof dalvikBytecodeOperationInvokeInterfaceRangeParser>>;

type DalvikBytecodeOperationInvokeRange =
	| DalvikBytecodeOperationInvokeVirtualRange
	| DalvikBytecodeOperationInvokeSuperRange
	| DalvikBytecodeOperationInvokeDirectRange
	| DalvikBytecodeOperationInvokeStaticRange
	| DalvikBytecodeOperationInvokeInterfaceRange
;

const dalvikBytecodeOperationInvokeRangeParser: Parser<DalvikBytecodeOperationInvokeRange, Uint8Array> = createUnionParser([
	dalvikBytecodeOperationInvokeVirtualRangeParser,
	dalvikBytecodeOperationInvokeSuperRangeParser,
	dalvikBytecodeOperationInvokeDirectRangeParser,
	dalvikBytecodeOperationInvokeStaticRangeParser,
	dalvikBytecodeOperationInvokeInterfaceRangeParser,
]);

setParserName(dalvikBytecodeOperationInvokeRangeParser, 'dalvikBytecodeOperationInvokeRangeParser');

type DalvikBytecodeOperationGoto = {
	operation: 'goto';
	branchOffset: number;
};

const dalvikBytecodeOperationGotoParser: Parser<DalvikBytecodeOperationGoto, Uint8Array> = promiseCompose(
	createTupleParser([
		createExactElementParser(0x28),
		dalvikBytecodeFormat10tParser,
	]),
	([ _opcode, { branchOffset } ]) => ({
		operation: 'goto',
		branchOffset,
	}),
);

type DalvikBytecodeOperationGoto16 = {
	operation: 'goto/16';
	branchOffset: number;
};

const dalvikBytecodeOperationGoto16Parser: Parser<DalvikBytecodeOperationGoto16, Uint8Array> = promiseCompose(
	createTupleParser([
		createExactElementParser(0x29),
		dalvikBytecodeFormat20tParser,
	]),
	([ _opcode, { branchOffset } ]) => ({
		operation: 'goto/16',
		branchOffset,
	}),
);

type DalvikBytecodeOperationInstanceOf = {
	operation: 'instance-of';
	registers: number[];
	typeIndex: IndexIntoTypeIds;
};

const dalvikBytecodeOperationInstanceOfParser: Parser<DalvikBytecodeOperationInstanceOf, Uint8Array> = promiseCompose(
	createTupleParser([
		createExactElementParser(0x20),
		createDalvikBytecodeFormat22cParser({
			isoIndex: isoIndexIntoTypeIds,
		}),
	]),
	([ _opcode, { registers, index } ]) => ({
		operation: 'instance-of',
		registers,
		typeIndex: index,
	}),
);

setParserName(dalvikBytecodeOperationInstanceOfParser, 'dalvikBytecodeOperationInstanceOfParser');

const createDalvikBytecodeOperationArrayElement = <T extends string>(operation: T, opcode: number): Parser<{
	operation: T;
	registers: number[];
}, Uint8Array> => promiseCompose(
	createTupleParser([
		createExactElementParser(opcode),
		dalvikBytecodeFormat23xParser,
	]),
	([ _opcode, { registers } ]) => ({
		operation,
		registers,
	}),
);

const dalvikBytecodeOperationArrayElementGetParser = createDalvikBytecodeOperationArrayElement('aget', 0x44);

type DalvikBytecodeOperationArrayElementGet = Awaited<ReturnType<typeof dalvikBytecodeOperationArrayElementGetParser>>;

const dalvikBytecodeOperationArrayElementGetWideParser = createDalvikBytecodeOperationArrayElement('aget-wide', 0x45);

type DalvikBytecodeOperationArrayElementGetWide = Awaited<ReturnType<typeof dalvikBytecodeOperationArrayElementGetWideParser>>;

const dalvikBytecodeOperationArrayElementGetObjectParser = createDalvikBytecodeOperationArrayElement('aget-object', 0x46);

type DalvikBytecodeOperationArrayElementGetObject = Awaited<ReturnType<typeof dalvikBytecodeOperationArrayElementGetObjectParser>>;

const dalvikBytecodeOperationArrayElementGetBooleanParser = createDalvikBytecodeOperationArrayElement('aget-boolean', 0x47);

type DalvikBytecodeOperationArrayElementGetBoolean = Awaited<ReturnType<typeof dalvikBytecodeOperationArrayElementGetBooleanParser>>;

const dalvikBytecodeOperationArrayElementGetByteParser = createDalvikBytecodeOperationArrayElement('aget-byte', 0x48);

type DalvikBytecodeOperationArrayElementGetByte = Awaited<ReturnType<typeof dalvikBytecodeOperationArrayElementGetByteParser>>;

const dalvikBytecodeOperationArrayElementGetCharParser = createDalvikBytecodeOperationArrayElement('aget-char', 0x49);

type DalvikBytecodeOperationArrayElementGetChar = Awaited<ReturnType<typeof dalvikBytecodeOperationArrayElementGetCharParser>>;

const dalvikBytecodeOperationArrayElementGetShortParser = createDalvikBytecodeOperationArrayElement('aget-short', 0x4a);

type DalvikBytecodeOperationArrayElementGetShort = Awaited<ReturnType<typeof dalvikBytecodeOperationArrayElementGetShortParser>>;

const dalvikBytecodeOperationArrayElementPutParser = createDalvikBytecodeOperationArrayElement('aput', 0x4b);

type DalvikBytecodeOperationArrayElementPut = Awaited<ReturnType<typeof dalvikBytecodeOperationArrayElementPutParser>>;

const dalvikBytecodeOperationArrayElementPutWideParser = createDalvikBytecodeOperationArrayElement('aput-wide', 0x4c);

type DalvikBytecodeOperationArrayElementPutWide = Awaited<ReturnType<typeof dalvikBytecodeOperationArrayElementPutWideParser>>;

const dalvikBytecodeOperationArrayElementPutObjectParser = createDalvikBytecodeOperationArrayElement('aput-object', 0x4d);

type DalvikBytecodeOperationArrayElementPutObject = Awaited<ReturnType<typeof dalvikBytecodeOperationArrayElementPutObjectParser>>;

const dalvikBytecodeOperationArrayElementPutBooleanParser = createDalvikBytecodeOperationArrayElement('aput-boolean', 0x4e);

type DalvikBytecodeOperationArrayElementPutBoolean = Awaited<ReturnType<typeof dalvikBytecodeOperationArrayElementPutBooleanParser>>;

const dalvikBytecodeOperationArrayElementPutByteParser = createDalvikBytecodeOperationArrayElement('aput-byte', 0x4f);

type DalvikBytecodeOperationArrayElementPutByte = Awaited<ReturnType<typeof dalvikBytecodeOperationArrayElementPutByteParser>>;

const dalvikBytecodeOperationArrayElementPutCharParser = createDalvikBytecodeOperationArrayElement('aput-char', 0x50);

type DalvikBytecodeOperationArrayElementPutChar = Awaited<ReturnType<typeof dalvikBytecodeOperationArrayElementPutCharParser>>;

const dalvikBytecodeOperationArrayElementPutShortParser = createDalvikBytecodeOperationArrayElement('aput-short', 0x51);

type DalvikBytecodeOperationArrayElementPutShort = Awaited<ReturnType<typeof dalvikBytecodeOperationArrayElementPutShortParser>>;

type DalvikBytecodeOperationArrayElement =
	| DalvikBytecodeOperationArrayElementGet
	| DalvikBytecodeOperationArrayElementGetWide
	| DalvikBytecodeOperationArrayElementGetObject
	| DalvikBytecodeOperationArrayElementGetBoolean
	| DalvikBytecodeOperationArrayElementGetByte
	| DalvikBytecodeOperationArrayElementGetChar
	| DalvikBytecodeOperationArrayElementGetShort
	| DalvikBytecodeOperationArrayElementPut
	| DalvikBytecodeOperationArrayElementPutWide
	| DalvikBytecodeOperationArrayElementPutObject
	| DalvikBytecodeOperationArrayElementPutBoolean
	| DalvikBytecodeOperationArrayElementPutByte
	| DalvikBytecodeOperationArrayElementPutChar
	| DalvikBytecodeOperationArrayElementPutShort
;

const dalvikBytecodeOperationArrayElementParser: Parser<DalvikBytecodeOperationArrayElement, Uint8Array> = createUnionParser([
	dalvikBytecodeOperationArrayElementGetParser,
	dalvikBytecodeOperationArrayElementGetWideParser,
	dalvikBytecodeOperationArrayElementGetObjectParser,
	dalvikBytecodeOperationArrayElementGetBooleanParser,
	dalvikBytecodeOperationArrayElementGetByteParser,
	dalvikBytecodeOperationArrayElementGetCharParser,
	dalvikBytecodeOperationArrayElementGetShortParser,
	dalvikBytecodeOperationArrayElementPutParser,
	dalvikBytecodeOperationArrayElementPutWideParser,
	dalvikBytecodeOperationArrayElementPutObjectParser,
	dalvikBytecodeOperationArrayElementPutBooleanParser,
	dalvikBytecodeOperationArrayElementPutByteParser,
	dalvikBytecodeOperationArrayElementPutCharParser,
	dalvikBytecodeOperationArrayElementPutShortParser,
]);

setParserName(dalvikBytecodeOperationArrayElementParser, 'dalvikBytecodeOperationArrayElementParser');

const createDalvikBytecodeOperationInstanceField = <T extends string>(operation: T, opcode: number): Parser<{
	operation: T;
	registers: number[];
	fieldIndex: IndexIntoFieldIds;
}, Uint8Array> => promiseCompose(
	createTupleParser([
		createExactElementParser(opcode),
		createDalvikBytecodeFormat22cParser({
			isoIndex: isoIndexIntoFieldIds,
		}),
	]),
	([ _opcode, { registers, index } ]) => ({
		operation,
		registers,
		fieldIndex: index,
	}),
);

const dalvikBytecodeOperationInstanceFieldGetParser = createDalvikBytecodeOperationInstanceField('iget', 0x52);

type DalvikBytecodeOperationInstanceFieldGet = Awaited<ReturnType<typeof dalvikBytecodeOperationInstanceFieldGetParser>>;

const dalvikBytecodeOperationInstanceFieldGetWideParser = createDalvikBytecodeOperationInstanceField('iget-wide', 0x53);

type DalvikBytecodeOperationInstanceFieldGetWide = Awaited<ReturnType<typeof dalvikBytecodeOperationInstanceFieldGetWideParser>>;

const dalvikBytecodeOperationInstanceFieldGetObjectParser = createDalvikBytecodeOperationInstanceField('iget-object', 0x54);

type DalvikBytecodeOperationInstanceFieldGetObject = Awaited<ReturnType<typeof dalvikBytecodeOperationInstanceFieldGetObjectParser>>;

const dalvikBytecodeOperationInstanceFieldGetBooleanParser = createDalvikBytecodeOperationInstanceField('iget-boolean', 0x55);

type DalvikBytecodeOperationInstanceFieldGetBoolean = Awaited<ReturnType<typeof dalvikBytecodeOperationInstanceFieldGetBooleanParser>>;

const dalvikBytecodeOperationInstanceFieldGetByteParser = createDalvikBytecodeOperationInstanceField('iget-byte', 0x56);

type DalvikBytecodeOperationInstanceFieldGetByte = Awaited<ReturnType<typeof dalvikBytecodeOperationInstanceFieldGetByteParser>>;

const dalvikBytecodeOperationInstanceFieldGetCharParser = createDalvikBytecodeOperationInstanceField('iget-char', 0x57);

type DalvikBytecodeOperationInstanceFieldGetChar = Awaited<ReturnType<typeof dalvikBytecodeOperationInstanceFieldGetCharParser>>;

const dalvikBytecodeOperationInstanceFieldGetShortParser = createDalvikBytecodeOperationInstanceField('iget-short', 0x58);

type DalvikBytecodeOperationInstanceFieldGetShort = Awaited<ReturnType<typeof dalvikBytecodeOperationInstanceFieldGetShortParser>>;

const dalvikBytecodeOperationInstanceFieldPutParser = createDalvikBytecodeOperationInstanceField('iput', 0x59);

type DalvikBytecodeOperationInstanceFieldPut = Awaited<ReturnType<typeof dalvikBytecodeOperationInstanceFieldPutParser>>;

const dalvikBytecodeOperationInstanceFieldPutWideParser = createDalvikBytecodeOperationInstanceField('iput-wide', 0x5a);

type DalvikBytecodeOperationInstanceFieldPutWide = Awaited<ReturnType<typeof dalvikBytecodeOperationInstanceFieldPutWideParser>>;

const dalvikBytecodeOperationInstanceFieldPutObjectParser = createDalvikBytecodeOperationInstanceField('iput-object', 0x5b);

type DalvikBytecodeOperationInstanceFieldPutObject = Awaited<ReturnType<typeof dalvikBytecodeOperationInstanceFieldPutObjectParser>>;

const dalvikBytecodeOperationInstanceFieldPutBooleanParser = createDalvikBytecodeOperationInstanceField('iput-boolean', 0x5c);

type DalvikBytecodeOperationInstanceFieldPutBoolean = Awaited<ReturnType<typeof dalvikBytecodeOperationInstanceFieldPutBooleanParser>>;

const dalvikBytecodeOperationInstanceFieldPutByteParser = createDalvikBytecodeOperationInstanceField('iput-byte', 0x5d);

type DalvikBytecodeOperationInstanceFieldPutByte = Awaited<ReturnType<typeof dalvikBytecodeOperationInstanceFieldPutByteParser>>;

const dalvikBytecodeOperationInstanceFieldPutCharParser = createDalvikBytecodeOperationInstanceField('iput-char', 0x5e);

type DalvikBytecodeOperationInstanceFieldPutChar = Awaited<ReturnType<typeof dalvikBytecodeOperationInstanceFieldPutCharParser>>;

const dalvikBytecodeOperationInstanceFieldPutShortParser = createDalvikBytecodeOperationInstanceField('iput-short', 0x5f);

type DalvikBytecodeOperationInstanceFieldPutShort = Awaited<ReturnType<typeof dalvikBytecodeOperationInstanceFieldPutShortParser>>;

type DalvikBytecodeOperationInstanceField =
	| DalvikBytecodeOperationInstanceFieldGet
	| DalvikBytecodeOperationInstanceFieldGetWide
	| DalvikBytecodeOperationInstanceFieldGetObject
	| DalvikBytecodeOperationInstanceFieldGetBoolean
	| DalvikBytecodeOperationInstanceFieldGetByte
	| DalvikBytecodeOperationInstanceFieldGetChar
	| DalvikBytecodeOperationInstanceFieldGetShort
	| DalvikBytecodeOperationInstanceFieldPut
	| DalvikBytecodeOperationInstanceFieldPutWide
	| DalvikBytecodeOperationInstanceFieldPutObject
	| DalvikBytecodeOperationInstanceFieldPutBoolean
	| DalvikBytecodeOperationInstanceFieldPutByte
	| DalvikBytecodeOperationInstanceFieldPutChar
	| DalvikBytecodeOperationInstanceFieldPutShort
;

const dalvikBytecodeOperationInstanceFieldParser: Parser<DalvikBytecodeOperationInstanceField, Uint8Array> = createUnionParser([
	dalvikBytecodeOperationInstanceFieldGetParser,
	dalvikBytecodeOperationInstanceFieldGetWideParser,
	dalvikBytecodeOperationInstanceFieldGetObjectParser,
	dalvikBytecodeOperationInstanceFieldGetBooleanParser,
	dalvikBytecodeOperationInstanceFieldGetByteParser,
	dalvikBytecodeOperationInstanceFieldGetCharParser,
	dalvikBytecodeOperationInstanceFieldGetShortParser,
	dalvikBytecodeOperationInstanceFieldPutParser,
	dalvikBytecodeOperationInstanceFieldPutWideParser,
	dalvikBytecodeOperationInstanceFieldPutObjectParser,
	dalvikBytecodeOperationInstanceFieldPutBooleanParser,
	dalvikBytecodeOperationInstanceFieldPutByteParser,
	dalvikBytecodeOperationInstanceFieldPutCharParser,
	dalvikBytecodeOperationInstanceFieldPutShortParser,
]);

setParserName(dalvikBytecodeOperationInstanceFieldParser, 'dalvikBytecodeOperationInstanceFieldParser');

const createDalvikBytecodeOperationStaticField = <T extends string>(operation: T, opcode: number): Parser<{
	operation: T;
	registers: number[];
	fieldIndex: IndexIntoFieldIds;
}, Uint8Array> => promiseCompose(
	createTupleParser([
		createExactElementParser(opcode),
		createDalvikBytecodeFormat21cParser({
			isoIndex: isoIndexIntoFieldIds,
		}),
	]),
	([ _opcode, { registers, index } ]) => ({
		operation,
		registers,
		fieldIndex: index,
	}),
);

const dalvikBytecodeOperationStaticFieldGetParser = createDalvikBytecodeOperationStaticField('sget', 0x60);

type DalvikBytecodeOperationStaticFieldGet = Awaited<ReturnType<typeof dalvikBytecodeOperationStaticFieldGetParser>>;

const dalvikBytecodeOperationStaticFieldGetWideParser = createDalvikBytecodeOperationStaticField('sget-wide', 0x61);

type DalvikBytecodeOperationStaticFieldGetWide = Awaited<ReturnType<typeof dalvikBytecodeOperationStaticFieldGetWideParser>>;

const dalvikBytecodeOperationStaticFieldGetObjectParser = createDalvikBytecodeOperationStaticField('sget-object', 0x62);

type DalvikBytecodeOperationStaticFieldGetObject = Awaited<ReturnType<typeof dalvikBytecodeOperationStaticFieldGetObjectParser>>;

const dalvikBytecodeOperationStaticFieldGetBooleanParser = createDalvikBytecodeOperationStaticField('sget-boolean', 0x63);

type DalvikBytecodeOperationStaticFieldGetBoolean = Awaited<ReturnType<typeof dalvikBytecodeOperationStaticFieldGetBooleanParser>>;

const dalvikBytecodeOperationStaticFieldGetByteParser = createDalvikBytecodeOperationStaticField('sget-byte', 0x64);

type DalvikBytecodeOperationStaticFieldGetByte = Awaited<ReturnType<typeof dalvikBytecodeOperationStaticFieldGetByteParser>>;

const dalvikBytecodeOperationStaticFieldGetCharParser = createDalvikBytecodeOperationStaticField('sget-char', 0x65);

type DalvikBytecodeOperationStaticFieldGetChar = Awaited<ReturnType<typeof dalvikBytecodeOperationStaticFieldGetCharParser>>;

const dalvikBytecodeOperationStaticFieldGetShortParser = createDalvikBytecodeOperationStaticField('sget-short', 0x66);

type DalvikBytecodeOperationStaticFieldGetShort = Awaited<ReturnType<typeof dalvikBytecodeOperationStaticFieldGetShortParser>>;

const dalvikBytecodeOperationStaticFieldPutParser = createDalvikBytecodeOperationStaticField('sput', 0x67);

type DalvikBytecodeOperationStaticFieldPut = Awaited<ReturnType<typeof dalvikBytecodeOperationStaticFieldPutParser>>;

const dalvikBytecodeOperationStaticFieldPutWideParser = createDalvikBytecodeOperationStaticField('sput-wide', 0x68);

type DalvikBytecodeOperationStaticFieldPutWide = Awaited<ReturnType<typeof dalvikBytecodeOperationStaticFieldPutWideParser>>;

const dalvikBytecodeOperationStaticFieldPutObjectParser = createDalvikBytecodeOperationStaticField('sput-object', 0x69);

type DalvikBytecodeOperationStaticFieldPutObject = Awaited<ReturnType<typeof dalvikBytecodeOperationStaticFieldPutObjectParser>>;

const dalvikBytecodeOperationStaticFieldPutBooleanParser = createDalvikBytecodeOperationStaticField('sput-boolean', 0x6a);

type DalvikBytecodeOperationStaticFieldPutBoolean = Awaited<ReturnType<typeof dalvikBytecodeOperationStaticFieldPutBooleanParser>>;

const dalvikBytecodeOperationStaticFieldPutByteParser = createDalvikBytecodeOperationStaticField('sput-byte', 0x6b);

type DalvikBytecodeOperationStaticFieldPutByte = Awaited<ReturnType<typeof dalvikBytecodeOperationStaticFieldPutByteParser>>;

const dalvikBytecodeOperationStaticFieldPutCharParser = createDalvikBytecodeOperationStaticField('sput-char', 0x6c);

type DalvikBytecodeOperationStaticFieldPutChar = Awaited<ReturnType<typeof dalvikBytecodeOperationStaticFieldPutCharParser>>;

const dalvikBytecodeOperationStaticFieldPutShortParser = createDalvikBytecodeOperationStaticField('sput-short', 0x6d);

type DalvikBytecodeOperationStaticFieldPutShort = Awaited<ReturnType<typeof dalvikBytecodeOperationStaticFieldPutShortParser>>;

type DalvikBytecodeOperationStaticField =
	| DalvikBytecodeOperationStaticFieldGet
	| DalvikBytecodeOperationStaticFieldGetWide
	| DalvikBytecodeOperationStaticFieldGetObject
	| DalvikBytecodeOperationStaticFieldGetBoolean
	| DalvikBytecodeOperationStaticFieldGetByte
	| DalvikBytecodeOperationStaticFieldGetChar
	| DalvikBytecodeOperationStaticFieldGetShort
	| DalvikBytecodeOperationStaticFieldPut
	| DalvikBytecodeOperationStaticFieldPutWide
	| DalvikBytecodeOperationStaticFieldPutObject
	| DalvikBytecodeOperationStaticFieldPutBoolean
	| DalvikBytecodeOperationStaticFieldPutByte
	| DalvikBytecodeOperationStaticFieldPutChar
	| DalvikBytecodeOperationStaticFieldPutShort
;

const dalvikBytecodeOperationStaticFieldParser: Parser<DalvikBytecodeOperationStaticField, Uint8Array> = createUnionParser([
	dalvikBytecodeOperationStaticFieldGetParser,
	dalvikBytecodeOperationStaticFieldGetWideParser,
	dalvikBytecodeOperationStaticFieldGetObjectParser,
	dalvikBytecodeOperationStaticFieldGetBooleanParser,
	dalvikBytecodeOperationStaticFieldGetByteParser,
	dalvikBytecodeOperationStaticFieldGetCharParser,
	dalvikBytecodeOperationStaticFieldGetShortParser,
	dalvikBytecodeOperationStaticFieldPutParser,
	dalvikBytecodeOperationStaticFieldPutWideParser,
	dalvikBytecodeOperationStaticFieldPutObjectParser,
	dalvikBytecodeOperationStaticFieldPutBooleanParser,
	dalvikBytecodeOperationStaticFieldPutByteParser,
	dalvikBytecodeOperationStaticFieldPutCharParser,
	dalvikBytecodeOperationStaticFieldPutShortParser,
]);

setParserName(dalvikBytecodeOperationStaticFieldParser, 'dalvikBytecodeOperationStaticFieldParser');

const createDalvikBytecodeOperationBinaryOperationLiteral8 = <T extends string>(operation: T, opcode: number): Parser<{
	operation: T;
	registers: number[];
	value: number;
}, Uint8Array> => promiseCompose(
	createTupleParser([
		createExactElementParser(opcode),
		createDalvikBytecodeFormat22bParser(),
	]),
	([ _opcode, { registers, value } ]) => ({
		operation,
		registers,
		value,
	}),
);

const dalvikBytecodeOperationAddIntLiteral8Parser = createDalvikBytecodeOperationBinaryOperationLiteral8('add-int/lit8', 0xd8);

type DalvikBytecodeOperationAddIntLiteral8 = Awaited<ReturnType<typeof dalvikBytecodeOperationAddIntLiteral8Parser>>;

const dalvikBytecodeOperationReverseSubtractIntLiteral8Parser = createDalvikBytecodeOperationBinaryOperationLiteral8('rsub-int/lit8', 0xd9);

type DalvikBytecodeOperationReverseSubtractIntLiteral8 = Awaited<ReturnType<typeof dalvikBytecodeOperationReverseSubtractIntLiteral8Parser>>;

const dalvikBytecodeOperationMultiplyIntLiteral8Parser = createDalvikBytecodeOperationBinaryOperationLiteral8('mul-int/lit8', 0xda);

type DalvikBytecodeOperationMultiplyIntLiteral8 = Awaited<ReturnType<typeof dalvikBytecodeOperationMultiplyIntLiteral8Parser>>;

const dalvikBytecodeOperationDivideIntLiteral8Parser = createDalvikBytecodeOperationBinaryOperationLiteral8('div-int/lit8', 0xdb);

type DalvikBytecodeOperationDivideIntLiteral8 = Awaited<ReturnType<typeof dalvikBytecodeOperationDivideIntLiteral8Parser>>;

const dalvikBytecodeOperationRemainderIntLiteral8Parser = createDalvikBytecodeOperationBinaryOperationLiteral8('rem-int/lit8', 0xdc);

type DalvikBytecodeOperationRemainderIntLiteral8 = Awaited<ReturnType<typeof dalvikBytecodeOperationRemainderIntLiteral8Parser>>;

const dalvikBytecodeOperationAndIntLiteral8Parser = createDalvikBytecodeOperationBinaryOperationLiteral8('and-int/lit8', 0xdd);

type DalvikBytecodeOperationAndIntLiteral8 = Awaited<ReturnType<typeof dalvikBytecodeOperationAndIntLiteral8Parser>>;

const dalvikBytecodeOperationOrIntLiteral8Parser = createDalvikBytecodeOperationBinaryOperationLiteral8('or-int/lit8', 0xde);

type DalvikBytecodeOperationOrIntLiteral8 = Awaited<ReturnType<typeof dalvikBytecodeOperationOrIntLiteral8Parser>>;

const dalvikBytecodeOperationXorIntLiteral8Parser = createDalvikBytecodeOperationBinaryOperationLiteral8('xor-int/lit8', 0xdf);

type DalvikBytecodeOperationXorIntLiteral8 = Awaited<ReturnType<typeof dalvikBytecodeOperationXorIntLiteral8Parser>>;

const dalvikBytecodeOperationShiftLeftIntLiteral8Parser = createDalvikBytecodeOperationBinaryOperationLiteral8('shl-int/lit8', 0xe0);

type DalvikBytecodeOperationShiftLeftIntLiteral8 = Awaited<ReturnType<typeof dalvikBytecodeOperationShiftLeftIntLiteral8Parser>>;

const dalvikBytecodeOperationShiftRightIntLiteral8Parser = createDalvikBytecodeOperationBinaryOperationLiteral8('shr-int/lit8', 0xe1);

type DalvikBytecodeOperationShiftRightIntLiteral8 = Awaited<ReturnType<typeof dalvikBytecodeOperationShiftRightIntLiteral8Parser>>;

const dalvikBytecodeOperationUnsignedShiftRightIntLiteral8Parser = createDalvikBytecodeOperationBinaryOperationLiteral8('ushr-int/lit8', 0xe2);

type DalvikBytecodeOperationUnsignedShiftRightIntLiteral8 = Awaited<ReturnType<typeof dalvikBytecodeOperationUnsignedShiftRightIntLiteral8Parser>>;

type DalvikBytecodeOperationBinaryOperationLiteral8 =
	| DalvikBytecodeOperationAddIntLiteral8
	| DalvikBytecodeOperationReverseSubtractIntLiteral8
	| DalvikBytecodeOperationMultiplyIntLiteral8
	| DalvikBytecodeOperationDivideIntLiteral8
	| DalvikBytecodeOperationRemainderIntLiteral8
	| DalvikBytecodeOperationAndIntLiteral8
	| DalvikBytecodeOperationOrIntLiteral8
	| DalvikBytecodeOperationXorIntLiteral8
	| DalvikBytecodeOperationShiftLeftIntLiteral8
	| DalvikBytecodeOperationShiftRightIntLiteral8
	| DalvikBytecodeOperationUnsignedShiftRightIntLiteral8
;

const dalvikBytecodeOperationBinaryOperationLiteral8Parser: Parser<DalvikBytecodeOperationBinaryOperationLiteral8, Uint8Array> = createUnionParser([
	dalvikBytecodeOperationAddIntLiteral8Parser,
	dalvikBytecodeOperationReverseSubtractIntLiteral8Parser,
	dalvikBytecodeOperationMultiplyIntLiteral8Parser,
	dalvikBytecodeOperationDivideIntLiteral8Parser,
	dalvikBytecodeOperationRemainderIntLiteral8Parser,
	dalvikBytecodeOperationAndIntLiteral8Parser,
	dalvikBytecodeOperationOrIntLiteral8Parser,
	dalvikBytecodeOperationXorIntLiteral8Parser,
	dalvikBytecodeOperationShiftLeftIntLiteral8Parser,
	dalvikBytecodeOperationShiftRightIntLiteral8Parser,
	dalvikBytecodeOperationUnsignedShiftRightIntLiteral8Parser,
]);

setParserName(dalvikBytecodeOperationBinaryOperationLiteral8Parser, 'dalvikBytecodeOperationBinaryOperationLiteral8Parser');

const createDalvikBytecodeOperationBinaryOperationLiteral16 = <T extends string>(operation: T, opcode: number): Parser<{
	operation: T;
	registers: number[];
	value: number;
}, Uint8Array> => promiseCompose(
	createTupleParser([
		createExactElementParser(opcode),
		createDalvikBytecodeFormat22sParser(),
	]),
	([ _opcode, { registers, value } ]) => ({
		operation,
		registers,
		value,
	}),
);

const dalvikBytecodeOperationAddIntLiteral16Parser = createDalvikBytecodeOperationBinaryOperationLiteral16('add-int/lit16', 0xd0);

type DalvikBytecodeOperationAddIntLiteral16 = Awaited<ReturnType<typeof dalvikBytecodeOperationAddIntLiteral16Parser>>;

const dalvikBytecodeOperationReverseSubtractIntLiteral16Parser = createDalvikBytecodeOperationBinaryOperationLiteral16('rsub-int/lit16', 0xd1);

type DalvikBytecodeOperationReverseSubtractIntLiteral16 = Awaited<ReturnType<typeof dalvikBytecodeOperationReverseSubtractIntLiteral16Parser>>;

const dalvikBytecodeOperationMultiplyIntLiteral16Parser = createDalvikBytecodeOperationBinaryOperationLiteral16('mul-int/lit16', 0xd2);

type DalvikBytecodeOperationMultiplyIntLiteral16 = Awaited<ReturnType<typeof dalvikBytecodeOperationMultiplyIntLiteral16Parser>>;

const dalvikBytecodeOperationDivideIntLiteral16Parser = createDalvikBytecodeOperationBinaryOperationLiteral16('div-int/lit16', 0xd3);

type DalvikBytecodeOperationDivideIntLiteral16 = Awaited<ReturnType<typeof dalvikBytecodeOperationDivideIntLiteral16Parser>>;

const dalvikBytecodeOperationRemainderIntLiteral16Parser = createDalvikBytecodeOperationBinaryOperationLiteral16('rem-int/lit16', 0xd4);

type DalvikBytecodeOperationRemainderIntLiteral16 = Awaited<ReturnType<typeof dalvikBytecodeOperationRemainderIntLiteral16Parser>>;

const dalvikBytecodeOperationAndIntLiteral16Parser = createDalvikBytecodeOperationBinaryOperationLiteral16('and-int/lit16', 0xd5);

type DalvikBytecodeOperationAndIntLiteral16 = Awaited<ReturnType<typeof dalvikBytecodeOperationAndIntLiteral16Parser>>;

const dalvikBytecodeOperationOrIntLiteral16Parser = createDalvikBytecodeOperationBinaryOperationLiteral16('or-int/lit16', 0xd6);

type DalvikBytecodeOperationOrIntLiteral16 = Awaited<ReturnType<typeof dalvikBytecodeOperationOrIntLiteral16Parser>>;

const dalvikBytecodeOperationXorIntLiteral16Parser = createDalvikBytecodeOperationBinaryOperationLiteral16('xor-int/lit16', 0xd7);

type DalvikBytecodeOperationXorIntLiteral16 = Awaited<ReturnType<typeof dalvikBytecodeOperationXorIntLiteral16Parser>>;

type DalvikBytecodeOperationBinaryOperationLiteral16 =
	| DalvikBytecodeOperationAddIntLiteral16
	| DalvikBytecodeOperationReverseSubtractIntLiteral16
	| DalvikBytecodeOperationMultiplyIntLiteral16
	| DalvikBytecodeOperationDivideIntLiteral16
	| DalvikBytecodeOperationRemainderIntLiteral16
	| DalvikBytecodeOperationAndIntLiteral16
	| DalvikBytecodeOperationOrIntLiteral16
	| DalvikBytecodeOperationXorIntLiteral16
;

const dalvikBytecodeOperationBinaryOperationLiteral16Parser: Parser<DalvikBytecodeOperationBinaryOperationLiteral16, Uint8Array> = createUnionParser([
	dalvikBytecodeOperationAddIntLiteral16Parser,
	dalvikBytecodeOperationReverseSubtractIntLiteral16Parser,
	dalvikBytecodeOperationMultiplyIntLiteral16Parser,
	dalvikBytecodeOperationDivideIntLiteral16Parser,
	dalvikBytecodeOperationRemainderIntLiteral16Parser,
	dalvikBytecodeOperationAndIntLiteral16Parser,
	dalvikBytecodeOperationOrIntLiteral16Parser,
	dalvikBytecodeOperationXorIntLiteral16Parser,
]);

setParserName(dalvikBytecodeOperationBinaryOperationLiteral16Parser, 'dalvikBytecodeOperationBinaryOperationLiteral16Parser');

const createDalvikBytecodeOperationBinaryOperationInPlace = <T extends string>(operation: T, opcode: number): Parser<{
	operation: T;
	registers: number[];
}, Uint8Array> => promiseCompose(
	createTupleParser([
		createExactElementParser(opcode),
		dalvikBytecodeFormat12xParser,
	]),
	([ _opcode, { registers } ]) => ({
		operation,
		registers,
	}),
);

const dalvikBytecodeOperationAddIntInPlaceParser = createDalvikBytecodeOperationBinaryOperationInPlace('add-int/2addr', 0xb0);

type DalvikBytecodeOperationAddIntInPlace = Awaited<ReturnType<typeof dalvikBytecodeOperationAddIntInPlaceParser>>;

const dalvikBytecodeOperationReverseSubtractIntInPlaceParser = createDalvikBytecodeOperationBinaryOperationInPlace('rsub-int', 0xb1);

type DalvikBytecodeOperationReverseSubtractIntInPlace = Awaited<ReturnType<typeof dalvikBytecodeOperationReverseSubtractIntInPlaceParser>>;

const dalvikBytecodeOperationMultiplyIntInPlaceParser = createDalvikBytecodeOperationBinaryOperationInPlace('mul-int/2addr', 0xb2);

type DalvikBytecodeOperationMultiplyIntInPlace = Awaited<ReturnType<typeof dalvikBytecodeOperationMultiplyIntInPlaceParser>>;

const dalvikBytecodeOperationDivideIntInPlaceParser = createDalvikBytecodeOperationBinaryOperationInPlace('div-int/2addr', 0xb3);

type DalvikBytecodeOperationDivideIntInPlace = Awaited<ReturnType<typeof dalvikBytecodeOperationDivideIntInPlaceParser>>;

const dalvikBytecodeOperationRemainderIntInPlaceParser = createDalvikBytecodeOperationBinaryOperationInPlace('rem-int/2addr', 0xb4);

type DalvikBytecodeOperationRemainderIntInPlace = Awaited<ReturnType<typeof dalvikBytecodeOperationRemainderIntInPlaceParser>>;

const dalvikBytecodeOperationAndIntInPlaceParser = createDalvikBytecodeOperationBinaryOperationInPlace('and-int/2addr', 0xb5);

type DalvikBytecodeOperationAndIntInPlace = Awaited<ReturnType<typeof dalvikBytecodeOperationAndIntInPlaceParser>>;

const dalvikBytecodeOperationOrIntInPlaceParser = createDalvikBytecodeOperationBinaryOperationInPlace('or-int/2addr', 0xb6);

type DalvikBytecodeOperationOrIntInPlace = Awaited<ReturnType<typeof dalvikBytecodeOperationOrIntInPlaceParser>>;

const dalvikBytecodeOperationXorIntInPlaceParser = createDalvikBytecodeOperationBinaryOperationInPlace('xor-int/2addr', 0xb7);

type DalvikBytecodeOperationXorIntInPlace = Awaited<ReturnType<typeof dalvikBytecodeOperationXorIntInPlaceParser>>;

const dalvikBytecodeOperationShiftLeftIntInPlaceParser = createDalvikBytecodeOperationBinaryOperationInPlace('shl-int/2addr', 0xb8);

type DalvikBytecodeOperationShiftLeftIntInPlace = Awaited<ReturnType<typeof dalvikBytecodeOperationShiftLeftIntInPlaceParser>>;

const dalvikBytecodeOperationShiftRightIntInPlaceParser = createDalvikBytecodeOperationBinaryOperationInPlace('shr-int/2addr', 0xb9);

type DalvikBytecodeOperationShiftRightIntInPlace = Awaited<ReturnType<typeof dalvikBytecodeOperationShiftRightIntInPlaceParser>>;

const dalvikBytecodeOperationUnsignedShiftRightIntInPlaceParser = createDalvikBytecodeOperationBinaryOperationInPlace('ushr-int/2addr', 0xba);

type DalvikBytecodeOperationUnsignedShiftRightIntInPlace = Awaited<ReturnType<typeof dalvikBytecodeOperationUnsignedShiftRightIntInPlaceParser>>;

const dalvikBytecodeOperationAddLongInPlaceParser = createDalvikBytecodeOperationBinaryOperationInPlace('add-long/2addr', 0xbb);

type DalvikBytecodeOperationAddLongInPlace = Awaited<ReturnType<typeof dalvikBytecodeOperationAddLongInPlaceParser>>;

const dalvikBytecodeOperationReverseSubtractLongInPlaceParser = createDalvikBytecodeOperationBinaryOperationInPlace('rsub-long', 0xbc);

type DalvikBytecodeOperationReverseSubtractLongInPlace = Awaited<ReturnType<typeof dalvikBytecodeOperationReverseSubtractLongInPlaceParser>>;

const dalvikBytecodeOperationMultiplyLongInPlaceParser = createDalvikBytecodeOperationBinaryOperationInPlace('mul-long/2addr', 0xbd);

type DalvikBytecodeOperationMultiplyLongInPlace = Awaited<ReturnType<typeof dalvikBytecodeOperationMultiplyLongInPlaceParser>>;

const dalvikBytecodeOperationDivideLongInPlaceParser = createDalvikBytecodeOperationBinaryOperationInPlace('div-long/2addr', 0xbe);

type DalvikBytecodeOperationDivideLongInPlace = Awaited<ReturnType<typeof dalvikBytecodeOperationDivideLongInPlaceParser>>;

const dalvikBytecodeOperationRemainderLongInPlaceParser = createDalvikBytecodeOperationBinaryOperationInPlace('rem-long/2addr', 0xbf);

type DalvikBytecodeOperationRemainderLongInPlace = Awaited<ReturnType<typeof dalvikBytecodeOperationRemainderLongInPlaceParser>>;

const dalvikBytecodeOperationAndLongInPlaceParser = createDalvikBytecodeOperationBinaryOperationInPlace('and-long/2addr', 0xc0);

type DalvikBytecodeOperationAndLongInPlace = Awaited<ReturnType<typeof dalvikBytecodeOperationAndLongInPlaceParser>>;

const dalvikBytecodeOperationOrLongInPlaceParser = createDalvikBytecodeOperationBinaryOperationInPlace('or-long/2addr', 0xc1);

type DalvikBytecodeOperationOrLongInPlace = Awaited<ReturnType<typeof dalvikBytecodeOperationOrLongInPlaceParser>>;

const dalvikBytecodeOperationXorLongInPlaceParser = createDalvikBytecodeOperationBinaryOperationInPlace('xor-long/2addr', 0xc2);

type DalvikBytecodeOperationXorLongInPlace = Awaited<ReturnType<typeof dalvikBytecodeOperationXorLongInPlaceParser>>;

const dalvikBytecodeOperationShiftLeftLongInPlaceParser = createDalvikBytecodeOperationBinaryOperationInPlace('shl-long/2addr', 0xc3);

type DalvikBytecodeOperationShiftLeftLongInPlace = Awaited<ReturnType<typeof dalvikBytecodeOperationShiftLeftLongInPlaceParser>>;

const dalvikBytecodeOperationShiftRightLongInPlaceParser = createDalvikBytecodeOperationBinaryOperationInPlace('shr-long/2addr', 0xc4);

type DalvikBytecodeOperationShiftRightLongInPlace = Awaited<ReturnType<typeof dalvikBytecodeOperationShiftRightLongInPlaceParser>>;

const dalvikBytecodeOperationUnsignedShiftRightLongInPlaceParser = createDalvikBytecodeOperationBinaryOperationInPlace('ushr-long/2addr', 0xc5);

type DalvikBytecodeOperationUnsignedShiftRightLongInPlace = Awaited<ReturnType<typeof dalvikBytecodeOperationUnsignedShiftRightLongInPlaceParser>>;

const dalvikBytecodeOperationAddFloatInPlaceParser = createDalvikBytecodeOperationBinaryOperationInPlace('add-float/2addr', 0xc6);

type DalvikBytecodeOperationAddFloatInPlace = Awaited<ReturnType<typeof dalvikBytecodeOperationAddFloatInPlaceParser>>;

const dalvikBytecodeOperationSubtractFloatInPlaceParser = createDalvikBytecodeOperationBinaryOperationInPlace('sub-float/2addr', 0xc7);

type DalvikBytecodeOperationSubtractFloatInPlace = Awaited<ReturnType<typeof dalvikBytecodeOperationSubtractFloatInPlaceParser>>;

const dalvikBytecodeOperationMultiplyFloatInPlaceParser = createDalvikBytecodeOperationBinaryOperationInPlace('mul-float/2addr', 0xc8);

type DalvikBytecodeOperationMultiplyFloatInPlace = Awaited<ReturnType<typeof dalvikBytecodeOperationMultiplyFloatInPlaceParser>>;

const dalvikBytecodeOperationDivideFloatInPlaceParser = createDalvikBytecodeOperationBinaryOperationInPlace('div-float/2addr', 0xc9);

type DalvikBytecodeOperationDivideFloatInPlace = Awaited<ReturnType<typeof dalvikBytecodeOperationDivideFloatInPlaceParser>>;

const dalvikBytecodeOperationAddDoubleInPlaceParser = createDalvikBytecodeOperationBinaryOperationInPlace('add-double/2addr', 0xca);

type DalvikBytecodeOperationAddDoubleInPlace = Awaited<ReturnType<typeof dalvikBytecodeOperationAddDoubleInPlaceParser>>;

const dalvikBytecodeOperationSubtractDoubleInPlaceParser = createDalvikBytecodeOperationBinaryOperationInPlace('sub-double/2addr', 0xcb);

type DalvikBytecodeOperationSubtractDoubleInPlace = Awaited<ReturnType<typeof dalvikBytecodeOperationSubtractDoubleInPlaceParser>>;

const dalvikBytecodeOperationMultiplyDoubleInPlaceParser = createDalvikBytecodeOperationBinaryOperationInPlace('mul-double/2addr', 0xcc);

type DalvikBytecodeOperationMultiplyDoubleInPlace = Awaited<ReturnType<typeof dalvikBytecodeOperationMultiplyDoubleInPlaceParser>>;

const dalvikBytecodeOperationDivideDoubleInPlaceParser = createDalvikBytecodeOperationBinaryOperationInPlace('div-double/2addr', 0xcd);

type DalvikBytecodeOperationDivideDoubleInPlace = Awaited<ReturnType<typeof dalvikBytecodeOperationDivideDoubleInPlaceParser>>;

const dalvikBytecodeOperationRemainderDoubleInPlaceParser = createDalvikBytecodeOperationBinaryOperationInPlace('rem-double/2addr', 0xce);

type DalvikBytecodeOperationRemainderDoubleInPlace = Awaited<ReturnType<typeof dalvikBytecodeOperationRemainderDoubleInPlaceParser>>;

type DalvikBytecodeOperationBinaryOperationInPlace =
	| DalvikBytecodeOperationAddIntInPlace
	| DalvikBytecodeOperationReverseSubtractIntInPlace
	| DalvikBytecodeOperationMultiplyIntInPlace
	| DalvikBytecodeOperationDivideIntInPlace
	| DalvikBytecodeOperationRemainderIntInPlace
	| DalvikBytecodeOperationAndIntInPlace
	| DalvikBytecodeOperationOrIntInPlace
	| DalvikBytecodeOperationXorIntInPlace
	| DalvikBytecodeOperationShiftLeftIntInPlace
	| DalvikBytecodeOperationShiftRightIntInPlace
	| DalvikBytecodeOperationUnsignedShiftRightIntInPlace
	| DalvikBytecodeOperationAddLongInPlace
	| DalvikBytecodeOperationReverseSubtractLongInPlace
	| DalvikBytecodeOperationMultiplyLongInPlace
	| DalvikBytecodeOperationDivideLongInPlace
	| DalvikBytecodeOperationRemainderLongInPlace
	| DalvikBytecodeOperationAndLongInPlace
	| DalvikBytecodeOperationOrLongInPlace
	| DalvikBytecodeOperationXorLongInPlace
	| DalvikBytecodeOperationShiftLeftLongInPlace
	| DalvikBytecodeOperationShiftRightLongInPlace
	| DalvikBytecodeOperationUnsignedShiftRightLongInPlace
	| DalvikBytecodeOperationAddFloatInPlace
	| DalvikBytecodeOperationSubtractFloatInPlace
	| DalvikBytecodeOperationMultiplyFloatInPlace
	| DalvikBytecodeOperationDivideFloatInPlace
	| DalvikBytecodeOperationAddDoubleInPlace
	| DalvikBytecodeOperationSubtractDoubleInPlace
	| DalvikBytecodeOperationMultiplyDoubleInPlace
	| DalvikBytecodeOperationDivideDoubleInPlace
	| DalvikBytecodeOperationRemainderDoubleInPlace
;

const dalvikBytecodeOperationBinaryOperationInPlaceParser: Parser<DalvikBytecodeOperationBinaryOperationInPlace, Uint8Array> = createUnionParser([
	dalvikBytecodeOperationAddIntInPlaceParser,
	dalvikBytecodeOperationReverseSubtractIntInPlaceParser,
	dalvikBytecodeOperationMultiplyIntInPlaceParser,
	dalvikBytecodeOperationDivideIntInPlaceParser,
	dalvikBytecodeOperationRemainderIntInPlaceParser,
	dalvikBytecodeOperationAndIntInPlaceParser,
	dalvikBytecodeOperationOrIntInPlaceParser,
	dalvikBytecodeOperationXorIntInPlaceParser,
	dalvikBytecodeOperationShiftLeftIntInPlaceParser,
	dalvikBytecodeOperationShiftRightIntInPlaceParser,
	dalvikBytecodeOperationUnsignedShiftRightIntInPlaceParser,
	dalvikBytecodeOperationAddLongInPlaceParser,
	dalvikBytecodeOperationReverseSubtractLongInPlaceParser,
	dalvikBytecodeOperationMultiplyLongInPlaceParser,
	dalvikBytecodeOperationDivideLongInPlaceParser,
	dalvikBytecodeOperationRemainderLongInPlaceParser,
	dalvikBytecodeOperationAndLongInPlaceParser,
	dalvikBytecodeOperationOrLongInPlaceParser,
	dalvikBytecodeOperationXorLongInPlaceParser,
	dalvikBytecodeOperationShiftLeftLongInPlaceParser,
	dalvikBytecodeOperationShiftRightLongInPlaceParser,
	dalvikBytecodeOperationUnsignedShiftRightLongInPlaceParser,
	dalvikBytecodeOperationAddFloatInPlaceParser,
	dalvikBytecodeOperationSubtractFloatInPlaceParser,
	dalvikBytecodeOperationMultiplyFloatInPlaceParser,
	dalvikBytecodeOperationDivideFloatInPlaceParser,
	dalvikBytecodeOperationAddDoubleInPlaceParser,
	dalvikBytecodeOperationSubtractDoubleInPlaceParser,
	dalvikBytecodeOperationMultiplyDoubleInPlaceParser,
	dalvikBytecodeOperationDivideDoubleInPlaceParser,
	dalvikBytecodeOperationRemainderDoubleInPlaceParser,
]);

setParserName(dalvikBytecodeOperationBinaryOperationInPlaceParser, 'dalvikBytecodeOperationBinaryOperationInPlaceParser');

const createDalvikBytecodeOperationBinaryOperation = <T extends string>(operation: T, opcode: number): Parser<{
	operation: T;
	registers: number[];
}, Uint8Array> => promiseCompose(
	createTupleParser([
		createExactElementParser(opcode),
		dalvikBytecodeFormat23xParser,
	]),
	([ _opcode, { registers } ]) => ({
		operation,
		registers,
	}),
);

const dalvikBytecodeOperationAddIntParser = createDalvikBytecodeOperationBinaryOperation('add-int', 0x90);

type DalvikBytecodeOperationAddInt = Awaited<ReturnType<typeof dalvikBytecodeOperationAddIntParser>>;

const dalvikBytecodeOperationSubtractIntParser = createDalvikBytecodeOperationBinaryOperation('sub-int', 0x91);

type DalvikBytecodeOperationSubtractInt = Awaited<ReturnType<typeof dalvikBytecodeOperationSubtractIntParser>>;

const dalvikBytecodeOperationMultiplyIntParser = createDalvikBytecodeOperationBinaryOperation('mul-int', 0x92);

type DalvikBytecodeOperationMultiplyInt = Awaited<ReturnType<typeof dalvikBytecodeOperationMultiplyIntParser>>;

const dalvikBytecodeOperationDivideIntParser = createDalvikBytecodeOperationBinaryOperation('div-int', 0x93);

type DalvikBytecodeOperationDivideInt = Awaited<ReturnType<typeof dalvikBytecodeOperationDivideIntParser>>;

const dalvikBytecodeOperationRemainderIntParser = createDalvikBytecodeOperationBinaryOperation('rem-int', 0x94);

type DalvikBytecodeOperationRemainderInt = Awaited<ReturnType<typeof dalvikBytecodeOperationRemainderIntParser>>;

const dalvikBytecodeOperationAndIntParser = createDalvikBytecodeOperationBinaryOperation('and-int', 0x95);

type DalvikBytecodeOperationAndInt = Awaited<ReturnType<typeof dalvikBytecodeOperationAndIntParser>>;

const dalvikBytecodeOperationOrIntParser = createDalvikBytecodeOperationBinaryOperation('or-int', 0x96);

type DalvikBytecodeOperationOrInt = Awaited<ReturnType<typeof dalvikBytecodeOperationOrIntParser>>;

const dalvikBytecodeOperationXorIntParser = createDalvikBytecodeOperationBinaryOperation('xor-int', 0x97);

type DalvikBytecodeOperationXorInt = Awaited<ReturnType<typeof dalvikBytecodeOperationXorIntParser>>;

const dalvikBytecodeOperationShiftLeftIntParser = createDalvikBytecodeOperationBinaryOperation('shl-int', 0x98);

type DalvikBytecodeOperationShiftLeftInt = Awaited<ReturnType<typeof dalvikBytecodeOperationShiftLeftIntParser>>;

const dalvikBytecodeOperationShiftRightIntParser = createDalvikBytecodeOperationBinaryOperation('shr-int', 0x99);

type DalvikBytecodeOperationShiftRightInt = Awaited<ReturnType<typeof dalvikBytecodeOperationShiftRightIntParser>>;

const dalvikBytecodeOperationUnsignedShiftRightIntParser = createDalvikBytecodeOperationBinaryOperation('ushr-int', 0x9a);

type DalvikBytecodeOperationUnsignedShiftRightInt = Awaited<ReturnType<typeof dalvikBytecodeOperationUnsignedShiftRightIntParser>>;

const dalvikBytecodeOperationAddLongParser = createDalvikBytecodeOperationBinaryOperation('add-long', 0x9b);

type DalvikBytecodeOperationAddLong = Awaited<ReturnType<typeof dalvikBytecodeOperationAddLongParser>>;

const dalvikBytecodeOperationSubtractLongParser = createDalvikBytecodeOperationBinaryOperation('sub-long', 0x9c);

type DalvikBytecodeOperationSubtractLong = Awaited<ReturnType<typeof dalvikBytecodeOperationSubtractLongParser>>;

const dalvikBytecodeOperationMultiplyLongParser = createDalvikBytecodeOperationBinaryOperation('mul-long', 0x9d);

type DalvikBytecodeOperationMultiplyLong = Awaited<ReturnType<typeof dalvikBytecodeOperationMultiplyLongParser>>;

const dalvikBytecodeOperationDivideLongParser = createDalvikBytecodeOperationBinaryOperation('div-long', 0x9e);

type DalvikBytecodeOperationDivideLong = Awaited<ReturnType<typeof dalvikBytecodeOperationDivideLongParser>>;

const dalvikBytecodeOperationRemainderLongParser = createDalvikBytecodeOperationBinaryOperation('rem-long', 0x9f);

type DalvikBytecodeOperationRemainderLong = Awaited<ReturnType<typeof dalvikBytecodeOperationRemainderLongParser>>;

const dalvikBytecodeOperationAndLongParser = createDalvikBytecodeOperationBinaryOperation('and-long', 0xa0);

type DalvikBytecodeOperationAndLong = Awaited<ReturnType<typeof dalvikBytecodeOperationAndLongParser>>;

const dalvikBytecodeOperationOrLongParser = createDalvikBytecodeOperationBinaryOperation('or-long', 0xa1);

type DalvikBytecodeOperationOrLong = Awaited<ReturnType<typeof dalvikBytecodeOperationOrLongParser>>;

const dalvikBytecodeOperationXorLongParser = createDalvikBytecodeOperationBinaryOperation('xor-long', 0xa2);

type DalvikBytecodeOperationXorLong = Awaited<ReturnType<typeof dalvikBytecodeOperationXorLongParser>>;

const dalvikBytecodeOperationShiftLeftLongParser = createDalvikBytecodeOperationBinaryOperation('shl-long', 0xa3);

type DalvikBytecodeOperationShiftLeftLong = Awaited<ReturnType<typeof dalvikBytecodeOperationShiftLeftLongParser>>;

const dalvikBytecodeOperationShiftRightLongParser = createDalvikBytecodeOperationBinaryOperation('shr-long', 0xa4);

type DalvikBytecodeOperationShiftRightLong = Awaited<ReturnType<typeof dalvikBytecodeOperationShiftRightLongParser>>;

const dalvikBytecodeOperationUnsignedShiftRightLongParser = createDalvikBytecodeOperationBinaryOperation('ushr-long', 0xa5);

type DalvikBytecodeOperationUnsignedShiftRightLong = Awaited<ReturnType<typeof dalvikBytecodeOperationUnsignedShiftRightLongParser>>;

const dalvikBytecodeOperationAddFloatParser = createDalvikBytecodeOperationBinaryOperation('add-float', 0xa6);

type DalvikBytecodeOperationAddFloat = Awaited<ReturnType<typeof dalvikBytecodeOperationAddFloatParser>>;

const dalvikBytecodeOperationSubtractFloatParser = createDalvikBytecodeOperationBinaryOperation('sub-float', 0xa7);

type DalvikBytecodeOperationSubtractFloat = Awaited<ReturnType<typeof dalvikBytecodeOperationSubtractFloatParser>>;

const dalvikBytecodeOperationMultiplyFloatParser = createDalvikBytecodeOperationBinaryOperation('mul-float', 0xa8);

type DalvikBytecodeOperationMultiplyFloat = Awaited<ReturnType<typeof dalvikBytecodeOperationMultiplyFloatParser>>;

const dalvikBytecodeOperationDivideFloatParser = createDalvikBytecodeOperationBinaryOperation('div-float', 0xa9);

type DalvikBytecodeOperationDivideFloat = Awaited<ReturnType<typeof dalvikBytecodeOperationDivideFloatParser>>;

const dalvikBytecodeOperationAddDoubleParser = createDalvikBytecodeOperationBinaryOperation('add-double', 0xaa);

type DalvikBytecodeOperationAddDouble = Awaited<ReturnType<typeof dalvikBytecodeOperationAddDoubleParser>>;

const dalvikBytecodeOperationSubtractDoubleParser = createDalvikBytecodeOperationBinaryOperation('sub-double', 0xab);

type DalvikBytecodeOperationSubtractDouble = Awaited<ReturnType<typeof dalvikBytecodeOperationSubtractDoubleParser>>;

const dalvikBytecodeOperationMultiplyDoubleParser = createDalvikBytecodeOperationBinaryOperation('mul-double', 0xac);

type DalvikBytecodeOperationMultiplyDouble = Awaited<ReturnType<typeof dalvikBytecodeOperationMultiplyDoubleParser>>;

const dalvikBytecodeOperationDivideDoubleParser = createDalvikBytecodeOperationBinaryOperation('div-double', 0xad);

type DalvikBytecodeOperationDivideDouble = Awaited<ReturnType<typeof dalvikBytecodeOperationDivideDoubleParser>>;

const dalvikBytecodeOperationRemainderDoubleParser = createDalvikBytecodeOperationBinaryOperation('rem-double', 0xae);

type DalvikBytecodeOperationRemainderDouble = Awaited<ReturnType<typeof dalvikBytecodeOperationRemainderDoubleParser>>;

type DalvikBytecodeOperationBinaryOperation =
	| DalvikBytecodeOperationAddInt
	| DalvikBytecodeOperationSubtractInt
	| DalvikBytecodeOperationMultiplyInt
	| DalvikBytecodeOperationDivideInt
	| DalvikBytecodeOperationRemainderInt
	| DalvikBytecodeOperationAndInt
	| DalvikBytecodeOperationOrInt
	| DalvikBytecodeOperationXorInt
	| DalvikBytecodeOperationShiftLeftInt
	| DalvikBytecodeOperationShiftRightInt
	| DalvikBytecodeOperationUnsignedShiftRightInt
	| DalvikBytecodeOperationAddLong
	| DalvikBytecodeOperationSubtractLong
	| DalvikBytecodeOperationMultiplyLong
	| DalvikBytecodeOperationDivideLong
	| DalvikBytecodeOperationRemainderLong
	| DalvikBytecodeOperationAndLong
	| DalvikBytecodeOperationOrLong
	| DalvikBytecodeOperationXorLong
	| DalvikBytecodeOperationShiftLeftLong
	| DalvikBytecodeOperationShiftRightLong
	| DalvikBytecodeOperationUnsignedShiftRightLong
	| DalvikBytecodeOperationAddFloat
	| DalvikBytecodeOperationSubtractFloat
	| DalvikBytecodeOperationMultiplyFloat
	| DalvikBytecodeOperationDivideFloat
	| DalvikBytecodeOperationAddDouble
	| DalvikBytecodeOperationSubtractDouble
	| DalvikBytecodeOperationMultiplyDouble
	| DalvikBytecodeOperationDivideDouble
	| DalvikBytecodeOperationRemainderDouble
;

const dalvikBytecodeOperationBinaryOperationParser: Parser<DalvikBytecodeOperationBinaryOperation, Uint8Array> = createUnionParser([
	dalvikBytecodeOperationAddIntParser,
	dalvikBytecodeOperationSubtractIntParser,
	dalvikBytecodeOperationMultiplyIntParser,
	dalvikBytecodeOperationDivideIntParser,
	dalvikBytecodeOperationRemainderIntParser,
	dalvikBytecodeOperationAndIntParser,
	dalvikBytecodeOperationOrIntParser,
	dalvikBytecodeOperationXorIntParser,
	dalvikBytecodeOperationShiftLeftIntParser,
	dalvikBytecodeOperationShiftRightIntParser,
	dalvikBytecodeOperationUnsignedShiftRightIntParser,
	dalvikBytecodeOperationAddLongParser,
	dalvikBytecodeOperationSubtractLongParser,
	dalvikBytecodeOperationMultiplyLongParser,
	dalvikBytecodeOperationDivideLongParser,
	dalvikBytecodeOperationRemainderLongParser,
	dalvikBytecodeOperationAndLongParser,
	dalvikBytecodeOperationOrLongParser,
	dalvikBytecodeOperationXorLongParser,
	dalvikBytecodeOperationShiftLeftLongParser,
	dalvikBytecodeOperationShiftRightLongParser,
	dalvikBytecodeOperationUnsignedShiftRightLongParser,
	dalvikBytecodeOperationAddFloatParser,
	dalvikBytecodeOperationSubtractFloatParser,
	dalvikBytecodeOperationMultiplyFloatParser,
	dalvikBytecodeOperationDivideFloatParser,
	dalvikBytecodeOperationAddDoubleParser,
	dalvikBytecodeOperationSubtractDoubleParser,
	dalvikBytecodeOperationMultiplyDoubleParser,
	dalvikBytecodeOperationDivideDoubleParser,
	dalvikBytecodeOperationRemainderDoubleParser,
]);

setParserName(dalvikBytecodeOperationBinaryOperationParser, 'dalvikBytecodeOperationBinaryOperationParser');

const createDalvikBytecodeOperationUnaryOperation = <T extends string>(operation: T, opcode: number): Parser<{
	operation: T;
	registers: number[];
}, Uint8Array> => promiseCompose(
	createTupleParser([
		createExactElementParser(opcode),
		dalvikBytecodeFormat12xParser,
	]),
	([ _opcode, { registers } ]) => ({
		operation,
		registers,
	}),
);

const dalvikBytecodeOperationNegateIntParser = createDalvikBytecodeOperationUnaryOperation('neg-int', 0x7b);

type DalvikBytecodeOperationNegateInt = Awaited<ReturnType<typeof dalvikBytecodeOperationNegateIntParser>>;

const dalvikBytecodeOperationNotIntParser = createDalvikBytecodeOperationUnaryOperation('not-int', 0x7c);

type DalvikBytecodeOperationNotInt = Awaited<ReturnType<typeof dalvikBytecodeOperationNotIntParser>>;

const dalvikBytecodeOperationNegateLongParser = createDalvikBytecodeOperationUnaryOperation('neg-long', 0x7d);

type DalvikBytecodeOperationNegateLong = Awaited<ReturnType<typeof dalvikBytecodeOperationNegateLongParser>>;

const dalvikBytecodeOperationNotLongParser = createDalvikBytecodeOperationUnaryOperation('not-long', 0x7e);

type DalvikBytecodeOperationNotLong = Awaited<ReturnType<typeof dalvikBytecodeOperationNotLongParser>>;

const dalvikBytecodeOperationNegateFloatParser = createDalvikBytecodeOperationUnaryOperation('neg-float', 0x7f);

type DalvikBytecodeOperationNegateFloat = Awaited<ReturnType<typeof dalvikBytecodeOperationNegateFloatParser>>;

const dalvikBytecodeOperationNegateDoubleParser = createDalvikBytecodeOperationUnaryOperation('neg-double', 0x80);

type DalvikBytecodeOperationNegateDouble = Awaited<ReturnType<typeof dalvikBytecodeOperationNegateDoubleParser>>;

const dalvikBytecodeOperationIntToLongParser = createDalvikBytecodeOperationUnaryOperation('int-to-long', 0x81);

type DalvikBytecodeOperationIntToLong = Awaited<ReturnType<typeof dalvikBytecodeOperationIntToLongParser>>;

const dalvikBytecodeOperationIntToFloatParser = createDalvikBytecodeOperationUnaryOperation('int-to-float', 0x82);

type DalvikBytecodeOperationIntToFloat = Awaited<ReturnType<typeof dalvikBytecodeOperationIntToFloatParser>>;

const dalvikBytecodeOperationIntToDoubleParser = createDalvikBytecodeOperationUnaryOperation('int-to-double', 0x83);

type DalvikBytecodeOperationIntToDouble = Awaited<ReturnType<typeof dalvikBytecodeOperationIntToDoubleParser>>;

const dalvikBytecodeOperationLongToIntParser = createDalvikBytecodeOperationUnaryOperation('long-to-int', 0x84);

type DalvikBytecodeOperationLongToInt = Awaited<ReturnType<typeof dalvikBytecodeOperationLongToIntParser>>;

const dalvikBytecodeOperationLongToFloatParser = createDalvikBytecodeOperationUnaryOperation('long-to-float', 0x85);

type DalvikBytecodeOperationLongToFloat = Awaited<ReturnType<typeof dalvikBytecodeOperationLongToFloatParser>>;

const dalvikBytecodeOperationLongToDoubleParser = createDalvikBytecodeOperationUnaryOperation('long-to-double', 0x86);

type DalvikBytecodeOperationLongToDouble = Awaited<ReturnType<typeof dalvikBytecodeOperationLongToDoubleParser>>;

const dalvikBytecodeOperationFloatToIntParser = createDalvikBytecodeOperationUnaryOperation('float-to-int', 0x87);

type DalvikBytecodeOperationFloatToInt = Awaited<ReturnType<typeof dalvikBytecodeOperationFloatToIntParser>>;

const dalvikBytecodeOperationFloatToLongParser = createDalvikBytecodeOperationUnaryOperation('float-to-long', 0x88);

type DalvikBytecodeOperationFloatToLong = Awaited<ReturnType<typeof dalvikBytecodeOperationFloatToLongParser>>;

const dalvikBytecodeOperationFloatToDoubleParser = createDalvikBytecodeOperationUnaryOperation('float-to-double', 0x89);

type DalvikBytecodeOperationFloatToDouble = Awaited<ReturnType<typeof dalvikBytecodeOperationFloatToDoubleParser>>;

const dalvikBytecodeOperationDoubleToIntParser = createDalvikBytecodeOperationUnaryOperation('double-to-int', 0x8a);

type DalvikBytecodeOperationDoubleToInt = Awaited<ReturnType<typeof dalvikBytecodeOperationDoubleToIntParser>>;

const dalvikBytecodeOperationDoubleToLongParser = createDalvikBytecodeOperationUnaryOperation('double-to-long', 0x8b);

type DalvikBytecodeOperationDoubleToLong = Awaited<ReturnType<typeof dalvikBytecodeOperationDoubleToLongParser>>;

const dalvikBytecodeOperationDoubleToFloatParser = createDalvikBytecodeOperationUnaryOperation('double-to-float', 0x8c);

type DalvikBytecodeOperationDoubleToFloat = Awaited<ReturnType<typeof dalvikBytecodeOperationDoubleToFloatParser>>;

const dalvikBytecodeOperationIntToByteParser = createDalvikBytecodeOperationUnaryOperation('int-to-byte', 0x8d);

type DalvikBytecodeOperationIntToByte = Awaited<ReturnType<typeof dalvikBytecodeOperationIntToByteParser>>;

const dalvikBytecodeOperationIntToCharParser = createDalvikBytecodeOperationUnaryOperation('int-to-char', 0x8e);

type DalvikBytecodeOperationIntToChar = Awaited<ReturnType<typeof dalvikBytecodeOperationIntToCharParser>>;

const dalvikBytecodeOperationIntToShortParser = createDalvikBytecodeOperationUnaryOperation('int-to-short', 0x8f);

type DalvikBytecodeOperationIntToShort = Awaited<ReturnType<typeof dalvikBytecodeOperationIntToShortParser>>;

type DalvikBytecodeOperationUnaryOperation =
	| DalvikBytecodeOperationNegateInt
	| DalvikBytecodeOperationNotInt
	| DalvikBytecodeOperationNegateLong
	| DalvikBytecodeOperationNotLong
	| DalvikBytecodeOperationNegateFloat
	| DalvikBytecodeOperationNegateDouble
	| DalvikBytecodeOperationIntToLong
	| DalvikBytecodeOperationIntToFloat
	| DalvikBytecodeOperationIntToDouble
	| DalvikBytecodeOperationLongToInt
	| DalvikBytecodeOperationLongToFloat
	| DalvikBytecodeOperationLongToDouble
	| DalvikBytecodeOperationFloatToInt
	| DalvikBytecodeOperationFloatToLong
	| DalvikBytecodeOperationFloatToDouble
	| DalvikBytecodeOperationDoubleToInt
	| DalvikBytecodeOperationDoubleToLong
	| DalvikBytecodeOperationDoubleToFloat
	| DalvikBytecodeOperationIntToByte
	| DalvikBytecodeOperationIntToChar
	| DalvikBytecodeOperationIntToShort
;

const dalvikBytecodeOperationUnaryOperationParser: Parser<DalvikBytecodeOperationUnaryOperation, Uint8Array> = createUnionParser([
	dalvikBytecodeOperationNegateIntParser,
	dalvikBytecodeOperationNotIntParser,
	dalvikBytecodeOperationNegateLongParser,
	dalvikBytecodeOperationNotLongParser,
	dalvikBytecodeOperationNegateFloatParser,
	dalvikBytecodeOperationNegateDoubleParser,
	dalvikBytecodeOperationIntToLongParser,
	dalvikBytecodeOperationIntToFloatParser,
	dalvikBytecodeOperationIntToDoubleParser,
	dalvikBytecodeOperationLongToIntParser,
	dalvikBytecodeOperationLongToFloatParser,
	dalvikBytecodeOperationLongToDoubleParser,
	dalvikBytecodeOperationFloatToIntParser,
	dalvikBytecodeOperationFloatToLongParser,
	dalvikBytecodeOperationFloatToDoubleParser,
	dalvikBytecodeOperationDoubleToIntParser,
	dalvikBytecodeOperationDoubleToLongParser,
	dalvikBytecodeOperationDoubleToFloatParser,
	dalvikBytecodeOperationIntToByteParser,
	dalvikBytecodeOperationIntToCharParser,
	dalvikBytecodeOperationIntToShortParser,
]);

setParserName(dalvikBytecodeOperationUnaryOperationParser, 'dalvikBytecodeOperationUnaryOperationParser');

const createDalvikBytecodeOperationIfTest = <T extends string>(operation: T, opcode: number): Parser<{
	operation: T;
	registers: number[];
	branchOffset: number;
}, Uint8Array> => promiseCompose(
	createTupleParser([
		createExactElementParser(opcode),
		createDalvikBytecodeFormat22tParser(),
	]),
	([ _opcode, { registers, branchOffset } ]) => ({
		operation,
		registers,
		branchOffset,
	}),
);

const dalvikBytecodeIfEqualParser = createDalvikBytecodeOperationIfTest('if-eq', 0x32);

type DalvikBytecodeOperationIfEqual = Awaited<ReturnType<typeof dalvikBytecodeIfEqualParser>>;

const dalvikBytecodeIfNotEqualParser = createDalvikBytecodeOperationIfTest('if-neq', 0x33);

type DalvikBytecodeOperationIfNotEqual = Awaited<ReturnType<typeof dalvikBytecodeIfNotEqualParser>>;

const dalvikBytecodeIfLessThanParser = createDalvikBytecodeOperationIfTest('if-lt', 0x34);

type DalvikBytecodeOperationIfLessThan = Awaited<ReturnType<typeof dalvikBytecodeIfLessThanParser>>;

const dalvikBytecodeIfGreaterThanOrEqualToParser = createDalvikBytecodeOperationIfTest('if-ge', 0x35);

type DalvikBytecodeOperationIfGreaterThanOrEqualTo = Awaited<ReturnType<typeof dalvikBytecodeIfGreaterThanOrEqualToParser>>;

const dalvikBytecodeIfGreaterThanParser = createDalvikBytecodeOperationIfTest('if-gt', 0x36);

type DalvikBytecodeOperationIfGreaterThan = Awaited<ReturnType<typeof dalvikBytecodeIfGreaterThanParser>>;

const dalvikBytecodeIfLessThanOrEqualToParser = createDalvikBytecodeOperationIfTest('if-le', 0x37);

type DalvikBytecodeOperationIfLessThanOrEqualTo = Awaited<ReturnType<typeof dalvikBytecodeIfLessThanOrEqualToParser>>;

type DalvikBytecodeOperationIfTest =
	| DalvikBytecodeOperationIfEqual
	| DalvikBytecodeOperationIfNotEqual
	| DalvikBytecodeOperationIfLessThan
	| DalvikBytecodeOperationIfGreaterThanOrEqualTo
	| DalvikBytecodeOperationIfGreaterThan
	| DalvikBytecodeOperationIfLessThanOrEqualTo
;

const dalvikBytecodeOperationIfTestParser: Parser<DalvikBytecodeOperationIfTest, Uint8Array> = createUnionParser([
	dalvikBytecodeIfEqualParser,
	dalvikBytecodeIfNotEqualParser,
	dalvikBytecodeIfLessThanParser,
	dalvikBytecodeIfGreaterThanOrEqualToParser,
	dalvikBytecodeIfGreaterThanParser,
	dalvikBytecodeIfLessThanOrEqualToParser,
]);

setParserName(dalvikBytecodeOperationIfTestParser, 'dalvikBytecodeOperationIfTestParser');

const createDalvikBytecodeOperationIfTestZero = <T extends string>(operation: T, opcode: number): Parser<{
	operation: T;
	registers: number[];
	branchOffset: number;
}, Uint8Array> => promiseCompose(
	createTupleParser([
		createExactElementParser(opcode),
		createDalvikBytecodeFormat21tParser(),
	]),
	([ _opcode, { registers, branchOffset } ]) => ({
		operation,
		registers,
		branchOffset,
	}),
);

const dalvikBytecodeIfEqualZeroParser = createDalvikBytecodeOperationIfTestZero('if-eqz', 0x38);

type DalvikBytecodeOperationIfEqualZero = Awaited<ReturnType<typeof dalvikBytecodeIfEqualZeroParser>>;

const dalvikBytecodeIfNotEqualZeroParser = createDalvikBytecodeOperationIfTestZero('if-nez', 0x39);

type DalvikBytecodeOperationIfNotEqualZero = Awaited<ReturnType<typeof dalvikBytecodeIfNotEqualZeroParser>>;

const dalvikBytecodeIfLessThanZeroParser = createDalvikBytecodeOperationIfTestZero('if-ltz', 0x3a);

type DalvikBytecodeOperationIfLessThanZero = Awaited<ReturnType<typeof dalvikBytecodeIfLessThanZeroParser>>;

const dalvikBytecodeIfGreaterThanOrEqualToZeroParser = createDalvikBytecodeOperationIfTestZero('if-gez', 0x3b);

type DalvikBytecodeOperationIfGreaterThanOrEqualToZero = Awaited<ReturnType<typeof dalvikBytecodeIfGreaterThanOrEqualToZeroParser>>;

const dalvikBytecodeIfGreaterThanZeroParser = createDalvikBytecodeOperationIfTestZero('if-gtz', 0x3c);

type DalvikBytecodeOperationIfGreaterThanZero = Awaited<ReturnType<typeof dalvikBytecodeIfGreaterThanZeroParser>>;

const dalvikBytecodeIfLessThanOrEqualToZeroParser = createDalvikBytecodeOperationIfTestZero('if-lez', 0x3d);

type DalvikBytecodeOperationIfLessThanOrEqualToZero = Awaited<ReturnType<typeof dalvikBytecodeIfLessThanOrEqualToZeroParser>>;

type DalvikBytecodeOperationIfTestZero =
	| DalvikBytecodeOperationIfEqualZero
	| DalvikBytecodeOperationIfNotEqualZero
	| DalvikBytecodeOperationIfLessThanZero
	| DalvikBytecodeOperationIfGreaterThanOrEqualToZero
	| DalvikBytecodeOperationIfGreaterThanZero
	| DalvikBytecodeOperationIfLessThanOrEqualToZero
;

const dalvikBytecodeOperationIfTestZeroParser: Parser<DalvikBytecodeOperationIfTestZero, Uint8Array> = createUnionParser([
	dalvikBytecodeIfEqualZeroParser,
	dalvikBytecodeIfNotEqualZeroParser,
	dalvikBytecodeIfLessThanZeroParser,
	dalvikBytecodeIfGreaterThanOrEqualToZeroParser,
	dalvikBytecodeIfGreaterThanZeroParser,
	dalvikBytecodeIfLessThanOrEqualToZeroParser,
]);

setParserName(dalvikBytecodeOperationIfTestZeroParser, 'dalvikBytecodeOperationIfTestZeroParser');

type DalvikBytecodeOperationConstString = {
	operation: 'const-string';
	stringIndex: IndexIntoStringIds;
	registers: number[];
};

const dalvikBytecodeOperationConstStringParser: Parser<DalvikBytecodeOperationConstString, Uint8Array> = promiseCompose(
	createTupleParser([
		createExactElementParser(0x1a),
		createDalvikBytecodeFormat21cParser({
			isoIndex: isoIndexIntoStringIds,
		}),
	]),
	([ _opcode, { index, registers } ]) => ({
		operation: 'const-string',
		stringIndex: index,
		registers,
	}),
);

setParserName(dalvikBytecodeOperationConstStringParser, 'dalvikBytecodeOperationConstStringParser');

type DalvikBytecodeOperationConstMethodHandle = {
	operation: 'const-method-handle';
	methodIndex: IndexIntoMethodIds;
	registers: number[];
};

const dalvikBytecodeOperationConstMethodHandleParser: Parser<DalvikBytecodeOperationConstMethodHandle, Uint8Array> = promiseCompose(
	createTupleParser([
		createExactElementParser(0xfe),
		createDalvikBytecodeFormat21cParser({
			isoIndex: isoIndexIntoMethodIds,
		}),
	]),
	([ _opcode, { index, registers } ]) => ({
		operation: 'const-method-handle',
		methodIndex: index,
		registers,
	}),
);

setParserName(dalvikBytecodeOperationConstMethodHandleParser, 'dalvikBytecodeOperationConstMethodHandleParser');

type DalvikBytecodeOperationNewInstance = {
	operation: 'new-instance';
	typeIndex: IndexIntoTypeIds;
	registers: number[];
};

const dalvikBytecodeOperationNewInstanceParser: Parser<DalvikBytecodeOperationNewInstance, Uint8Array> = promiseCompose(
	createTupleParser([
		createExactElementParser(0x22),
		createDalvikBytecodeFormat21cParser({
			isoIndex: isoIndexIntoTypeIds,
		}),
	]),
	([ _opcode, { index, registers } ]) => ({
		operation: 'new-instance',
		typeIndex: index,
		registers,
	}),
);

setParserName(dalvikBytecodeOperationNewInstanceParser, 'dalvikBytecodeOperationNewInstanceParser');

type DalvikBytecodeOperationNewArray = {
	operation: 'new-array';
	typeIndex: IndexIntoTypeIds;
	registers: number[];
};

const dalvikBytecodeOperationNewArrayParser: Parser<DalvikBytecodeOperationNewArray, Uint8Array> = promiseCompose(
	createTupleParser([
		createExactElementParser(0x23),
		createDalvikBytecodeFormat22cParser({
			isoIndex: isoIndexIntoTypeIds,
		}),
	]),
	([ _opcode, { index, registers } ]) => ({
		operation: 'new-array',
		typeIndex: index,
		registers,
	}),
);

setParserName(dalvikBytecodeOperationNewArrayParser, 'dalvikBytecodeOperationNewArrayParser');

type DalvikBytecodeOperationCheckCast = {
	operation: 'check-cast';
	typeIndex: IndexIntoTypeIds;
	registers: number[];
};

const dalvikBytecodeOperationCheckCastParser: Parser<DalvikBytecodeOperationCheckCast, Uint8Array> = promiseCompose(
	createTupleParser([
		createExactElementParser(0x1f),
		createDalvikBytecodeFormat21cParser({
			isoIndex: isoIndexIntoTypeIds,
		}),
	]),
	([ _opcode, { index, registers } ]) => ({
		operation: 'check-cast',
		typeIndex: index,
		registers,
	}),
);

setParserName(dalvikBytecodeOperationCheckCastParser, 'dalvikBytecodeOperationCheckCastParser');

type DalvikBytecodeOperationConstClass = {
	operation: 'const-class';
	typeIndex: IndexIntoTypeIds;
	registers: number[];
};

const dalvikBytecodeOperationConstClassParser: Parser<DalvikBytecodeOperationConstClass, Uint8Array> = promiseCompose(
	createTupleParser([
		createExactElementParser(0x1c),
		createDalvikBytecodeFormat21cParser({
			isoIndex: isoIndexIntoTypeIds,
		}),
	]),
	([ _opcode, { index, registers } ]) => ({
		operation: 'const-class',
		typeIndex: index,
		registers,
	}),
);

setParserName(dalvikBytecodeOperationConstClassParser, 'dalvikBytecodeOperationConstClassParser');

type DalvikBytecodeOperationReturnVoid = {
	operation: 'return-void';
};

const dalvikBytecodeOperationReturnVoidParser: Parser<DalvikBytecodeOperationReturnVoid, Uint8Array> = promiseCompose(
	createTupleParser([
		createExactElementParser(0x0e),
		dalvikBytecodeFormat10xParser,
	]),
	() => ({
		operation: 'return-void',
	}),
);

setParserName(dalvikBytecodeOperationReturnVoidParser, 'dalvikBytecodeOperationReturnVoidParser');

const createDalvikBytecodeMoveResult1Parser = <T extends string>(operation: T, opcode: number): Parser<{
	operation: T;
	registers: number[];
}, Uint8Array> => promiseCompose(
	createTupleParser([
		createExactElementParser(opcode),
		dalvikBytecodeFormat11xParser,
	]),
	([ _opcode, { registers } ]) => ({
		operation,
		registers,
	}),
);

const dalvikBytecodeMoveResultParser = createDalvikBytecodeMoveResult1Parser('move-result', 0x0a);

type DalvikBytecodeOperationMoveResult = Awaited<ReturnType<typeof dalvikBytecodeMoveResultParser>>;

const dalvikBytecodeMoveResultWideParser = createDalvikBytecodeMoveResult1Parser('move-result-wide', 0x0b);

type DalvikBytecodeOperationMoveResultWide = Awaited<ReturnType<typeof dalvikBytecodeMoveResultWideParser>>;

const dalvikBytecodeMoveResultObjectParser = createDalvikBytecodeMoveResult1Parser('move-result-object', 0x0c);

type DalvikBytecodeOperationMoveResultObject = Awaited<ReturnType<typeof dalvikBytecodeMoveResultObjectParser>>;

const dalvikBytecodeMoveExceptionParser = createDalvikBytecodeMoveResult1Parser('move-exception', 0x0d);

type DalvikBytecodeOperationMoveException = Awaited<ReturnType<typeof dalvikBytecodeMoveExceptionParser>>;

type DalvikBytecodeOperationMoveResult1 =
	| DalvikBytecodeOperationMoveResult
	| DalvikBytecodeOperationMoveResultWide
	| DalvikBytecodeOperationMoveResultObject
	| DalvikBytecodeOperationMoveException
;

const dalvikBytecodeOperationMoveResult1Parser: Parser<DalvikBytecodeOperationMoveResult1, Uint8Array> = createUnionParser([
	dalvikBytecodeMoveResultParser,
	dalvikBytecodeMoveResultWideParser,
	dalvikBytecodeMoveResultObjectParser,
	dalvikBytecodeMoveExceptionParser,
]);

setParserName(dalvikBytecodeOperationMoveResult1Parser, 'dalvikBytecodeOperationMoveResult1Parser');

type DalvikBytecodeOperationMove = {
	operation: 'move';
	registers: number[];
};

const dalvikBytecodeOperationMoveParser: Parser<DalvikBytecodeOperationMove, Uint8Array> = promiseCompose(
	createTupleParser([
		createExactElementParser(0x01),
		dalvikBytecodeFormat12xParser,
	]),
	([ _opcode, { registers } ]) => ({
		operation: 'move',
		registers,
	}),
);

type DalvikBytecodeOperationMoveWide = {
	operation: 'move-wide';
	registers: number[];
};

const dalvikBytecodeOperationMoveWideParser: Parser<DalvikBytecodeOperationMoveWide, Uint8Array> = promiseCompose(
	createTupleParser([
		createExactElementParser(0x04),
		dalvikBytecodeFormat12xParser,
	]),
	([ _opcode, { registers } ]) => ({
		operation: 'move-wide',
		registers,
	}),
);

type DalvikBytecodeOperationMoveObject = {
	operation: 'move-object';
	registers: number[];
};

const dalvikBytecodeOperationMoveObjectParser: Parser<DalvikBytecodeOperationMoveObject, Uint8Array> = promiseCompose(
	createTupleParser([
		createExactElementParser(0x07),
		dalvikBytecodeFormat12xParser,
	]),
	([ _opcode, { registers } ]) => ({
		operation: 'move-object',
		registers,
	}),
);

type DalvikBytecodeOperationMoveFrom16 = {
	operation: 'move/from16';
	registers: number[];
};

const dalvikBytecodeOperationMoveFrom16Parser: Parser<DalvikBytecodeOperationMoveFrom16, Uint8Array> = promiseCompose(
	createTupleParser([
		createExactElementParser(0x02),
		dalvikBytecodeFormat22xParser,
	]),
	([ _opcode, { registers } ]) => ({
		operation: 'move/from16',
		registers,
	}),
);

setParserName(dalvikBytecodeOperationMoveFrom16Parser, 'dalvikBytecodeOperationMoveFrom16Parser');

type DalvikBytecodeOperationMoveWideFrom16 = {
	operation: 'move-wide/from16';
	registers: number[];
};

const dalvikBytecodeOperationMoveWideFrom16Parser: Parser<DalvikBytecodeOperationMoveWideFrom16, Uint8Array> = promiseCompose(
	createTupleParser([
		createExactElementParser(0x05),
		dalvikBytecodeFormat22xParser,
	]),
	([ _opcode, { registers } ]) => ({
		operation: 'move-wide/from16',
		registers,
	}),
);

setParserName(dalvikBytecodeOperationMoveWideFrom16Parser, 'dalvikBytecodeOperationMoveWideFrom16Parser');

type DalvikBytecodeOperationMoveObjectFrom16 = {
	operation: 'move-object/from16';
	registers: number[];
};

const dalvikBytecodeOperationMoveObjectFrom16Parser: Parser<DalvikBytecodeOperationMoveObjectFrom16, Uint8Array> = promiseCompose(
	createTupleParser([
		createExactElementParser(0x08),
		dalvikBytecodeFormat22xParser,
	]),
	([ _opcode, { registers } ]) => ({
		operation: 'move-object/from16',
		registers,
	}),
);

setParserName(dalvikBytecodeOperationMoveObjectFrom16Parser, 'dalvikBytecodeOperationMoveObjectFrom16Parser');

type DalvikBytecodeOperationMoveWide16 = {
	operation: 'move-wide/16';
	registers: number[];
};

const dalvikBytecodeOperationMoveWide16Parser: Parser<DalvikBytecodeOperationMoveWide16, Uint8Array> = promiseCompose(
	createTupleParser([
		createExactElementParser(0x06),
		dalvikBytecodeFormat32xParser,
	]),
	([ _opcode, { registers } ]) => ({
		operation: 'move-wide/16',
		registers,
	}),
);

setParserName(dalvikBytecodeOperationMoveWide16Parser, 'dalvikBytecodeOperationMoveWide16Parser');

const createDalvikBytecodeOperationReturn1Parser = createDalvikBytecodeMoveResult1Parser;

const dalvikBytecodeOperationReturnParser = createDalvikBytecodeOperationReturn1Parser('return', 0x0f);

type DalvikBytecodeOperationReturn = Awaited<ReturnType<typeof dalvikBytecodeOperationReturnParser>>;

const dalvikBytecodeOperationReturnWideParser = createDalvikBytecodeOperationReturn1Parser('return-wide', 0x10);

type DalvikBytecodeOperationReturnWide = Awaited<ReturnType<typeof dalvikBytecodeOperationReturnWideParser>>;

const dalvikBytecodeOperationReturnObjectParser = createDalvikBytecodeOperationReturn1Parser('return-object', 0x11);

type DalvikBytecodeOperationReturnObject = Awaited<ReturnType<typeof dalvikBytecodeOperationReturnObjectParser>>;

type DalvikBytecodeOperationReturn1 =
	| DalvikBytecodeOperationReturn
	| DalvikBytecodeOperationReturnWide
	| DalvikBytecodeOperationReturnObject
;

const dalvikBytecodeOperationReturn1Parser: Parser<DalvikBytecodeOperationReturn1, Uint8Array> = createUnionParser([
	dalvikBytecodeOperationReturnParser,
	dalvikBytecodeOperationReturnWideParser,
	dalvikBytecodeOperationReturnObjectParser,
]);

setParserName(dalvikBytecodeOperationReturn1Parser, 'dalvikBytecodeOperationReturn1Parser');

type DalvikBytecodeOperationConst4 = {
	operation: 'const/4';
	registers: number[];
	value: number;
};

const dalvikBytecodeOperationConst4Parser: Parser<DalvikBytecodeOperationConst4, Uint8Array> = promiseCompose(
	createTupleParser([
		createExactElementParser(0x12),
		nibblesParser,
	]),
	([
		_opcode,
		[
			register0,
			value,
		],
	]) => ({
		operation: 'const/4',
		registers: [
			register0,
		],
		value: value << 28 >> 28,
	}),
);

setParserName(dalvikBytecodeOperationConst4Parser, 'dalvikBytecodeOperationConst4Parser');

type DalvikBytecodeOperationConst16 = {
	operation: 'const/16';
	registers: number[];
	value: number;
};

const dalvikBytecodeOperationConst16Parser: Parser<DalvikBytecodeOperationConst16, Uint8Array> = promiseCompose(
	createTupleParser([
		createExactElementParser(0x13),
		createDalvikBytecodeFormat21sParser(),
	]),
	([ _opcode, { registers, value } ]) => ({
		operation: 'const/16',
		registers,
		value: value << 16 >> 16,
	}),
);

setParserName(dalvikBytecodeOperationConst16Parser, 'dalvikBytecodeOperationConst16Parser');

type DalvikBytecodeOperationConstHigh16 = {
	operation: 'const/high16';
	registers: number[];
	value: number;
};

const dalvikBytecodeOperationConstHigh16Parser: Parser<DalvikBytecodeOperationConstHigh16, Uint8Array> = promiseCompose(
	createTupleParser([
		createExactElementParser(0x15),
		createDalvikBytecodeFormat21sParser(),
	]),
	([ _opcode, { registers, value } ]) => ({
		operation: 'const/high16',
		registers,
		value: value << 16,
	}),
);

setParserName(dalvikBytecodeOperationConstHigh16Parser, 'dalvikBytecodeOperationConstHigh16Parser');

type DalvikBytecodeOperationConstWide16 = {
	operation: 'const-wide/16';
	registers: number[];
	value: bigint;
};

const dalvikBytecodeOperationConstWide16Parser: Parser<DalvikBytecodeOperationConstWide16, Uint8Array> = promiseCompose(
	createTupleParser([
		createExactElementParser(0x16),
		createDalvikBytecodeFormat21sParser(),
	]),
	([ _opcode, { registers, value } ]) => ({
		operation: 'const-wide/16',
		registers,
		value: BigInt(value) << 48n >> 48n,
	}),
);

setParserName(dalvikBytecodeOperationConstWide16Parser, 'dalvikBytecodeOperationConstWide16Parser');

type DalvikBytecodeOperationConst = {
	operation: 'const';
	registers: number[];
	value: number;
};

const dalvikBytecodeOperationConstParser: Parser<DalvikBytecodeOperationConst, Uint8Array> = promiseCompose(
	createTupleParser([
		createExactElementParser(0x14),
		dalvikBytecodeFormat31iParser,
	]),
	([ _opcode, { registers, value } ]) => ({
		operation: 'const',
		registers,
		value,
	}),
);

setParserName(dalvikBytecodeOperationConstParser, 'dalvikBytecodeOperationConstParser');

type DalvikBytecodeOperationThrow = {
	operation: 'throw';
	registers: number[];
};

const dalvikBytecodeOperationThrowParser: Parser<DalvikBytecodeOperationThrow, Uint8Array> = promiseCompose(
	createTupleParser([
		createExactElementParser(0x27),
		dalvikBytecodeFormat11xParser,
	]),
	([ _opcode, { registers } ]) => ({
		operation: 'throw',
		registers,
	}),
);

setParserName(dalvikBytecodeOperationThrowParser, 'dalvikBytecodeOperationThrowParser');

const createDalvikBytecodeOperationCompare = <T extends string>(operation: T, opcode: number): Parser<{
	operation: T;
	registers: number[];
}, Uint8Array> => promiseCompose(
	createTupleParser([
		createExactElementParser(opcode),
		dalvikBytecodeFormat23xParser,
	]),
	([ _opcode, { registers } ]) => ({
		operation,
		registers,
	}),
);

const dalvikBytecodeOperationCompareFloatWithLessThanBiasParser = createDalvikBytecodeOperationCompare('cmpl-float', 0x2d);

type DalvikBytecodeOperationCompareFloatWithLessThanBias = Awaited<ReturnType<typeof dalvikBytecodeOperationCompareFloatWithLessThanBiasParser>>;

const dalvikBytecodeOperationCompareFloatWithGreaterThanBiasParser = createDalvikBytecodeOperationCompare('cmpg-float', 0x2e);

type DalvikBytecodeOperationCompareFloatWithGreaterThanBias = Awaited<ReturnType<typeof dalvikBytecodeOperationCompareFloatWithGreaterThanBiasParser>>;

const dalvikBytecodeOperationCompareDoubleWithLessThanBiasParser = createDalvikBytecodeOperationCompare('cmpl-double', 0x2f);

type DalvikBytecodeOperationCompareDoubleWithLessThanBias = Awaited<ReturnType<typeof dalvikBytecodeOperationCompareDoubleWithLessThanBiasParser>>;

const dalvikBytecodeOperationCompareDoubleWithGreaterThanBiasParser = createDalvikBytecodeOperationCompare('cmpg-double', 0x30);

type DalvikBytecodeOperationCompareDoubleWithGreaterThanBias = Awaited<ReturnType<typeof dalvikBytecodeOperationCompareDoubleWithGreaterThanBiasParser>>;

const dalvikBytecodeOperationCompareLongParser = createDalvikBytecodeOperationCompare('cmp-long', 0x31);

type DalvikBytecodeOperationCompareLong = Awaited<ReturnType<typeof dalvikBytecodeOperationCompareLongParser>>;

type DalvikBytecodeOperationCompare =
	| DalvikBytecodeOperationCompareFloatWithLessThanBias
	| DalvikBytecodeOperationCompareFloatWithGreaterThanBias
	| DalvikBytecodeOperationCompareDoubleWithLessThanBias
	| DalvikBytecodeOperationCompareDoubleWithGreaterThanBias
	| DalvikBytecodeOperationCompareLong
;

const dalvikBytecodeOperationCompareParser: Parser<DalvikBytecodeOperationCompare, Uint8Array> = createUnionParser([
	dalvikBytecodeOperationCompareFloatWithLessThanBiasParser,
	dalvikBytecodeOperationCompareFloatWithGreaterThanBiasParser,
	dalvikBytecodeOperationCompareDoubleWithLessThanBiasParser,
	dalvikBytecodeOperationCompareDoubleWithGreaterThanBiasParser,
	dalvikBytecodeOperationCompareLongParser,
]);

setParserName(dalvikBytecodeOperationCompareParser, 'dalvikBytecodeOperationCompareParser');

export type DalvikBytecodeOperation =
	| DalvikBytecodeOperationNoOperation

	| DalvikBytecodeOperationInvoke
	| DalvikBytecodeOperationNewInstance

	| DalvikBytecodeOperationReturnVoid

	| DalvikBytecodeOperationMoveResult1
;

export const dalvikBytecodeOperationCompanion = {
	getRegisters(operation: DalvikBytecodeOperation): number[] {
		if (operation && typeof operation === 'object' && 'registers' in operation) {
			return operation.registers;
		}

		return [];
	},
};

const dalvikBytecodeOperationParser: Parser<DalvikBytecodeOperation | undefined, Uint8Array> = promiseCompose(
	createTupleParser([
		() => {},
		//createDebugLogInputParser(),
		createUnionParser<DalvikBytecodeOperation, Uint8Array>([
			dalvikBytecodeOperationUnusedParser,

			dalvikBytecodeOperationNoOperationParser,

			dalvikBytecodeOperationInvokeParser,
			dalvikBytecodeOperationInvokeRangeParser,

			dalvikBytecodeOperationNewInstanceParser,
			dalvikBytecodeOperationNewArrayParser,
			dalvikBytecodeOperationCheckCastParser,
			dalvikBytecodeOperationInstanceOfParser,

			dalvikBytecodeOperationArrayElementParser,
			dalvikBytecodeOperationInstanceFieldParser,
			dalvikBytecodeOperationStaticFieldParser,

			dalvikBytecodeOperationConstStringParser,
			dalvikBytecodeOperationConstMethodHandleParser,
			dalvikBytecodeOperationConstClassParser,

			dalvikBytecodeOperationReturnVoidParser,
			dalvikBytecodeOperationReturn1Parser,

			dalvikBytecodeOperationThrowParser,

			dalvikBytecodeOperationGotoParser,
			dalvikBytecodeOperationGoto16Parser,

			dalvikBytecodeOperationMoveResult1Parser,
			dalvikBytecodeOperationMoveParser,
			dalvikBytecodeOperationMoveWideParser,
			dalvikBytecodeOperationMoveObjectParser,
			dalvikBytecodeOperationMoveFrom16Parser,
			dalvikBytecodeOperationMoveWideFrom16Parser,
			dalvikBytecodeOperationMoveObjectFrom16Parser,
			dalvikBytecodeOperationMoveWide16Parser,

			dalvikBytecodeOperationConst4Parser,
			dalvikBytecodeOperationConst16Parser,
			dalvikBytecodeOperationConstHigh16Parser,
			dalvikBytecodeOperationConstWide16Parser,
			dalvikBytecodeOperationConstParser,

			dalvikBytecodeOperationCompareParser,

			dalvikBytecodeOperationIfTestParser,
			dalvikBytecodeOperationIfTestZeroParser,

			dalvikBytecodeOperationBinaryOperationParser,
			dalvikBytecodeOperationBinaryOperationLiteral8Parser,
			dalvikBytecodeOperationBinaryOperationLiteral16Parser,
			dalvikBytecodeOperationBinaryOperationInPlaceParser,
			dalvikBytecodeOperationUnaryOperationParser,
		]),
	]),
	([
		_debug,
		operation,
	]) => {
		// console.log(operation);
		return operation;
	},
);

setParserName(dalvikBytecodeOperationParser, 'dalvikBytecodeOperationParser');

export type DalvikBytecode = DalvikBytecodeOperation[];

const dalvikBytecodeParser: Parser<DalvikBytecode, Uint8Array> = promiseCompose(
	createArrayParser(
		dalvikBytecodeOperationParser,
	),
	operations => operations.filter((operation): operation is DalvikBytecodeOperation => operation !== undefined),
);

export const createDalvikBytecodeParser = (size: number): Parser<DalvikBytecode, Uint8Array> => createSliceBoundedParser(dalvikBytecodeParser, size, true);

type ResolvedDalvikBytecodeOperation<T extends DalvikBytecodeOperation> = T extends { stringIndex: IndexIntoFieldIds }
	? Omit<T, 'stringIndex'> & { string: string }
	: T extends { typeIndex: IndexIntoTypeIds }
	? Omit<T, 'typeIndex'> & { type: string }
	: T extends { methodIndex: IndexIntoMethodIds }
	? Omit<T, 'methodIndex'> & { method: DalvikExecutableMethod }
	: T extends { fieldIndex: IndexIntoFieldIds }
	? Omit<T, 'fieldIndex'> & { field: DalvikExecutableField }
	: T;

export type DalvikBytecodeOperationResolvers = {
	resolveIndexIntoStringIds: (index: IndexIntoStringIds) => string;
	resolveIndexIntoTypeIds: (index: IndexIntoTypeIds) => string;
	resolveIndexIntoMethodIds: (index: IndexIntoMethodIds) => DalvikExecutableMethod;
	resolveIndexIntoFieldIds: (index: IndexIntoFieldIds) => DalvikExecutableField;
};

export function resolveDalvikBytecodeOperation<T extends DalvikBytecodeOperation>(operation: T, {
	resolveIndexIntoStringIds,
	resolveIndexIntoTypeIds,
	resolveIndexIntoMethodIds,
	resolveIndexIntoFieldIds,
}: DalvikBytecodeOperationResolvers): ResolvedDalvikBytecodeOperation<T> {
	if (operation && typeof operation === 'object' && 'stringIndex' in operation) {
		const { stringIndex, ...rest } = operation;

		return {
			...rest,
			string: resolveIndexIntoStringIds(stringIndex as IndexIntoStringIds),
		} as ResolvedDalvikBytecodeOperation<T>;
	}

	if (operation && typeof operation === 'object' && 'typeIndex' in operation) {
		const { typeIndex, ...rest } = operation;

		return {
			...rest,
			type: resolveIndexIntoTypeIds(typeIndex as IndexIntoTypeIds),
		} as ResolvedDalvikBytecodeOperation<T>;
	}

	if (operation && typeof operation === 'object' && 'methodIndex' in operation) {
		const { methodIndex, ...rest } = operation;

		return {
			...rest,
			method: resolveIndexIntoMethodIds(methodIndex as IndexIntoMethodIds),
		} as ResolvedDalvikBytecodeOperation<T>;
	}

	if (operation && typeof operation === 'object' && 'fieldIndex' in operation) {
		const { fieldIndex, ...rest } = operation;

		return {
			...rest,
			field: resolveIndexIntoFieldIds(fieldIndex as IndexIntoFieldIds),
		} as ResolvedDalvikBytecodeOperation<T>;
	}

	return operation as ResolvedDalvikBytecodeOperation<T>;
}
