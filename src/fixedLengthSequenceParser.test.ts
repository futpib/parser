import test from 'ava';
import * as fc from 'fast-check';
import { testProp } from '@fast-check/ava';
import { createFixedLengthSequenceParser, createFixedLengthSequenceParserNaive } from './fixedLengthSequenceParser.js';
import { Parser, runParser } from './parser.js';
import { stringParserInputCompanion } from './parserInputCompanion.js';
import { HighResolutionTotalTimer } from './highResolutionTimer.js';
import { arbitrarilySlicedAsyncIterable } from './arbitrarilySlicedAsyncInterable.js';

const naiveTotalTimer = new HighResolutionTotalTimer();
const totalTimer = new HighResolutionTotalTimer();

testProp.serial(
	'fixedLengthSequenceParser',
	[
		fc
			.bigInt({
				min: 1n,
				max: 2n ** 14n,
			})
			.chain(length => fc.tuple(
				arbitrarilySlicedAsyncIterable(
					fc.string({
						minLength: Number(length),
						maxLength: Number(length) * 2,
					}),
				),
				fc.constant(length),
			)),
	],
	async (t, [ [ _, sequence ], length ]) => {
		const fixedLengthSequenceParserNaive = createFixedLengthSequenceParserNaive<string>(length);
		const fixedLengthSequenceParser = createFixedLengthSequenceParser<string>(length);

		const createTestWrapperParser = (innerParser: typeof fixedLengthSequenceParser): Parser<{
			result: string,
			position: number,
		}, string> => async parserContext => {
			const result = await innerParser(parserContext);

			return {
				result,
				nextPeek: await parserContext.peek(0),
				position: parserContext.position,
			};
		};

		const actualNaive = await naiveTotalTimer.timeAsync(() => runParser(
			createTestWrapperParser(fixedLengthSequenceParserNaive),
			sequence,
			stringParserInputCompanion,
		));

		t.true(actualNaive.result.length === Number(length));

		const actual = await totalTimer.timeAsync(() => runParser(
			createTestWrapperParser(fixedLengthSequenceParser),
			sequence,
			stringParserInputCompanion,
		));

		t.deepEqual(actual, actualNaive);
	},
	{
		verbose: true,
	},
);

test.serial(
	'fixedLengthSequenceParser performance',
	t => {
		t.true(
			totalTimer.time * 10n < naiveTotalTimer.time,
			`Naive: ${naiveTotalTimer.time / 1000000n}ms, Optimized: ${totalTimer.time / 1000000n}ms`,
		);
	},
);
