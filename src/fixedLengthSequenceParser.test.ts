import process from 'node:process';
import test from 'ava';
import * as fc from 'fast-check';
import { testProp } from '@fast-check/ava';
import { createFixedLengthSequenceParser, createFixedLengthSequenceParserNaive } from './fixedLengthSequenceParser.js';
import { runParser } from './parser.js';
import { stringParserInputCompanion } from './parserInputCompanion.js';

let timeNaive = 0n;
let time = 0n;

testProp.serial(
	'fixedLengthSequenceParser',
	[
		fc
			.bigInt({
				min: 1n,
				max: 2n ** 14n,
			})
			.chain(length => fc.tuple(
				fc.string({
					minLength: Number(length),
					maxLength: Number(length) * 2,
				}),
				fc.constant(length),
			)),
	],
	async (t, [ sequence, length ]) => {
		const fixedLengthSequenceParserNaive = createFixedLengthSequenceParserNaive<string>(length);
		const fixedLengthSequenceParser = createFixedLengthSequenceParser<string>(length);

		const startNaive = process.hrtime.bigint();
		const actualNaive = await runParser(fixedLengthSequenceParserNaive, sequence, stringParserInputCompanion);
		const endNaive = process.hrtime.bigint();
		timeNaive += endNaive - startNaive;

		t.true(actualNaive.length === Number(length));

		const start = process.hrtime.bigint();
		const actual = await runParser(fixedLengthSequenceParser, sequence, stringParserInputCompanion);
		const end = process.hrtime.bigint();
		time += end - start;

		t.deepEqual(actual, actualNaive);
	},
	{
		verbose: true,
	},
);

test.serial(
	'fixedLengthSequenceParser performance',
	t => {
		t.true(time * 10n < timeNaive);
	},
);
