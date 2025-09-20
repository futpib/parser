import { Iso } from "monocle-ts";
import { byteParser, intParser, longParser, shortParser, ubyteParser, ushortParser } from "../dalvikExecutableParser/typeParsers.js";
import { createElementParser } from "../elementParser.js";
import { Parser, setParserName } from "../parser.js";
import { promiseCompose } from "../promiseCompose.js";
import { createTupleParser } from "../tupleParser.js";

// https://source.android.com/docs/core/runtime/instruction-formats

export const nibblesParser: Parser<[ number, number ], Uint8Array> = promiseCompose(
	createElementParser(),
	(byte) => [
		byte >> 4,
		byte & 0b1111,
	],
);

setParserName(nibblesParser, 'nibblesParser');

type DalvikBytecodeFormat10t = {
	branchOffset: number;
};

export const dalvikBytecodeFormat10tParser: Parser<DalvikBytecodeFormat10t, Uint8Array> = promiseCompose(
	byteParser,
	(branchOffset) => ({
		branchOffset,
	}),
);

type DalvikBytecodeFormat10x = void;

export const dalvikBytecodeFormat10xParser: Parser<DalvikBytecodeFormat10x, Uint8Array> = promiseCompose(
	createElementParser(),
	() => undefined,
);

type DalvikBytecodeFormat11x = {
	registers: number[];
};

export const dalvikBytecodeFormat11xParser: Parser<DalvikBytecodeFormat11x, Uint8Array> = promiseCompose(
	ubyteParser,
	register0 => ({
		registers: [
			register0,
		],
	}),
);

type DalvikBytecodeFormat12x = {
	registers: number[];
};

export const dalvikBytecodeFormat12xParser: Parser<DalvikBytecodeFormat12x, Uint8Array> = promiseCompose(
	nibblesParser,
	([
		register0,
		register1,
	]) => ({
		registers: [
			register0,
			register1,
		],
	}),
);

type DalvikBytecodeFormat20t = {
	branchOffset: number;
};

export const dalvikBytecodeFormat20tParser: Parser<DalvikBytecodeFormat20t, Uint8Array> = promiseCompose(
	createTupleParser([
		ubyteParser,
		shortParser,
	]),
	([
		_zero,
		branchOffset,
	]) => ({
		branchOffset,
	}),
);

type DalvikBytecodeFormat21c<Index> = {
	index: Index;
	registers: number[];
};

export const createDalvikBytecodeFormat21cParser = <Index>({
	isoIndex,
}: {
	isoIndex: Iso<Index, number>;
}): Parser<DalvikBytecodeFormat21c<Index>, Uint8Array> => promiseCompose(
	createTupleParser([
		ubyteParser,
		ushortParser,
	]),
	([
		register0,
		index,
	]) => ({
		index: isoIndex.wrap(index),
		registers: [
			register0,
		],
	}),
);

type DalvikBytecodeFormat21h = {
	value: number;
	registers: number[];
};

export const dalvikBytecodeFormat21hParser: Parser<DalvikBytecodeFormat21h, Uint8Array> = promiseCompose(
	createTupleParser([
		ubyteParser,
		ushortParser,
	]),
	([
		register0,
		value,
	]) => ({
		value,
		registers: [
			register0,
		],
	}),
);

type DalvikBytecodeFormat21t= {
	branchOffset: number;
	registers: number[];
};

export const createDalvikBytecodeFormat21tParser = (): Parser<DalvikBytecodeFormat21t, Uint8Array> => promiseCompose(
	createTupleParser([
		ubyteParser,
		shortParser,
	]),
	([
		register0,
		branchOffset,
	]) => ({
		branchOffset,
		registers: [
			register0,
		],
	}),
);

type DalvikBytecodeFormat21s= {
	registers: number[];
	value: number;
};

export const createDalvikBytecodeFormat21sParser = (): Parser<DalvikBytecodeFormat21s, Uint8Array> => promiseCompose(
	createTupleParser([
		ubyteParser,
		shortParser,
	]),
	([
		register0,
		value,
	]) => ({
		value,
		registers: [
			register0,
		],
	}),
);

type DalvikBytecodeFormat22b = {
	registers: number[];
	value: number;
};

export const createDalvikBytecodeFormat22bParser = (): Parser<DalvikBytecodeFormat22b, Uint8Array> => promiseCompose(
	createTupleParser([
		ubyteParser,
		ubyteParser,
		byteParser,
	]),
	([
		register0,
		register1,
		value,
	]) => ({
		value,
		registers: [
			register0,
			register1,
		],
	}),
);

type DalvikBytecodeFormat22c<Index> = {
	registers: number[];
	index: Index;
};

export const createDalvikBytecodeFormat22cParser = <Index>({
	isoIndex,
}: {
	isoIndex: Iso<Index, number>;
}): Parser<DalvikBytecodeFormat22c<Index>, Uint8Array> => promiseCompose(
	createTupleParser([
		nibblesParser,
		ushortParser,
	]),
	([
		[
			register1,
			register0,
		],
		index,
	]) => ({
		index: isoIndex.wrap(index),
		registers: [
			register0,
			register1,
		],
	}),
);

type DalvikBytecodeFormat22s = {
	value: number;
	registers: number[];
};

export const createDalvikBytecodeFormat22sParser = (): Parser<DalvikBytecodeFormat22s, Uint8Array> => promiseCompose(
	createTupleParser([
		nibblesParser,
		shortParser,
	]),
	([
		[
			register0,
			register1,
		],
		value,
	]) => ({
		value,
		registers: [
			register0,
			register1,
		],
	}),
);

type DalvikBytecodeFormat22t = {
	branchOffset: number;
	registers: number[];
};

export const createDalvikBytecodeFormat22tParser = (): Parser<DalvikBytecodeFormat22t, Uint8Array> => promiseCompose(
	createTupleParser([
		nibblesParser,
		shortParser,
	]),
	([
		[
			register0,
			register1,
		],
		branchOffset,
	]) => ({
		branchOffset,
		registers: [
			register0,
			register1,
		],
	}),
);

type DalvikBytecodeFormat22x = {
	registers: number[];
};

export const dalvikBytecodeFormat22xParser: Parser<DalvikBytecodeFormat22x, Uint8Array> = promiseCompose(
	createTupleParser([
		ubyteParser,
		ushortParser,
	]),
	([
		register0,
		register1,
	]) => ({
		registers: [
			register0,
			register1,
		],
	}),
);

type DalvikBytecodeFormat23x = {
	registers: number[];
}

export const dalvikBytecodeFormat23xParser: Parser<DalvikBytecodeFormat23x, Uint8Array> = promiseCompose(
	createTupleParser([
		ubyteParser,
		ubyteParser,
		ubyteParser,
	]),
	([
		register0,
		register1,
		register2,
	]) => ({
		registers: [
			register0,
			register1,
			register2,
		],
	}),
);

type DalvikBytecodeFormat30t = {
	branchOffset: number;
};

export const dalvikBytecodeFormat30tParser: Parser<DalvikBytecodeFormat30t, Uint8Array> = promiseCompose(
	intParser,
	(branchOffset) => ({
		branchOffset,
	}),
);

type DalvikBytecodeFormat31i = {
	value: number;
	registers: number[];
};

export const dalvikBytecodeFormat31iParser: Parser<DalvikBytecodeFormat31i, Uint8Array> = promiseCompose(
	createTupleParser([
		ubyteParser,
		intParser,
	]),
	([
		register0,
		value,
	]) => ({
		value,
		registers: [
			register0,
		],
	}),
);

type DalvikBytecodeFormat31t = {
	branchOffset: number;
	registers: number[];
};

export const dalvikBytecodeFormat31tParser: Parser<DalvikBytecodeFormat31t, Uint8Array> = promiseCompose(
	createTupleParser([
		ubyteParser,
		intParser,
	]),
	([
		register0,
		branchOffset,
	]) => ({
		branchOffset,
		registers: [
			register0,
		],
	}),
);

type DalvikBytecodeFormat32x = {
	registers: number[];
};

export const dalvikBytecodeFormat32xParser: Parser<DalvikBytecodeFormat32x, Uint8Array> = promiseCompose(
	createTupleParser([
		ushortParser,
		ushortParser,
	]),
	([
		register0,
		register1,
	]) => ({
		registers: [
			register0,
			register1,
		],
	}),
);

type DalvikBytecodeFormat35c<Index> = {
	index: Index;
	registers: number[];
};

export const createDalvikBytecodeFormat35cParser = <Index>({
	isoIndex,
}: {
	isoIndex: Iso<Index, number>;
}): Parser<DalvikBytecodeFormat35c<Index>, Uint8Array> => promiseCompose(
	createTupleParser([
		nibblesParser,
		ushortParser,
		nibblesParser,
		nibblesParser,
	]),
	([
		[
			registerCount,
			register4,
		],
		index,
		[
			register1,
			register0,
		],
		[
			register3,
			register2,
		],
	]) => ({
		index: isoIndex.wrap(index),
		registers: Object.assign([
			register0,
			register1,
			register2,
			register3,
			register4,
		], {
			length: registerCount,
		}),
	}),
);

type DalvikBytecodeFormat3rc<Index> = {
	index: Index;
	registers: number[];
};

export const createDalvikBytecodeFormat3rcParser = <Index>({
	isoIndex,
}: {
	isoIndex: Iso<Index, number>;
}): Parser<DalvikBytecodeFormat3rc<Index>, Uint8Array> => promiseCompose(
	createTupleParser([
		ubyteParser,
		ushortParser,
		ushortParser,
	]),
	([
		registerCount,
		index,
		firstRegister,
	]) => ({
		index: isoIndex.wrap(index),
		registers: Array.from({ length: registerCount }, (_, index) => firstRegister + index),
	}),
);
