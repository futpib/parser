import test from 'ava';
import { createObjectParser } from './objectParser.js';
import { runParser } from './parser.js';
import { stringParserInputCompanion } from './parserInputCompanion.js';
import { createExactSequenceParser } from './exactSequenceParser.js';
import { createFixedLengthSequenceParser } from './fixedLengthSequenceParser.js';

// Type tests are in objectParser.test-d.ts (using tsd)

test('parses object with parsers only', async t => {
	const parser = createObjectParser({
		first: createFixedLengthSequenceParser<string>(3),
		second: createFixedLengthSequenceParser<string>(3),
	});

	const output = await runParser(parser, 'foobar', stringParserInputCompanion);

	t.deepEqual(output, { first: 'foo', second: 'bar' });
});

test('parses object with literals', async t => {
	const parser = createObjectParser({
		type: 'block' as const,
		value: createFixedLengthSequenceParser<string>(3),
	});

	const output = await runParser(parser, 'foo', stringParserInputCompanion);

	t.deepEqual(output, { type: 'block', value: 'foo' });
});

test('excludes underscore-prefixed keys from result but runs parsers', async t => {
	const parser = createObjectParser({
		first: createFixedLengthSequenceParser<string>(3),
		_separator: createExactSequenceParser(':'),
		second: createFixedLengthSequenceParser<string>(3),
	});

	const output = await runParser(parser, 'foo:bar', stringParserInputCompanion);

	t.deepEqual(output, { first: 'foo', second: 'bar' });
	t.false('_separator' in output);
});

test('preserves property order', async t => {
	const parser = createObjectParser({
		c: createFixedLengthSequenceParser<string>(1),
		a: createFixedLengthSequenceParser<string>(1),
		b: createFixedLengthSequenceParser<string>(1),
	});

	const output = await runParser(parser, 'xyz', stringParserInputCompanion);

	t.deepEqual(Object.keys(output), ['c', 'a', 'b']);
	t.deepEqual(output, { c: 'x', a: 'y', b: 'z' });
});

test('mixed parsers and literals with underscore keys', async t => {
	const parser = createObjectParser({
		type: 'assignment' as const,
		_open: createExactSequenceParser('('),
		name: createFixedLengthSequenceParser<string>(1),
		_eq: createExactSequenceParser('='),
		value: createFixedLengthSequenceParser<string>(1),
		_close: createExactSequenceParser(')'),
	});

	const output = await runParser(parser, '(x=5)', stringParserInputCompanion);

	t.deepEqual(output, { type: 'assignment', name: 'x', value: '5' });
});
