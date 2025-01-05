import test from 'ava';
import { createUnionParser } from './unionParser.js';
import { runParser } from './parser.js';
import { stringParserInputCompanion } from './parserInputCompanion.js';
import { createArrayParser } from './arrayParser.js';

test('sync and async child parsers', async t => {
	const parser = createArrayParser(
		createUnionParser<string, string>([
			async parserContext => {
				parserContext.invariant(
					parserContext.position % 2 === 0,
					'Expected an even position.',
				);

				return parserContext.read(0);
			},
			parserContext => {
				parserContext.invariant(
					parserContext.position % 2 === 1,
					'Expected an odd position.',
				);

				parserContext.skip(1);

				return String.fromCodePoint('A'.codePointAt(0)! + parserContext.position - 1);
			},
		]),
	);

	const result = await runParser(parser, 'a?c?', stringParserInputCompanion, {
		errorJoinMode: 'all',
	});

	t.deepEqual(result, 'aBcD'.split(''));
});
