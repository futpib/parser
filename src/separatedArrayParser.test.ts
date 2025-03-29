import test from 'ava';
import { testProp, fc } from '@fast-check/ava';
import { createSeparatedArrayParser } from './separatedArrayParser.js';
import { type Parser, runParser, runParserWithRemainingInput } from './parser.js';
import { stringParserInputCompanion } from './parserInputCompanion.js';
import { createExactSequenceParser } from './exactSequenceParser.js';

test('does not loop forever with a child parser that does not consume anything', async t => {
	const parser: Parser<undefined[], string> = createSeparatedArrayParser(async () => undefined, () => undefined);
	const { output } = await runParserWithRemainingInput(parser, 'foo', stringParserInputCompanion);

	t.deepEqual(output, []);
});

testProp(
	'separatedArray',
	[
		fc.array(fc.constant('element')),
	],
	async (t, elements) => {
		const separatedArrayParser = createSeparatedArrayParser(
			createExactSequenceParser('element'),
			createExactSequenceParser('separator'),
		);

		const actual = await runParser(separatedArrayParser, elements.join('separator'), stringParserInputCompanion);
		const expected = elements;

		t.deepEqual(actual, expected);
	},
	{
		verbose: true,
	},
);
