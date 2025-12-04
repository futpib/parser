import { expectAssignable, expectType } from 'tsd';
import { createElementSwitchParser } from './elementSwitchParser.js';
import { type Parser, type ParserOutput } from './parser.js';

// Test: basic element switch with inferred output type
{
	const parserA: Parser<'a', string> = async () => 'a' as const;
	const parserB: Parser<'b', string> = async () => 'b' as const;

	const parser = createElementSwitchParser(
		new Map<string, typeof parserA | typeof parserB>([
			['x', parserA],
			['y', parserB],
		]),
	);

	type Output = ParserOutput<typeof parser>;

	// Output should be 'a' | 'b'
	expectAssignable<'a' | 'b'>(null! as Output);
	expectAssignable<Output>(null! as 'a' | 'b');
}

// Test: element switch with default parser
{
	const parserA: Parser<'a', string> = async () => 'a' as const;
	const defaultParser: Parser<'default', string> = async () => 'default' as const;

	const parser = createElementSwitchParser(
		new Map([
			['x', parserA],
		]),
		defaultParser,
	);

	type Output = ParserOutput<typeof parser>;

	// Output should be 'a' | 'default'
	expectAssignable<'a' | 'default'>(null! as Output);
	expectAssignable<Output>(null! as 'a' | 'default');
}

// Test: element switch with number keys (Uint8Array sequence)
{
	const parser1: Parser<{ type: 'one' }, Uint8Array> = async () => ({ type: 'one' });
	const parser2: Parser<{ type: 'two' }, Uint8Array> = async () => ({ type: 'two' });

	const parser = createElementSwitchParser(
		new Map<number, typeof parser1 | typeof parser2>([
			[1, parser1],
			[2, parser2],
		]),
	);

	type Output = ParserOutput<typeof parser>;

	expectAssignable<{ type: 'one' } | { type: 'two' }>(null! as Output);
}

// Test: element switch without default parser has no 'never' in output
{
	const parserA: Parser<string, string> = async () => 'result';

	const parser = createElementSwitchParser(
		new Map([
			['key', parserA],
		]),
	);

	type Output = ParserOutput<typeof parser>;

	// Output should just be string, not string | never
	expectType<string>(null! as Output);
}
