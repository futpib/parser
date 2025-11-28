import { expectType, expectAssignable } from 'tsd';
import { createExactSequenceParser, createExactSequenceNaiveParser } from './exactSequenceParser.js';
import { type Parser } from './parser.js';

// Test: string literal output type is preserved, sequence type is string
{
	const parser = createExactSequenceParser('foo');
	expectType<Parser<'foo', string, unknown>>(parser);
}

// Test: string literal with 'as const' also works
{
	const parser = createExactSequenceParser('bar' as const);
	expectType<Parser<'bar', string, unknown>>(parser);
}

// Test: plain string variable widens to string
{
	const value: string = 'baz';
	const parser = createExactSequenceParser(value);
	expectType<Parser<string, string, unknown>>(parser);
}

// Test: Uint8Array sequence type is preserved
{
	const bytes = new Uint8Array([1, 2, 3]);
	const parser = createExactSequenceParser(bytes);
	// Output is the specific Uint8Array instance type, Sequence is Uint8Array
	expectAssignable<Parser<Uint8Array, Uint8Array, unknown>>(parser);
}

// Test: naive parser has same type behavior
{
	const parser = createExactSequenceNaiveParser('hello');
	expectType<Parser<'hello', string, unknown>>(parser);
}

// Test: naive parser with Uint8Array
{
	const bytes = new Uint8Array([0xff]);
	const parser = createExactSequenceNaiveParser(bytes);
	expectAssignable<Parser<Uint8Array, Uint8Array, unknown>>(parser);
}
