import { testProp, fc } from '@fast-check/ava';
import test from 'ava';
// @ts-expect-error
import leb128 from 'leb128';
import { uint8ArrayParserInputCompanion } from './parserInputCompanion.js';
import { runParser } from './parser.js';
import {
	uleb128Parser, sleb128Parser, uleb128NumberParser, sleb128NumberParser,
} from './leb128Parser.js';

test('sleb128, uleb128, uleb128p1', async t => {
	for (const [
		input, expectedSleb128, expectedUleb128,
	] of [
			[ Buffer.from('00', 'hex'), 0n, 0n ],
			[ Buffer.from('01', 'hex'), 1n, 1n ],
			[ Buffer.from('7f', 'hex'), -1n, 127n ],
			[ Buffer.from('807f', 'hex'), -128n, 16_256n ],
		] as const) {
		const actualSleb128 = await runParser(sleb128Parser, input, uint8ArrayParserInputCompanion);
		const actualUleb128 = await runParser(uleb128Parser, input, uint8ArrayParserInputCompanion);

		t.is(actualSleb128, expectedSleb128, 'sleb128');
		t.is(actualUleb128, expectedUleb128, 'uleb128');
	}

	for (const [
		input, expectedUleb128,
	] of [
			[ new Uint8Array([ 2 ]), 2n ],
			[ new Uint8Array([ 127 ]), 127n ],
			[ new Uint8Array([ 0 + 0x80, 1 ]), 128n ],
			[ new Uint8Array([ 1 + 0x80, 1 ]), 129n ],
			[ new Uint8Array([ 57 + 0x80, 100 ]), 12_857n ],
		] as const) {
		const actualUleb128 = await runParser(uleb128Parser, input, uint8ArrayParserInputCompanion);

		t.is(actualUleb128, expectedUleb128, 'uleb128');
	}

	for (const [
		input, expectedSleb128,
	] of [
			[ new Uint8Array([ 2 ]), 2n ],
			[ new Uint8Array([ 0x7E ]), -2n ],
			[ new Uint8Array([ 127 + 0x80, 0 ]), 127n ],
			[ new Uint8Array([ 1 + 0x80, 0x7F ]), -127n ],
			[ new Uint8Array([ 0 + 0x80, 1 ]), 128n ],
			[ new Uint8Array([ 0 + 0x80, 0x7F ]), -128n ],
			[ new Uint8Array([ 1 + 0x80, 1 ]), 129n ],
			[ new Uint8Array([ 0x7F + 0x80, 0x7E ]), -129n ],
		] as const) {
		const actualSleb128 = await runParser(sleb128Parser, input, uint8ArrayParserInputCompanion);

		t.is(actualSleb128, expectedSleb128, 'sleb128');
	}
});

testProp(
	'uleb128NumberParser on small number',
	[
		fc.nat(),
	],
	async (t, natural) => {
		const uleb128 = leb128.unsigned.encode(natural);

		const actualUleb128 = await runParser(uleb128NumberParser, uleb128, uint8ArrayParserInputCompanion);

		t.is(actualUleb128, natural, 'uleb128');
	},
	{
		verbose: true,
	},
);

testProp(
	'sleb128NumberParser on small number',
	[
		fc.integer(),
	],
	async (t, integer) => {
		const sleb128 = leb128.signed.encode(integer);

		const actualSleb128 = await runParser(sleb128NumberParser, sleb128, uint8ArrayParserInputCompanion);

		t.is(actualSleb128, integer, 'sleb128');
	},
	{
		verbose: true,
	},
);

// TODO?
testProp.skip(
	'uleb128NumberParser on large number',
	[
		fc.maxSafeNat(),
	],
	async (t, natural) => {
		const uleb128 = leb128.unsigned.encode(natural);

		if (natural > (2 ** 32) - 1) {
			await t.throwsAsync(async () => runParser(uleb128NumberParser, uleb128, uint8ArrayParserInputCompanion));

			return;
		}

		const actualUleb128 = await runParser(uleb128NumberParser, uleb128, uint8ArrayParserInputCompanion);

		t.is(actualUleb128, natural, 'uleb128');
	},
	{
		verbose: true,
	},
);

// TODO?
testProp.skip(
	'sleb128NumberParser on large number',
	[
		fc.maxSafeInteger(),
	],
	async (t, integer) => {
		const sleb128 = leb128.signed.encode(integer);

		if (integer > (2 ** 32) - 1 || integer < -(2 ** 32)) {
			await t.throwsAsync(async () => runParser(sleb128NumberParser, sleb128, uint8ArrayParserInputCompanion));

			return;
		}

		const actualSleb128 = await runParser(sleb128NumberParser, sleb128, uint8ArrayParserInputCompanion);

		t.is(actualSleb128, integer, 'sleb128');
	},
	{
		verbose: true,
	},
);

testProp(
	'uleb128Parser on bigint',
	[
		fc.bigInt({ min: 0n }),
	],
	async (t, bigInt) => {
		const uleb128 = leb128.unsigned.encode(bigInt);

		const actualUleb128 = await runParser(uleb128Parser, uleb128, uint8ArrayParserInputCompanion);

		t.is(actualUleb128, bigInt, 'uleb128');
	},
	{
		verbose: true,
	},
);

testProp(
	'sleb128Parser on bigint',
	[
		fc.bigInt(),
	],
	async (t, bigInt) => {
		const sleb128 = leb128.signed.encode(bigInt);

		const actualSleb128 = await runParser(sleb128Parser, sleb128, uint8ArrayParserInputCompanion);

		t.is(actualSleb128, bigInt, 'sleb128');
	},
	{
		verbose: true,
	},
);
