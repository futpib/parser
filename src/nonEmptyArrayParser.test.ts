import test from 'ava';
import { createNonEmptyArrayParser } from './nonEmptyArrayParser.js';
import { type Parser, runParser } from './parser.js';
import { stringParserInputCompanion } from './parserInputCompanion.js';
import { createExactElementParser } from './exactElementParser.js';

test('empty array does not match', async t => {
	const parser: Parser<string[], string> = createNonEmptyArrayParser(createExactElementParser('0'));

	await t.throwsAsync(async () => runParser(parser, '', stringParserInputCompanion), {
		any: true,
		message: /Expected .* to match at least once/,
	});
});

test('non-empty array matches', async t => {
	const parser: Parser<string[], string> = createNonEmptyArrayParser(createExactElementParser('0'));
	const result = await runParser(parser, '0', stringParserInputCompanion);

	t.deepEqual(result, [ '0' ]);
});
