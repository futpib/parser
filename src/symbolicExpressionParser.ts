import { type Parser, setParserName } from './parser.js';
import { createDisjunctionParser } from './disjunctionParser.js';
import { createExactSequenceParser } from './exactSequenceParser.js';
import { promiseCompose } from './promiseCompose.js';
import { createTupleParser } from './tupleParser.js';
import { createArrayParser } from './arrayParser.js';
import { createParserAccessorParser } from './parserAccessorParser.js';
import { createRegExpParser } from './regexpParser.js';
import {
	type SymbolicExpression,
	type SymbolicExpressionAtom,
	type SymbolicExpressionString,
	type SymbolicExpressionList,
	type SymbolicExpressionQuote,
	type SymbolicExpressionQuasiquote,
	type SymbolicExpressionUnquote,
	type SymbolicExpressionUnquoteSplicing,
} from './symbolicExpression.js';

// Whitespace parser (spaces, tabs, newlines)
const symbolicExpressionWhitespaceParser: Parser<string, string> = promiseCompose(
	createRegExpParser(/\s+/),
	match => match[0],
);

setParserName(symbolicExpressionWhitespaceParser, 'symbolicExpressionWhitespaceParser');

const symbolicExpressionOptionalWhitespaceParser: Parser<string, string> = promiseCompose(
	createRegExpParser(/\s*/),
	match => match[0],
);

setParserName(symbolicExpressionOptionalWhitespaceParser, 'symbolicExpressionOptionalWhitespaceParser');

// String literal parser: "..." with escape sequences
const symbolicExpressionStringParser: Parser<SymbolicExpressionString, string> = promiseCompose(
	createRegExpParser(/"(?:[^"\\]|\\.)*"/s),
	match => {
		// Remove surrounding quotes and process escape sequences in a single pass
		const raw = match[0].slice(1, -1);
		const value = raw.replace(/\\(.)/gs, (_, char: string) => {
			switch (char) {
				case 'n': return '\n';
				case 'r': return '\r';
				case 't': return '\t';
				case 'f': return '\f';
				case 'b': return '\b';
				case '"': return '"';
				case '\\': return '\\';
				default: return char;
			}
		});
		return {
			type: 'string' as const,
			value,
		};
	},
);

setParserName(symbolicExpressionStringParser, 'symbolicExpressionStringParser');

// Atom parser: unquoted symbols (any chars except whitespace, parens, quotes, etc.)
// Supports backslash escapes: \x becomes x, trailing \ becomes nothing
const symbolicExpressionAtomParser: Parser<SymbolicExpressionAtom, string> = promiseCompose(
	createRegExpParser(/(?:[^\s()"'`,;\\]|\\.)+\\?|\\$/),
	match => {
		const raw = match[0];
		// Process backslash escapes: \x becomes x, trailing \ becomes nothing
		const value = raw.replace(/\\(.?)/g, '$1');
		return {
			type: 'atom' as const,
			value,
		};
	},
);

setParserName(symbolicExpressionAtomParser, 'symbolicExpressionAtomParser');

// Quote parser: 'expr
const symbolicExpressionQuoteParser: Parser<SymbolicExpressionQuote, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser("'"),
		symbolicExpressionOptionalWhitespaceParser,
		createParserAccessorParser(() => symbolicExpressionParser),
	]),
	([, , expr]) => ({
		type: 'quote' as const,
		value: expr,
	}),
);

setParserName(symbolicExpressionQuoteParser, 'symbolicExpressionQuoteParser');

// Quasiquote parser: `expr
const symbolicExpressionQuasiquoteParser: Parser<SymbolicExpressionQuasiquote, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('`'),
		symbolicExpressionOptionalWhitespaceParser,
		createParserAccessorParser(() => symbolicExpressionParser),
	]),
	([, , expr]) => ({
		type: 'quasiquote' as const,
		value: expr,
	}),
);

setParserName(symbolicExpressionQuasiquoteParser, 'symbolicExpressionQuasiquoteParser');

// Unquote-splicing parser: ,@expr (must come before unquote)
const symbolicExpressionUnquoteSplicingParser: Parser<SymbolicExpressionUnquoteSplicing, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser(',@'),
		symbolicExpressionOptionalWhitespaceParser,
		createParserAccessorParser(() => symbolicExpressionParser),
	]),
	([, , expr]) => ({
		type: 'unquote-splicing' as const,
		value: expr,
	}),
);

setParserName(symbolicExpressionUnquoteSplicingParser, 'symbolicExpressionUnquoteSplicingParser');

// Unquote parser: ,expr
const symbolicExpressionUnquoteParser: Parser<SymbolicExpressionUnquote, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser(','),
		symbolicExpressionOptionalWhitespaceParser,
		createParserAccessorParser(() => symbolicExpressionParser),
	]),
	([, , expr]) => ({
		type: 'unquote' as const,
		value: expr,
	}),
);

setParserName(symbolicExpressionUnquoteParser, 'symbolicExpressionUnquoteParser');

// List element parser with optional whitespace
const symbolicExpressionListElementParser: Parser<SymbolicExpression, string> = promiseCompose(
	createTupleParser([
		createParserAccessorParser(() => symbolicExpressionParser),
		symbolicExpressionOptionalWhitespaceParser,
	]),
	([expr]) => expr,
);

setParserName(symbolicExpressionListElementParser, 'symbolicExpressionListElementParser');

// List parser: (...)
const symbolicExpressionListParser: Parser<SymbolicExpressionList, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('('),
		symbolicExpressionOptionalWhitespaceParser,
		createArrayParser(symbolicExpressionListElementParser),
		createExactSequenceParser(')'),
	]),
	([, , elements]) => ({
		type: 'list' as const,
		value: elements,
	}),
);

setParserName(symbolicExpressionListParser, 'symbolicExpressionListParser');

// Main expression parser (union of all expression types)
// Order matters: unquote-splicing before unquote, etc.
export const symbolicExpressionParser: Parser<SymbolicExpression, string> = createDisjunctionParser([
	symbolicExpressionListParser,
	symbolicExpressionStringParser,
	symbolicExpressionQuoteParser,
	symbolicExpressionQuasiquoteParser,
	symbolicExpressionUnquoteSplicingParser,
	symbolicExpressionUnquoteParser,
	symbolicExpressionAtomParser,
]);

setParserName(symbolicExpressionParser, 'symbolicExpressionParser');

// Top-level parser that handles leading/trailing whitespace
export const symbolicExpressionDocumentParser: Parser<SymbolicExpression, string> = promiseCompose(
	createTupleParser([
		symbolicExpressionOptionalWhitespaceParser,
		symbolicExpressionParser,
		symbolicExpressionOptionalWhitespaceParser,
	]),
	([, expr]) => expr,
);

setParserName(symbolicExpressionDocumentParser, 'symbolicExpressionDocumentParser');
