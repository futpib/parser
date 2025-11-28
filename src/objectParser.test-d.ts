import { expectAssignable, expectNotAssignable, expectType } from 'tsd';
import { createObjectParser } from './objectParser.js';
import { type Parser, type ParserOutput } from './parser.js';
import { createExactSequenceParser } from './exactSequenceParser.js';
import { createFixedLengthSequenceParser } from './fixedLengthSequenceParser.js';

// Test: parsers only - extracts output types
{
	const parser = createObjectParser({
		first: createFixedLengthSequenceParser<string>(3),
		second: createFixedLengthSequenceParser<string>(3),
	});

	type Output = ParserOutput<typeof parser>;

	// Output should be assignable to and from expected type
	expectAssignable<{ first: string; second: string }>(null! as Output);
	expectAssignable<Output>(null! as { first: string; second: string });
}

// Test: literal types are preserved
{
	const parser = createObjectParser({
		type: 'block' as const,
		name: createFixedLengthSequenceParser<string>(3),
	});

	type Output = ParserOutput<typeof parser>;

	// 'block' literal should be preserved
	expectAssignable<{ type: 'block'; name: string }>(null! as Output);
	expectType<'block'>(null! as Output['type']);
}

// Test: underscore keys excluded from result type
{
	const parser = createObjectParser({
		first: createFixedLengthSequenceParser<string>(3),
		_sep: createExactSequenceParser(':'),
		second: createFixedLengthSequenceParser<string>(3),
	});

	type Output = ParserOutput<typeof parser>;

	// Should have first and second but not _sep
	expectAssignable<{ first: string; second: string }>(null! as Output);

	// _sep should NOT be a key in Output
	expectNotAssignable<{ _sep: string }>(null! as Output);
}

// Test: mixed literals and parsers with underscore keys
{
	const parser = createObjectParser({
		type: 'assignment' as const,
		_open: createExactSequenceParser('('),
		name: createFixedLengthSequenceParser<string>(1),
		_eq: createExactSequenceParser('='),
		value: createFixedLengthSequenceParser<string>(1),
		_close: createExactSequenceParser(')'),
	});

	type Output = ParserOutput<typeof parser>;

	expectAssignable<{ type: 'assignment'; name: string; value: string }>(null! as Output);
	expectType<'assignment'>(null! as Output['type']);

	// Underscore keys should not exist
	expectNotAssignable<{ _open: string }>(null! as Output);
	expectNotAssignable<{ _eq: string }>(null! as Output);
	expectNotAssignable<{ _close: string }>(null! as Output);
}

// Test: number literal
{
	const parser = createObjectParser({
		code: 42 as const,
		data: createFixedLengthSequenceParser<string>(2),
	});

	type Output = ParserOutput<typeof parser>;

	expectAssignable<{ code: 42; data: string }>(null! as Output);
	expectType<42>(null! as Output['code']);
}

// Test: all underscore keys results in empty object
{
	const parser = createObjectParser({
		_a: createExactSequenceParser('a'),
		_b: createExactSequenceParser('b'),
	});

	type Output = ParserOutput<typeof parser>;

	// Should be assignable to empty object
	// eslint-disable-next-line @typescript-eslint/ban-types
	expectAssignable<{}>(null! as Output);

	// Should NOT have _a or _b
	expectNotAssignable<{ _a: string }>(null! as Output);
	expectNotAssignable<{ _b: string }>(null! as Output);
}

// Test: boolean literal
{
	const parser = createObjectParser({
		enabled: true as const,
		name: createFixedLengthSequenceParser<string>(3),
	});

	type Output = ParserOutput<typeof parser>;

	expectAssignable<{ enabled: true; name: string }>(null! as Output);
	expectType<true>(null! as Output['enabled']);
}

// Test: null literal
{
	const parser = createObjectParser({
		value: null,
		name: createFixedLengthSequenceParser<string>(3),
	});

	type Output = ParserOutput<typeof parser>;

	expectAssignable<{ value: null; name: string }>(null! as Output);
	expectType<null>(null! as Output['value']);
}

// Test: underscore-prefixed parsers still contribute to sequence type inference
{
	const parser = createObjectParser({
		_prefix: createExactSequenceParser<Uint8Array>(Buffer.from([0x00])),
		operation: 'nop' as const,
	});

	// Parser should be assignable to Parser<{ operation: 'nop' }, Uint8Array>
	expectAssignable<Parser<{ operation: 'nop' }, Uint8Array>>(parser);
}

// Test: sequence type inferred from underscore parser when no other parsers present
{
	const parser = createObjectParser({
		_marker: createExactSequenceParser<string>('test'),
		type: 'marker' as const,
		value: 42 as const,
	});

	// Should infer string sequence from _marker parser
	expectAssignable<Parser<{ type: 'marker'; value: 42 }, string>>(parser);
}
