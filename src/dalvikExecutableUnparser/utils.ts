import { createHash } from 'crypto';
import { type Unparser } from '../unparser.js';

export const uleb128Unparser: Unparser<number | bigint, Uint8Array> = async function * (input) {
	let value = typeof input === 'number' ? BigInt(input) : input;

	const bytes: number[] = [];

	do {
		let byte = Number(value & 0b0111_1111n);
		value >>= 7n;

		if (value !== 0n) {
			byte |= 0b1000_0000;
		}

		bytes.push(byte);
	} while (value !== 0n);

	yield new Uint8Array(bytes);
};

export const uleb128p1Unparser: Unparser<number | bigint, Uint8Array> = async function * (input, unparserContext) {
	const value = typeof input === 'number' ? BigInt(input) : input;
	yield * uleb128Unparser(value + 1n, unparserContext);
};

export const sleb128Unparser: Unparser<number | bigint, Uint8Array> = async function * (input) {
	let value = typeof input === 'number' ? BigInt(input) : input;

	const bytes: number[] = [];
	let more = true;

	while (more) {
		let byte = Number(value & 0b0111_1111n);
		value >>= 7n;

		if ((value === 0n && (byte & 0b0100_0000) === 0) || (value === -1n && (byte & 0b0100_0000) !== 0)) {
			more = false;
		} else {
			byte |= 0b1000_0000;
		}

		bytes.push(byte);
	}

	yield new Uint8Array(bytes);
};

export function encodeModifiedUtf8(str: string): Uint8Array {
	const bytes: number[] = [];

	for (let i = 0; i < str.length; i++) {
		let codePoint = str.charCodeAt(i);

		if (codePoint >= 0xD800 && codePoint <= 0xDBFF && i + 1 < str.length) {
			const highSurrogate = codePoint;
			const lowSurrogate = str.charCodeAt(i + 1);

			if (lowSurrogate >= 0xDC00 && lowSurrogate <= 0xDFFF) {
				codePoint = 0x10000 + ((highSurrogate & 0x3FF) << 10) + (lowSurrogate & 0x3FF);
				i++;
			}
		}

		if (codePoint === 0) {
			bytes.push(0xC0, 0x80);
		} else if (codePoint <= 0x7F) {
			bytes.push(codePoint);
		} else if (codePoint <= 0x7FF) {
			bytes.push(
				0xC0 | ((codePoint >> 6) & 0x1F),
				0x80 | (codePoint & 0x3F),
			);
		} else if (codePoint <= 0xFFFF) {
			bytes.push(
				0xE0 | ((codePoint >> 12) & 0x0F),
				0x80 | ((codePoint >> 6) & 0x3F),
				0x80 | (codePoint & 0x3F),
			);
		} else {
			bytes.push(
				0xF0 | ((codePoint >> 18) & 0x07),
				0x80 | ((codePoint >> 12) & 0x3F),
				0x80 | ((codePoint >> 6) & 0x3F),
				0x80 | (codePoint & 0x3F),
			);
		}
	}

	return new Uint8Array(bytes);
}

export const mutf8Unparser: Unparser<string, Uint8Array> = async function * (input) {
	yield encodeModifiedUtf8(input);
};

export const alignmentUnparser = (alignment: number): Unparser<void, Uint8Array> => {
	return async function * (_input, unparserContext) {
		const currentPosition = unparserContext.position;
		const remainder = currentPosition % alignment;

		if (remainder !== 0) {
			const paddingSize = alignment - remainder;
			yield new Uint8Array(paddingSize);
		}
	};
};

export function calculateAdler32(data: Uint8Array): number {
	const MOD_ADLER = 65521;
	let a = 1;
	let b = 0;

	for (const byte of data) {
		a = (a + byte) % MOD_ADLER;
		b = (b + a) % MOD_ADLER;
	}

	return (b << 16) | a;
}

export function calculateSHA1(data: Uint8Array): Uint8Array {
	const hash = createHash('sha1');
	hash.update(data);
	return new Uint8Array(hash.digest());
}

export async function * uint8ArrayAsyncIterableToUint8Array(
	asyncIterable: AsyncIterable<Uint8Array>,
): AsyncIterable<Uint8Array> {
	const chunks: Uint8Array[] = [];
	let totalLength = 0;

	for await (const chunk of asyncIterable) {
		chunks.push(chunk);
		totalLength += chunk.length;
	}

	const result = new Uint8Array(totalLength);
	let offset = 0;

	for (const chunk of chunks) {
		result.set(chunk, offset);
		offset += chunk.length;
	}

	yield result;
}
