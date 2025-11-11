import test from 'ava';
import { testProp, fc } from '@fast-check/ava';
import { createSeparatedNonEmptyArrayParser } from './separatedNonEmptyArrayParser.js';
import { type Parser, runParser, runParserWithRemainingInput } from './parser.js';
import { stringParserInputCompanion } from './parserInputCompanion.js';
import { createExactSequenceParser } from './exactSequenceParser.js';
import { stringFromAsyncIterable } from './stringFromAsyncIterable.js';

test('empty input throws error', async t => {
	const parser: Parser<string[], string> = createSeparatedNonEmptyArrayParser(
		createExactSequenceParser('element'),
		createExactSequenceParser(','),
	);

	await t.throwsAsync(async () => runParser(parser, '', stringParserInputCompanion), {
		message: /Expected .* to match at least once/,
	});
});

test('single element without separator matches', async t => {
	const parser: Parser<string[], string> = createSeparatedNonEmptyArrayParser(
		createExactSequenceParser('element'),
		createExactSequenceParser(','),
	);

	const result = await runParser(parser, 'element', stringParserInputCompanion);
	t.deepEqual(result, [ 'element' ]);
});

test('two elements with separator matches', async t => {
	const parser: Parser<string[], string> = createSeparatedNonEmptyArrayParser(
		createExactSequenceParser('element'),
		createExactSequenceParser(','),
	);

	const result = await runParser(parser, 'element,element', stringParserInputCompanion);
	t.deepEqual(result, [ 'element', 'element' ]);
});

test('multiple elements with separator matches', async t => {
	const parser: Parser<string[], string> = createSeparatedNonEmptyArrayParser(
		createExactSequenceParser('a'),
		createExactSequenceParser(','),
	);

	const result = await runParser(parser, 'a,a,a,a', stringParserInputCompanion);
	t.deepEqual(result, [ 'a', 'a', 'a', 'a' ]);
});

test('does not consume trailing separator', async t => {
	const parser: Parser<string[], string> = createSeparatedNonEmptyArrayParser(
		createExactSequenceParser('element'),
		createExactSequenceParser(','),
	);

	const { output, remainingInput } = await runParserWithRemainingInput(parser, 'element,element,', stringParserInputCompanion);
	t.deepEqual(output, [ 'element', 'element' ]);
	t.is(await stringFromAsyncIterable(remainingInput!), ',');
});

test('does not loop forever with a child parser that does not consume anything', async t => {
	const parser: Parser<undefined[], string> = createSeparatedNonEmptyArrayParser(
		async () => undefined,
		() => undefined,
	);

	await t.throwsAsync(async () => runParser(parser, 'foo', stringParserInputCompanion), {
		message: /Expected .* to match at least once/,
	});
});

test('partial match throws error', async t => {
	const parser: Parser<string[], string> = createSeparatedNonEmptyArrayParser(
		createExactSequenceParser('element'),
		createExactSequenceParser(','),
	);

	await t.throwsAsync(async () => runParser(parser, 'elem', stringParserInputCompanion), {
		message: /Expected .* to match at least once/,
	});
});

testProp(
	'separatedNonEmptyArray with at least one element',
	[
		fc.array(fc.constant('element'), { minLength: 1 }),
	],
	async (t, elements) => {
		const separatedNonEmptyArrayParser = createSeparatedNonEmptyArrayParser(
			createExactSequenceParser('element'),
			createExactSequenceParser('separator'),
		);

		const actual = await runParser(separatedNonEmptyArrayParser, elements.join('separator'), stringParserInputCompanion);
		const expected = elements;

		t.deepEqual(actual, expected);
	},
	{
		verbose: true,
	},
);

test('separatedNonEmptyArray throws on empty array', async t => {
	const separatedNonEmptyArrayParser = createSeparatedNonEmptyArrayParser(
		createExactSequenceParser('element'),
		createExactSequenceParser('separator'),
	);

	await t.throwsAsync(async () => runParser(separatedNonEmptyArrayParser, '', stringParserInputCompanion), {
		message: /Expected .* to match at least once/,
	});
});
