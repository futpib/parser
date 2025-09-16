import { createElementParser } from "../elementParser.js";
import { createFixedLengthSequenceParser } from "../fixedLengthSequenceParser.js";
import { uleb128NumberParser } from "../leb128Parser.js";
import { Parser } from "../parser.js";
import { parserCreatorCompose } from "../parserCreatorCompose.js";
import { promiseCompose } from "../promiseCompose.js";

export const uleb128p1NumberParser: Parser<number, Uint8Array> = async (parserContext) => {
	const value = await uleb128NumberParser(parserContext);
	return value - 1;
}

export const ubyteParser: Parser<number, Uint8Array> = createElementParser();

export const byteParser: Parser<number, Uint8Array> = promiseCompose(
	ubyteParser,
	(ubyte) => ubyte > 127 ? ubyte - 256 : ubyte,
);

export const shortParser: Parser<number, Uint8Array> = promiseCompose(
	createFixedLengthSequenceParser<Uint8Array>(2),
	(uint8Array) => {
		const buffer = Buffer.from(uint8Array);
		return buffer.readInt16LE(0);
	},
);

export const ushortParser: Parser<number, Uint8Array> = promiseCompose(
	createFixedLengthSequenceParser<Uint8Array>(2),
	(uint8Array) => {
		const buffer = Buffer.from(uint8Array);
		return buffer.readUInt16LE(0);
	},
);

export const createExactUshortParser = (expectedValue: number): Parser<number, Uint8Array> => parserCreatorCompose(
	() => ushortParser,
	ushortValue => async parserContext => {
		parserContext.invariant(ushortValue === expectedValue, `Expected ushort value ${expectedValue}, got ${ushortValue}`);
		return ushortValue;
	},
)();

export const intParser: Parser<number, Uint8Array> = promiseCompose(
	createFixedLengthSequenceParser<Uint8Array>(4),
	(uint8Array) => {
		const buffer = Buffer.from(uint8Array);
		return buffer.readInt32LE(0);
	},
);

export const uintParser: Parser<number, Uint8Array> = promiseCompose(
	createFixedLengthSequenceParser<Uint8Array>(4),
	(uint8Array) => {
		const buffer = Buffer.from(uint8Array);
		return buffer.readUInt32LE(0);
	},
);

export const longParser: Parser<bigint, Uint8Array> = promiseCompose(
	createFixedLengthSequenceParser<Uint8Array>(8),
	(uint8Array) => {
		const buffer = Buffer.from(uint8Array);
		return buffer.readBigInt64LE(0);
	},
);

export const ulongParser: Parser<bigint, Uint8Array> = promiseCompose(
	createFixedLengthSequenceParser<Uint8Array>(8),
	(uint8Array) => {
		const buffer = Buffer.from(uint8Array);
		return buffer.readBigUInt64LE(0);
	},
);
