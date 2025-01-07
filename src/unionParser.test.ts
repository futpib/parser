import test from 'ava';
import { createUnionParser } from './unionParser.js';
import { Parser, runParser } from './parser.js';
import { stringParserInputCompanion } from './parserInputCompanion.js';
import { createArrayParser } from './arrayParser.js';
import { createExactElementParser } from './exactElementParser.js';

test('union of union of union', async t => {
	const parser: Parser<string, string> = createUnionParser([
		createExactElementParser('a'),
		createUnionParser([
			createExactElementParser('b'),
			createUnionParser([
				createExactElementParser('c'),
				createExactElementParser('d'),
			]),
			createExactElementParser('e'),
		]),
		createExactElementParser('f'),
		createUnionParser([
			createExactElementParser('g'),
			createExactElementParser('h'),
		]),
	]);

	for (const character of 'abcdefgh') {
		t.deepEqual(await runParser(parser, character, stringParserInputCompanion), character);
	}
});

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
