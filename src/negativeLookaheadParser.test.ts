import * as fc from 'fast-check';
import { testProp } from '@fast-check/ava';
import { createNegativeLookaheadParser } from './negativeLookaheadParser.js';
import { createExactSequenceParser } from './exactSequenceParser.js';
import { runParser } from './parser.js';
import { stringParserInputCompanion } from './parserInputCompanion.js';
import { createTupleParser } from './tupleParser.js';
import { ParserParsingFailedError } from './parserError.js';

testProp(
	'negativeLookaheadParser',
	[
		fc.tuple(
			fc.string({
				minLength: 1,
			}),
			fc.string({
				minLength: 1,
			}),
		).filter(([ a, b ]) => !a.startsWith(b)),
	],
	async (t, [ stringA, stringB ]) => {
		const result = await runParser(
			createTupleParser([
				createNegativeLookaheadParser(createExactSequenceParser(stringB)),
				createExactSequenceParser(stringA + stringB),
			]),
			stringA + stringB,
			stringParserInputCompanion,
		);

		t.deepEqual(result, [ undefined, stringA + stringB ]);

		await t.throwsAsync(async () => runParser(
			createTupleParser([
				createNegativeLookaheadParser(createExactSequenceParser(stringA)),
				createExactSequenceParser(stringA + stringB),
			]),
			stringA + stringB,
			stringParserInputCompanion,
		), {
			instanceOf: ParserParsingFailedError,
			message: /lookahead/,
		});
	},
	{
		verbose: true,
	},
);
