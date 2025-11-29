import test from 'ava';
import { testProp, fc } from '@fast-check/ava';
import sExpression from 's-expression';
import { runParser } from './parser.js';

const seed = process.env.SEED ? Number(process.env.SEED) : undefined;
import { stringParserInputCompanion } from './parserInputCompanion.js';
import {
	symbolicExpressionParser,
	symbolicExpressionDocumentParser,
} from './symbolicExpressionParser.js';
import { type SymbolicExpression } from './symbolicExpression.js';

// Convert s-expression package output to our discriminated union format
function convertToDiscriminatedUnion(value: unknown): SymbolicExpression {
	if (Array.isArray(value)) {
		// Handle quote forms: ['quote', x], ['quasiquote', x], etc.
		if (value.length === 2 && typeof value[0] === 'string') {
			const [type, inner] = value;
			if (type === 'quote') {
				return { type: 'quote', value: convertToDiscriminatedUnion(inner) };
			}

			if (type === 'quasiquote') {
				return { type: 'quasiquote', value: convertToDiscriminatedUnion(inner) };
			}

			if (type === 'unquote') {
				return { type: 'unquote', value: convertToDiscriminatedUnion(inner) };
			}

			if (type === 'unquote-splicing') {
				return { type: 'unquote-splicing', value: convertToDiscriminatedUnion(inner) };
			}
		}

		return { type: 'list', value: value.map(convertToDiscriminatedUnion) };
	}

	if (value instanceof String) {
		return { type: 'string', value: value.valueOf() };
	}

	if (typeof value === 'string') {
		return { type: 'atom', value };
	}

	throw new Error(`Unknown value type: ${typeof value}`);
}

// Basic atom parsing
test('atom - simple', async t => {
	const result = await runParser(
		symbolicExpressionParser,
		'a',
		stringParserInputCompanion,
	);

	t.deepEqual(result, { type: 'atom', value: 'a' });
});

test('atom - with numbers', async t => {
	const result = await runParser(
		symbolicExpressionParser,
		'abc123',
		stringParserInputCompanion,
	);

	t.deepEqual(result, { type: 'atom', value: 'abc123' });
});

// List parsing
test('list - empty', async t => {
	const result = await runParser(
		symbolicExpressionParser,
		'()',
		stringParserInputCompanion,
	);

	t.deepEqual(result, { type: 'list', value: [] });
});

test('list - single element', async t => {
	const result = await runParser(
		symbolicExpressionParser,
		'(a)',
		stringParserInputCompanion,
	);

	t.deepEqual(result, {
		type: 'list',
		value: [{ type: 'atom', value: 'a' }],
	});
});

test('list - multiple elements', async t => {
	const result = await runParser(
		symbolicExpressionParser,
		'(a b c)',
		stringParserInputCompanion,
	);

	t.deepEqual(result, {
		type: 'list',
		value: [
			{ type: 'atom', value: 'a' },
			{ type: 'atom', value: 'b' },
			{ type: 'atom', value: 'c' },
		],
	});
});

test('list - nested', async t => {
	const result = await runParser(
		symbolicExpressionParser,
		'((a b c)(()()))',
		stringParserInputCompanion,
	);

	t.deepEqual(result, {
		type: 'list',
		value: [
			{
				type: 'list',
				value: [
					{ type: 'atom', value: 'a' },
					{ type: 'atom', value: 'b' },
					{ type: 'atom', value: 'c' },
				],
			},
			{
				type: 'list',
				value: [
					{ type: 'list', value: [] },
					{ type: 'list', value: [] },
				],
			},
		],
	});
});

// String parsing
test('string - simple', async t => {
	const result = await runParser(
		symbolicExpressionParser,
		'"hello"',
		stringParserInputCompanion,
	);

	t.deepEqual(result, { type: 'string', value: 'hello' });
});

test('string - with escape sequences', async t => {
	const result = await runParser(
		symbolicExpressionParser,
		'"hello\\nworld"',
		stringParserInputCompanion,
	);

	t.deepEqual(result, { type: 'string', value: 'hello\nworld' });
});

test('string - in list', async t => {
	const result = await runParser(
		symbolicExpressionParser,
		'(a "hello")',
		stringParserInputCompanion,
	);

	t.deepEqual(result, {
		type: 'list',
		value: [
			{ type: 'atom', value: 'a' },
			{ type: 'string', value: 'hello' },
		],
	});
});

// Quote parsing
test('quote - atom', async t => {
	const result = await runParser(
		symbolicExpressionParser,
		"'a",
		stringParserInputCompanion,
	);

	t.deepEqual(result, {
		type: 'quote',
		value: { type: 'atom', value: 'a' },
	});
});

test('quote - empty list', async t => {
	const result = await runParser(
		symbolicExpressionParser,
		"'()",
		stringParserInputCompanion,
	);

	t.deepEqual(result, {
		type: 'quote',
		value: { type: 'list', value: [] },
	});
});

test('quote - list', async t => {
	const result = await runParser(
		symbolicExpressionParser,
		"'(a b c)",
		stringParserInputCompanion,
	);

	t.deepEqual(result, {
		type: 'quote',
		value: {
			type: 'list',
			value: [
				{ type: 'atom', value: 'a' },
				{ type: 'atom', value: 'b' },
				{ type: 'atom', value: 'c' },
			],
		},
	});
});

test('quote - nested', async t => {
	const result = await runParser(
		symbolicExpressionParser,
		"''a",
		stringParserInputCompanion,
	);

	t.deepEqual(result, {
		type: 'quote',
		value: {
			type: 'quote',
			value: { type: 'atom', value: 'a' },
		},
	});
});

// Quasiquote parsing
test('quasiquote - atom', async t => {
	const result = await runParser(
		symbolicExpressionParser,
		'`a',
		stringParserInputCompanion,
	);

	t.deepEqual(result, {
		type: 'quasiquote',
		value: { type: 'atom', value: 'a' },
	});
});

test('quasiquote - list', async t => {
	const result = await runParser(
		symbolicExpressionParser,
		'`(a b c)',
		stringParserInputCompanion,
	);

	t.deepEqual(result, {
		type: 'quasiquote',
		value: {
			type: 'list',
			value: [
				{ type: 'atom', value: 'a' },
				{ type: 'atom', value: 'b' },
				{ type: 'atom', value: 'c' },
			],
		},
	});
});

// Unquote parsing
test('unquote - atom', async t => {
	const result = await runParser(
		symbolicExpressionParser,
		',a',
		stringParserInputCompanion,
	);

	t.deepEqual(result, {
		type: 'unquote',
		value: { type: 'atom', value: 'a' },
	});
});

test('unquote - list', async t => {
	const result = await runParser(
		symbolicExpressionParser,
		',(a b c)',
		stringParserInputCompanion,
	);

	t.deepEqual(result, {
		type: 'unquote',
		value: {
			type: 'list',
			value: [
				{ type: 'atom', value: 'a' },
				{ type: 'atom', value: 'b' },
				{ type: 'atom', value: 'c' },
			],
		},
	});
});

// Unquote-splicing parsing
test('unquote-splicing - atom', async t => {
	const result = await runParser(
		symbolicExpressionParser,
		',@a',
		stringParserInputCompanion,
	);

	t.deepEqual(result, {
		type: 'unquote-splicing',
		value: { type: 'atom', value: 'a' },
	});
});

test('unquote-splicing - list', async t => {
	const result = await runParser(
		symbolicExpressionParser,
		',@(a b c)',
		stringParserInputCompanion,
	);

	t.deepEqual(result, {
		type: 'unquote-splicing',
		value: {
			type: 'list',
			value: [
				{ type: 'atom', value: 'a' },
				{ type: 'atom', value: 'b' },
				{ type: 'atom', value: 'c' },
			],
		},
	});
});

// Complex expressions
test('complex - quote inside list', async t => {
	const result = await runParser(
		symbolicExpressionParser,
		"(a '(a b c))",
		stringParserInputCompanion,
	);

	t.deepEqual(result, {
		type: 'list',
		value: [
			{ type: 'atom', value: 'a' },
			{
				type: 'quote',
				value: {
					type: 'list',
					value: [
						{ type: 'atom', value: 'a' },
						{ type: 'atom', value: 'b' },
						{ type: 'atom', value: 'c' },
					],
				},
			},
		],
	});
});

test('complex - multiple quotes in list', async t => {
	const result = await runParser(
		symbolicExpressionParser,
		"((a 'b 'c))",
		stringParserInputCompanion,
	);

	t.deepEqual(result, {
		type: 'list',
		value: [
			{
				type: 'list',
				value: [
					{ type: 'atom', value: 'a' },
					{ type: 'quote', value: { type: 'atom', value: 'b' } },
					{ type: 'quote', value: { type: 'atom', value: 'c' } },
				],
			},
		],
	});
});

// Document parser with whitespace
test('document - with leading whitespace', async t => {
	const result = await runParser(
		symbolicExpressionDocumentParser,
		'  a',
		stringParserInputCompanion,
	);

	t.deepEqual(result, { type: 'atom', value: 'a' });
});

test('document - with trailing whitespace', async t => {
	const result = await runParser(
		symbolicExpressionDocumentParser,
		'a  ',
		stringParserInputCompanion,
	);

	t.deepEqual(result, { type: 'atom', value: 'a' });
});

// Arbitrary symbolic expression generator for property-based testing
const arbitraryAtomChar = fc.string({ minLength: 1, maxLength: 10 }).filter(s =>
	s.length > 0 && !/[\s()"'`,;]/.test(s),
);

const arbitraryStringContent = fc.string({ maxLength: 20 }).map(s =>
	// Escape special characters for string literals
	s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t'),
);

const arbitrarySymbolicExpression: fc.Arbitrary<string> = fc.letrec(tie => ({
	atom: arbitraryAtomChar,
	string: arbitraryStringContent.map(s => `"${s}"`),
	list: fc.array(tie('expression') as fc.Arbitrary<string>, { maxLength: 5 }).map(exprs => `(${exprs.join(' ')})`),
	quote: (tie('expression') as fc.Arbitrary<string>).map(e => `'${e}`),
	quasiquote: (tie('expression') as fc.Arbitrary<string>).map(e => `\`${e}`),
	unquote: (tie('expression') as fc.Arbitrary<string>).map(e => `,${e}`),
	unquoteSplicing: (tie('expression') as fc.Arbitrary<string>).map(e => `,@${e}`),
	expression: fc.oneof(
		{ weight: 5, arbitrary: tie('atom') as fc.Arbitrary<string> },
		{ weight: 2, arbitrary: tie('string') as fc.Arbitrary<string> },
		{ weight: 3, arbitrary: tie('list') as fc.Arbitrary<string> },
		{ weight: 1, arbitrary: tie('quote') as fc.Arbitrary<string> },
		{ weight: 1, arbitrary: tie('quasiquote') as fc.Arbitrary<string> },
		{ weight: 1, arbitrary: tie('unquote') as fc.Arbitrary<string> },
		{ weight: 1, arbitrary: tie('unquoteSplicing') as fc.Arbitrary<string> },
	),
})).expression as fc.Arbitrary<string>;

// Property-based test comparing with s-expression package
testProp(
	'matches s-expression package output',
	[arbitrarySymbolicExpression],
	async (t, input) => {
		const reference = sExpression(input);

		if (reference instanceof Error) {
			// If s-expression fails, our parser should also fail
			await t.throwsAsync(
				() => runParser(symbolicExpressionParser, input, stringParserInputCompanion),
			);
		} else {
			const expected = convertToDiscriminatedUnion(reference);
			const actual = await runParser(
				symbolicExpressionParser,
				input,
				stringParserInputCompanion,
			);
			t.deepEqual(actual, expected);
		}
	},
	{ seed },
);
