import * as fc from 'fast-check';
import { testProp } from '@fast-check/ava';
import { Parser, runParser } from './parser.js';
import { stringParserInputCompanion } from './parserInputCompanion.js';
import { createElementTerminatedSequenceArrayParser } from './elementTerminatedSequenceArrayParser.js';

testProp.serial(
	'elementTerminatedSequenceArrayParser',
	[
		fc
			.string({
				minLength: 1,
			})
			.map(string => ({
				string,
				terminator: string.slice(-1)
			}))
			.filter(({ string, terminator }) => string.split(terminator).length === 2)
	],
	async (t, { string, terminator }) => {
		const elementTerminatedSequenceArrayParser = createElementTerminatedSequenceArrayParser<string>(
			terminator,
		);

		const createTestWrapperParser = (innerParser: typeof elementTerminatedSequenceArrayParser): Parser<{
			strings: string[];
			nextPeek: string | undefined;
			position: number;
		}, string> => async parserContext => {
			const strings = await innerParser(parserContext);

			return {
				strings,
				nextPeek: await parserContext.peek(0),
				position: parserContext.position,
			};
		};

		const actual = await runParser(
			createTestWrapperParser(elementTerminatedSequenceArrayParser),
			string,
			stringParserInputCompanion,
		);

		t.deepEqual(actual, {
			strings: [ string.split(terminator)[0] ],
			nextPeek: undefined,
			position: string.length,
		});
	},
	{
		verbose: true,
	},
);
