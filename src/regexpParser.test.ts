import test from 'ava';
import * as fc from 'fast-check';
import { testProp } from '@fast-check/ava';
import { runParser, runParserWithRemainingInput } from './parser.js';
import { stringParserInputCompanion } from './parserInputCompanion.js';
import { createRegExpParser } from './regexpParser.js';

test('regexpParser matches digits', async t => {
	const regexpParser = createRegExpParser(/\d+/);

	const result = await runParser(
		regexpParser,
		'123',
		stringParserInputCompanion,
	);

	t.is(result[0], '123');
});

test('regexpParser matches at start only', async t => {
	const regexpParser = createRegExpParser(/\d+/);

	const { output, remainingInput } = await runParserWithRemainingInput(
		regexpParser,
		'123abc',
		stringParserInputCompanion,
	);

	t.is(output[0], '123');
	t.truthy(remainingInput);
});

test('regexpParser fails when no match at start', async t => {
	const regexpParser = createRegExpParser(/\d+/);

	await t.throwsAsync(
		runParser(
			regexpParser,
			'abc123',
			stringParserInputCompanion,
		),
	);
});

test('regexpParser with capture groups', async t => {
	const regexpParser = createRegExpParser(/(\d+)-(\d+)/);

	const result = await runParser(
		regexpParser,
		'123-456',
		stringParserInputCompanion,
	);

	t.is(result[0], '123-456');
	t.is(result[1], '123');
	t.is(result[2], '456');
});

test('regexpParser greedy matching', async t => {
	const regexpParser = createRegExpParser(/a+/);

	const { output } = await runParserWithRemainingInput(
		regexpParser,
		'aaab',
		stringParserInputCompanion,
	);

	t.is(output[0], 'aaa');
});

test('regexpParser with anchored regexp', async t => {
	const regexpParser = createRegExpParser(/^hello/);

	const { output } = await runParserWithRemainingInput(
		regexpParser,
		'hello world',
		stringParserInputCompanion,
	);

	t.is(output[0], 'hello');
});

testProp.serial(
	'regexpParser matches word characters',
	[
		fc.tuple(
			fc.stringMatching(/^\w+$/),
			fc.stringMatching(/^\W*$/),
		),
	],
	async (t, [ word, nonWord ]) => {
		const regexpParser = createRegExpParser(/\w+/);

		const { output, position } = await runParserWithRemainingInput(
			regexpParser,
			word + nonWord,
			stringParserInputCompanion,
		);

		t.is(output[0], word);
		t.is(position, word.length);
	},
	{
		verbose: true,
	},
);

// Tests for zero-width/optional patterns at end of input

test('regexpParser with star quantifier on empty input', async t => {
	const regexpParser = createRegExpParser(/a*/);

	const result = await runParser(
		regexpParser,
		'',
		stringParserInputCompanion,
	);

	t.is(result[0], '');
});

test('regexpParser with optional whitespace on empty input', async t => {
	const regexpParser = createRegExpParser(/[ \t]*/);

	const result = await runParser(
		regexpParser,
		'',
		stringParserInputCompanion,
	);

	t.is(result[0], '');
});

test('regexpParser with star quantifier at end of input (no match)', async t => {
	const regexpParser = createRegExpParser(/a*/);

	const { output } = await runParserWithRemainingInput(
		regexpParser,
		'bbb',
		stringParserInputCompanion,
	);

	t.is(output[0], '');
});

test('regexpParser with optional group on empty input', async t => {
	const regexpParser = createRegExpParser(/(?:foo)?/);

	const result = await runParser(
		regexpParser,
		'',
		stringParserInputCompanion,
	);

	t.is(result[0], '');
});

// Tests for negative lookahead

test('regexpParser with negative lookahead should not match when followed by same char', async t => {
	// This regex should NOT match anything in '||' - the | is followed by another |
	const regexpParser = createRegExpParser(/\|(?!\|)/);

	await t.throwsAsync(
		runParser(
			regexpParser,
			'||',
			stringParserInputCompanion,
		),
	);
});

test('regexpParser with negative lookahead should match single char', async t => {
	// This regex should match single '|' when followed by something else
	const regexpParser = createRegExpParser(/\|(?!\|)/);

	const { output, position, remainingInput } = await runParserWithRemainingInput(
		regexpParser,
		'| ',
		stringParserInputCompanion,
	);

	t.is(output[0], '|');
	t.is(position, 1); // Consumed 1 character
	t.truthy(remainingInput); // There's remaining input (the space)
});

test('regexpParser should match exact 6-character input', async t => {
	const regexpParser = createRegExpParser(/abcdef/);

	const result = await runParser(
		regexpParser,
		'abcdef',
		stringParserInputCompanion,
	);

	t.is(result[0], 'abcdef');
});

test('regexpParser should match quoted string of length 6', async t => {
	const regexpParser = createRegExpParser(/"[^"]*"/);

	const result = await runParser(
		regexpParser,
		'"abcd"', // 6 characters total
		stringParserInputCompanion,
	);

	t.is(result[0], '"abcd"');
});

// Property-based tests for fixed-length patterns

testProp(
	'regexpParser should match exact n-character input for any length',
	[fc.integer({ min: 1, max: 20 })],
	async (t, length) => {
		const input = 'a'.repeat(length);
		const regex = new RegExp(`a{${length}}`);
		const regexpParser = createRegExpParser(regex);

		const result = await runParser(
			regexpParser,
			input,
			stringParserInputCompanion,
		);

		t.is(result[0], input);
	},
);

testProp(
	'regexpParser should match quoted strings of any length',
	[fc.integer({ min: 0, max: 20 })],
	async (t, contentLength) => {
		const content = 'x'.repeat(contentLength);
		const input = `"${content}"`;
		const regexpParser = createRegExpParser(/"[^"]*"/);

		const result = await runParser(
			regexpParser,
			input,
			stringParserInputCompanion,
		);

		t.is(result[0], input);
	},
);

testProp(
	'regexpParser greedy patterns should match any length input',
	[fc.stringMatching(/^[a-z]+$/).filter(s => s.length > 0 && s.length <= 20)],
	async (t, input) => {
		const regexpParser = createRegExpParser(/[a-z]+/);

		const result = await runParser(
			regexpParser,
			input,
			stringParserInputCompanion,
		);

		t.is(result[0], input);
	},
);
