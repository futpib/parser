import test from 'ava';
import * as fc from 'fast-check';
import { testProp } from '@fast-check/ava';
import { createTerminatedArrayParserNaive } from './terminatedArrayParser.js';
import { type Parser, runParser } from './parser.js';
import { stringParserInputCompanion } from './parserInputCompanion.js';
import { HighResolutionTotalTimer } from './highResolutionTimer.js';
import { createElementParser } from './elementParser.js';
import { createExactSequenceParser } from './exactSequenceParser.js';
import { createTupleParser } from './tupleParser.js';
import { createNegativeLookaheadParser } from './negativeLookaheadParser.js';
import { promiseCompose } from './promiseCompose.js';
import { createElementTerminatedArrayParserUnsafe } from './elementTerminatedArrayParser.js';

const naiveTotalTimer = new HighResolutionTotalTimer();
const elementTotalTimer = new HighResolutionTotalTimer();

testProp.serial(
	'elementTerminatedArrayParserUnsafe',
	[
		fc
			.string({
				minLength: 1,
			})
			.map(string => ({
				string,
				terminator: string.slice(-1),
			}))
			.filter(({ string, terminator }) => string.split(terminator).length === 2),
	],
	async (t, { string, terminator }) => {
		const terminatedArrayParserNaive = promiseCompose(
			createTerminatedArrayParserNaive(
				promiseCompose(
					createTupleParser([
						createNegativeLookaheadParser(createExactSequenceParser(terminator)),
						createElementParser<string>(),
					]),
					([ _, element ]) => element,
				),
				createExactSequenceParser(terminator),
			),
			([ characters ]) => characters,
		);

		const elementTerminatedArrayParserUnsafe = createElementTerminatedArrayParserUnsafe(
			promiseCompose(
				createTupleParser([
					createNegativeLookaheadParser(createExactSequenceParser(terminator)),
					createElementParser<string>(),
				]),
				([ _, element ]) => element,
			),
			terminator,
		);

		const createTestWrapperParser = (innerParser: typeof elementTerminatedArrayParserUnsafe): Parser<{
			string: string;
			position: number;
		}, string> => async parserContext => {
			const characters = await innerParser(parserContext);

			return {
				string: characters.join(''),
				nextPeek: await parserContext.peek(0),
				position: parserContext.position,
			};
		};

		const actualNaive = await naiveTotalTimer.measureAsync(async () => runParser(
			createTestWrapperParser(terminatedArrayParserNaive),
			string,
			stringParserInputCompanion,
		));

		t.is(actualNaive.string.length, string.split(terminator)[0].length);

		const actual = await elementTotalTimer.measureAsync(async () => runParser(
			createTestWrapperParser(elementTerminatedArrayParserUnsafe),
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
	'elementTerminatedArrayParserUnsafe performance',
	t => {
		t.true(
			elementTotalTimer.time * 2n < naiveTotalTimer.time,
			`Naive: ${naiveTotalTimer.time / 1_000_000n}ms, Unsafe: ${elementTotalTimer.time / 1_000_000n}ms`,
		);
	},
);
