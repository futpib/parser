import test from 'ava';
import { createArrayParser } from './arrayParser.js';
import { type Parser, runParser } from './parser.js';
import { stringParserInputCompanion } from './parserInputCompanion.js';

test('does not loop forever with a child parser that does not consume anything', async t => {
	const parser: Parser<undefined[], string> = createArrayParser(async () => undefined);
	const result = await runParser(parser, 'foo', stringParserInputCompanion);

	t.deepEqual(result, []);
});
