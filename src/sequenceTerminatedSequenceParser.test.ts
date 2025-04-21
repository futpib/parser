import * as fc from 'fast-check';
import { testProp } from '@fast-check/ava';
import { Parser, runParser } from './parser.js';
import { stringParserInputCompanion } from './parserInputCompanion.js';
import { createSequenceTerminatedSequenceParser } from './sequenceTerminatedSequenceParser.js';

testProp.serial(
	'sequenceTerminatedSequenceParser',
	[
		fc.tuple(
			fc
				.string({
					minLength: 1,
				}),
			fc
				.integer({
					min: 1,
				}),
		)
			.map(([ string, terminatorLength ]) => ({
				string,
				terminator: string.slice(-terminatorLength),
			}))
			.filter(({ string, terminator }) => string.split(terminator).length === 2)
	],
	async (t, { string, terminator }) => {
		const sequenceTerminatedSequenceParser = createSequenceTerminatedSequenceParser<string>(
			terminator,
		);

		const createTestWrapperParser = (innerParser: typeof sequenceTerminatedSequenceParser): Parser<{
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
			createTestWrapperParser(sequenceTerminatedSequenceParser),
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
