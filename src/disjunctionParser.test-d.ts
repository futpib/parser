import { expectAssignable } from 'tsd';
import { createDisjunctionParser } from './disjunctionParser.js';
import { type Parser, type ParserOutput } from './parser.js';
import { createExactSequenceParser } from './exactSequenceParser.js';
import { createExactElementParser } from './exactElementParser.js';
import { createFixedLengthSequenceParser } from './fixedLengthSequenceParser.js';

// Test: basic disjunction of string parsers - output inferred as string
{
	const parser = createDisjunctionParser([
		createExactElementParser('a'),
		createExactElementParser('b'),
	]);

	type Output = ParserOutput<typeof parser>;

	expectAssignable<string>(null! as Output);
	expectAssignable<Output>(null! as string);
}

// Test: disjunction preserves literal types when parsers have explicit literal output types
{
	const parserA: Parser<'a', string> = async () => 'a' as const;
	const parserB: Parser<'b', string> = async () => 'b' as const;

	const parser = createDisjunctionParser([parserA, parserB]);

	type Output = ParserOutput<typeof parser>;

	// Output should be 'a' | 'b', not string
	expectAssignable<'a' | 'b'>(null! as Output);
	expectAssignable<Output>(null! as 'a' | 'b');
}

// Test: disjunction of parsers with different output types
{
	const stringParser: Parser<string, string> = createFixedLengthSequenceParser(3);
	const numberParser: Parser<number, string> = () => 42;

	const parser = createDisjunctionParser([
		stringParser,
		numberParser,
	]);

	type Output = ParserOutput<typeof parser>;

	// Output should be string | number
	expectAssignable<string | number>(null! as Output);
	expectAssignable<Output>(null! as string | number);
}

// Test: nested disjunctions
{
	const inner = createDisjunctionParser([
		createExactElementParser('a'),
		createExactElementParser('b'),
	]);

	const parser = createDisjunctionParser([
		inner,
		createExactElementParser('c'),
	]);

	type Output = ParserOutput<typeof parser>;

	expectAssignable<string>(null! as Output);
	expectAssignable<Output>(null! as string);
}

// Test: sequence type inferred from child parsers
{
	const parser = createDisjunctionParser([
		createExactSequenceParser('hello'),
		createExactSequenceParser('world'),
	]);

	type Output = ParserOutput<typeof parser>;

	// Parser should be for string sequences, output is string (widened from literals)
	expectAssignable<string>(null! as Output);
}

// Test: single parser in disjunction
{
	const parser = createDisjunctionParser([
		createExactSequenceParser('only'),
	]);

	type Output = ParserOutput<typeof parser>;

	// Output is string (widened from literal 'only')
	expectAssignable<string>(null! as Output);
}

// Test: disjunction of object-producing parsers
{
	const parser1: Parser<{ type: 'a'; value: number }, string> = async () => ({ type: 'a', value: 1 });
	const parser2: Parser<{ type: 'b'; name: string }, string> = async () => ({ type: 'b', name: 'test' });

	const parser = createDisjunctionParser([parser1, parser2]);

	type Output = ParserOutput<typeof parser>;

	expectAssignable<{ type: 'a'; value: number } | { type: 'b'; name: string }>(null! as Output);
}
