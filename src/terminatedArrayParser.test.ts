import test from 'ava';
import * as fc from 'fast-check';
import { testProp } from '@fast-check/ava';
import { createTerminatedArrayParser, createTerminatedArrayParserNaive } from './terminatedArrayParser.js';
import { Parser, runParser } from './parser.js';
import { stringParserInputCompanion, uint8ArrayParserInputCompanion } from './parserInputCompanion.js';
import { HighResolutionTotalTimer } from './highResolutionTimer.js';
import { createElementParser } from './elementParser.js';
import { createExactSequenceParser } from './exactSequenceParser.js';
import { createTupleParser } from './tupleParser.js';
import { createNegativeLookaheadParser } from './negativeLookaheadParser.js';
import { promiseCompose } from './promiseCompose.js';
import { createUnionParser } from './unionParser.js';
import { createExactElementParser } from './exactElementParser.js';

test('terminatedArrayParser of union parsers', async t => {
	const parser: Parser<[ number[], number ], Uint8Array> = createTerminatedArrayParser(
		createUnionParser([
			createExactElementParser(1),
			createExactElementParser(2),
		]),
		createExactElementParser(0),
	);

	const input = new Uint8Array([ 0 ]);

	const result = await runParser(parser, input, uint8ArrayParserInputCompanion);

	t.deepEqual(result, [ [], 0 ]);
});

testProp(
	'terminatedArrayParser both terminator and element matching',
	[
		fc.string(),
	],
	async (t, string) => {
		const terminatedArrayParserNaive = createTerminatedArrayParserNaive(
			createExactSequenceParser(string),
			createExactSequenceParser(string),
		);
		const terminatedArrayParser = createTerminatedArrayParser(
			createExactSequenceParser(string),
			createExactSequenceParser(string),
		);

		const [
			naiveResult,
			result,
		] = await Promise.allSettled([
			runParser(
				terminatedArrayParserNaive,
				string,
				stringParserInputCompanion,
			),
			runParser(
				terminatedArrayParser,
				string,
				stringParserInputCompanion,
			),
		]);

		t.is(naiveResult.status, 'rejected');

		if (
			result.status === 'rejected'
				&& naiveResult.status === 'rejected'
		) {
			result.reason.message = 'REDACTED';
			naiveResult.reason.message = 'REDACTED';
		}

		t.deepEqual(result, naiveResult);
	},
	{
		verbose: true,
	},
);

const naiveTotalTimer = new HighResolutionTotalTimer();
const totalTimer = new HighResolutionTotalTimer();

testProp.serial(
	'terminatedArrayParser',
	[
		fc
			.integer({
				min: 1,
				max: 2 ** 8,
			})
			.chain(terminatorLength => (
				fc
					.string({
						minLength: terminatorLength,
					})
					.map(string => ({
						string,
						terminator: string.slice(0 - terminatorLength)
					}))
					.filter(({ string, terminator }) => string.split(terminator).length === 2)
			))
	],
	async (t, { string, terminator }) => {
		const terminatedArrayParserNaive = createTerminatedArrayParserNaive(
			promiseCompose(
				createTupleParser([
					createNegativeLookaheadParser(createExactSequenceParser(terminator)),
					createElementParser<string>(),
				]),
				([ _, element ]) => element,
			),
			createExactSequenceParser(terminator),
		);
		const terminatedArrayParser = createTerminatedArrayParser(
			promiseCompose(
				createTupleParser([
					createNegativeLookaheadParser(createExactSequenceParser(terminator)),
					createElementParser<string>(),
				]),
				([ _, element ]) => element,
			),
			createExactSequenceParser(terminator),
		);

		const createTestWrapperParser = (innerParser: typeof terminatedArrayParser): Parser<{
			string: string;
			terminator: string;
			position: number;
		}, string> => async parserContext => {
			const [ characters, terminator ] = await innerParser(parserContext);

			return {
				string: characters.join(''),
				terminator,
				nextPeek: await parserContext.peek(0),
				position: parserContext.position,
			};
		};

		const actualNaive = await naiveTotalTimer.timeAsync(() => runParser(
			createTestWrapperParser(terminatedArrayParserNaive),
			string,
			stringParserInputCompanion,
		));

		t.is(actualNaive.string.length + actualNaive.terminator.length, string.length);

		const actual = await totalTimer.timeAsync(() => runParser(
			createTestWrapperParser(terminatedArrayParser),
			string,
			stringParserInputCompanion,
		));

		t.deepEqual(actual, actualNaive);
	},
	{
		verbose: true,
	},
);

test.serial(
	'terminatedArrayParser performance',
	t => {
		t.true(
			totalTimer.time * 1n < naiveTotalTimer.time,
			`Naive: ${naiveTotalTimer.time / 1000000n}ms, Optimized: ${totalTimer.time / 1000000n}ms`,
		);
	},
);
