import * as fc from 'fast-check';
import { testProp } from '@fast-check/ava';
import { type Parser, runParser } from './parser.js';
import { stringParserInputCompanion } from './parserInputCompanion.js';
import { createElementTerminatedSequenceParser } from './elementTerminatedSequenceParser.js';

testProp.serial(
	'elementTerminatedSequenceParser',
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
		const elementTerminatedSequenceParser = createElementTerminatedSequenceParser<string>(terminator);

		const createTestWrapperParser = (innerParser: typeof elementTerminatedSequenceParser): Parser<{
			string: string;
			nextPeek: string | undefined;
			position: number;
		}, string> => async parserContext => {
			const string = await innerParser(parserContext);

			return {
				string,
				nextPeek: await parserContext.peek(0),
				position: parserContext.position,
			};
		};

		const actual = await runParser(
			createTestWrapperParser(elementTerminatedSequenceParser),
			string,
			stringParserInputCompanion,
		);

		t.deepEqual(actual, {
			string: string.split(terminator)[0],
			nextPeek: undefined,
			position: string.length,
		});
	},
	{
		verbose: true,
	},
);
