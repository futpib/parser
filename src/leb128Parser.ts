import { type Parser } from './parser.js';

export const uleb128Parser: Parser<bigint, Uint8Array> = async parserContext => {
	let leastSignificantValueBitIndex = 0n;
	let value = 0n;

	while (true) {
		const byte = await parserContext.read(0);
		const byteValue = BigInt(byte & 0b0111_1111);
		const byteNotLast = BigInt(byte & 0b1000_0000);

		value |= byteValue << leastSignificantValueBitIndex;

		if (byteNotLast) {
			leastSignificantValueBitIndex += 7n;
			continue;
		}

		break;
	}

	return value;
};

export const sleb128Parser: Parser<bigint, Uint8Array> = async parserContext => {
	let value = 0n;
	let leastSignificantValueBitIndex = 0n;

	while (true) {
		const byte = await parserContext.read(0);
		const byteValue = BigInt(byte & 0b0111_1111);
		const byteNotLast = BigInt(byte & 0b1000_0000);

		value |= byteValue << leastSignificantValueBitIndex;
		leastSignificantValueBitIndex += 7n;

		if (byteNotLast) {
			continue;
		}

		const mostSignificantInputBit = byte & 0b0100_0000;

		if (mostSignificantInputBit) {
			value |= (~0n << leastSignificantValueBitIndex);
		}

		break;
	}

	return value;
};

export const uleb128NumberParser: Parser<number, Uint8Array> = async parserContext => {
	const value = await uleb128Parser(parserContext);

	parserContext.invariant(
		Number(value) <= Number.MAX_SAFE_INTEGER,
		'Value is too large to be represented as a number: %s',
		value,
	);

	return Number(value);
};

export const sleb128NumberParser: Parser<number, Uint8Array> = async parserContext => {
	const value = await sleb128Parser(parserContext);

	parserContext.invariant(
		Number(value) >= Number.MIN_SAFE_INTEGER && Number(value) <= Number.MAX_SAFE_INTEGER,
		'Value is too large to be represented as a number: %s',
		value,
	);

	return Number(value);
};

export const uleb128UnsafeNumberParser: Parser<number, Uint8Array> = async parserContext => {
	let leastSignificantValueBitIndex = 0;
	let value = 0;

	while (true) {
		const byte = await parserContext.read(0);
		const byteValue = byte & 0b0111_1111;
		const byteNotLast = byte & 0b1000_0000;

		value |= byteValue << leastSignificantValueBitIndex;

		if (byteNotLast) {
			leastSignificantValueBitIndex += 7;
			continue;
		}

		break;
	}

	return value;
};

export const sleb128UnsafeNumberParser: Parser<number, Uint8Array> = async parserContext => {
	let value = 0;
	let leastSignificantValueBitIndex = 0;

	while (true) {
		const byte = await parserContext.read(0);
		const byteValue = byte & 0b0111_1111;
		const byteNotLast = byte & 0b1000_0000;

		value |= byteValue << leastSignificantValueBitIndex;
		leastSignificantValueBitIndex += 7;

		if (byteNotLast) {
			continue;
		}

		const mostSignificantInputBit = byte & 0b0100_0000;

		if (leastSignificantValueBitIndex < 32 && mostSignificantInputBit) {
			value |= (~0 << leastSignificantValueBitIndex);
		}

		break;
	}

	return value;
};
