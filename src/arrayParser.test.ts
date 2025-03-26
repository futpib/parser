import test from 'ava';
import { createArrayParser } from './arrayParser.js';
import { type Parser, runParserWithRemainingInput } from './parser.js';
import { stringParserInputCompanion } from './parserInputCompanion.js';

test('does not loop forever with a child parser that does not consume anything', async t => {
	const parser: Parser<undefined[], string> = createArrayParser(async () => undefined);
	const { output } = await runParserWithRemainingInput(parser, 'foo', stringParserInputCompanion);

	t.deepEqual(output, []);
});
