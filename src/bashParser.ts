import { type Parser, setParserName } from './parser.js';
import { createExactSequenceParser } from './exactSequenceParser.js';
import { createElementParser } from './elementParser.js';
import { createPredicateElementParser } from './predicateElementParser.js';
import { createNegativeLookaheadParser } from './negativeLookaheadParser.js';
import { createLookaheadParser } from './lookaheadParser.js';
import { promiseCompose } from './promiseCompose.js';
import { createTupleParser } from './tupleParser.js';
import { createDisjunctionParser } from './disjunctionParser.js';
import { createArrayParser } from './arrayParser.js';
import { createParserAccessorParser } from './parserAccessorParser.js';
import { createOptionalParser } from './optionalParser.js';
import { createNonEmptyArrayParser } from './nonEmptyArrayParser.js';
import { createSeparatedNonEmptyArrayParser } from './separatedNonEmptyArrayParser.js';
import { createObjectParser } from './objectParser.js';
import {
	type BashWord,
	type BashWordPart,
	type BashWordPartLiteral,
	type BashWordPartSingleQuoted,
	type BashWordPartDoubleQuoted,
	type BashWordPartVariable,
	type BashWordPartVariableBraced,
	type BashWordPartCommandSubstitution,
	type BashWordPartBacktickSubstitution,
	type BashWordPartArithmeticExpansion,
	type BashWordPartProcessSubstitution,
	type BashSimpleCommand,
	type BashSubshell,
	type BashBraceGroup,
	type BashCommandUnit,
	type BashPipeline,
	type BashCommandList,
	type BashRedirect,
	type BashHereDoc,
	type BashAssignment,
	type BashCommand,
} from './bash.js';

// Character predicates
function isDigit(ch: string): boolean {
	return ch >= '0' && ch <= '9';
}

function isLetter(ch: string): boolean {
	return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z');
}

function isIdentStart(ch: string): boolean {
	return isLetter(ch) || ch === '_';
}

function isIdentChar(ch: string): boolean {
	return isIdentStart(ch) || isDigit(ch);
}

// Whitespace (spaces, tabs, and line continuations - not bare newlines which are significant)
const bashInlineWhitespaceUnitParser: Parser<string, string> = createDisjunctionParser([
	promiseCompose(createExactSequenceParser(' '), () => ' '),
	promiseCompose(createExactSequenceParser('\t'), () => '\t'),
	promiseCompose(createExactSequenceParser('\\\n'), () => '\\\n'),
]);

const bashInlineWhitespaceParser: Parser<string, string> = promiseCompose(
	createNonEmptyArrayParser(bashInlineWhitespaceUnitParser),
	parts => parts.join(''),
);

const bashOptionalInlineWhitespaceParser: Parser<string, string> = promiseCompose(
	createArrayParser(bashInlineWhitespaceUnitParser),
	parts => parts.join(''),
);

// Word characters (unquoted, no special chars)
// Note: {} and # are excluded from the first character so brace groups and comments are parsed correctly,
// but allowed as continuation characters for mid-word braces (e.g., file.{c,h}, foo}bar) and hash (foo#bar)
const bashSpecialCharParser: Parser<unknown, string> = createDisjunctionParser(
	[...' \t\n|&;<>()$`"\'\\'].map(ch => createExactSequenceParser(ch)),
);

const bashWordStartExcludeParser: Parser<unknown, string> = createDisjunctionParser([
	bashSpecialCharParser,
	createExactSequenceParser('{'),
	createExactSequenceParser('}'),
	createExactSequenceParser('#'),
]);

const bashUnquotedWordStartCharParser: Parser<string, string> = promiseCompose(
	createTupleParser([
		createNegativeLookaheadParser(bashWordStartExcludeParser),
		createElementParser<string>(),
	]),
	([, ch]) => ch,
);

const bashUnquotedWordContinueCharParser: Parser<string, string> = promiseCompose(
	createTupleParser([
		createNegativeLookaheadParser(bashSpecialCharParser),
		createElementParser<string>(),
	]),
	([, ch]) => ch,
);

const bashUnquotedWordCharsParser: Parser<string, string> = promiseCompose(
	createTupleParser([
		bashUnquotedWordStartCharParser,
		createArrayParser(bashUnquotedWordContinueCharParser),
	]),
	([first, rest]) => first + rest.join(''),
);

// Consume characters until a given terminator, returning the accumulated string
function createUntilCharParser(terminator: string): Parser<string, string> {
	return promiseCompose(
		createArrayParser(promiseCompose(
			createTupleParser([
				createNegativeLookaheadParser(createExactSequenceParser(terminator)),
				createElementParser<string>(),
			]),
			([, ch]) => ch,
		)),
		chars => chars.join(''),
	);
}

// Single quoted string: '...'
const bashSingleQuotedParser: Parser<BashWordPartSingleQuoted, string> = createObjectParser({
	type: 'singleQuoted' as const,
	_open: createExactSequenceParser("'"),
	value: createUntilCharParser("'"),
	_close: createExactSequenceParser("'"),
});

// Variable name: identifiers, positional params ($0, $1...), or special params ($@, $*, $#, $?, $$, $!, $-)
const bashSpecialParams = new Set(['@', '*', '#', '?', '$', '!', '-']);

const bashIdentifierParser: Parser<string, string> = promiseCompose(
	createTupleParser([
		createPredicateElementParser<string>(isIdentStart),
		createArrayParser(createPredicateElementParser<string>(isIdentChar)),
	]),
	([first, rest]) => first + rest.join(''),
);

const bashDigitsParser: Parser<string, string> = promiseCompose(
	createNonEmptyArrayParser(createPredicateElementParser<string>(isDigit)),
	chars => chars.join(''),
);

const bashSpecialParamParser: Parser<string, string> = createPredicateElementParser<string>(
	ch => bashSpecialParams.has(ch),
);

const bashVariableNameParser: Parser<string, string> = createDisjunctionParser([
	bashIdentifierParser,
	bashDigitsParser,
	bashSpecialParamParser,
]);

// Simple variable: $var
const bashSimpleVariableParser: Parser<BashWordPartVariable, string> = createObjectParser({
	type: 'variable' as const,
	_dollar: createExactSequenceParser('$'),
	name: bashVariableNameParser,
});

// Command substitution: $(...)
const bashCommandSubstitutionParser: Parser<BashWordPartCommandSubstitution, string> = createObjectParser({
	type: 'commandSubstitution' as const,
	_open: createExactSequenceParser('$('),
	_ws1: bashOptionalInlineWhitespaceParser,
	command: createParserAccessorParser(() => bashCommandParser),
	_ws2: bashOptionalInlineWhitespaceParser,
	_close: createExactSequenceParser(')'),
});

// Backtick substitution: `...`
const bashBacktickSubstitutionParser: Parser<BashWordPartBacktickSubstitution, string> = createObjectParser({
	type: 'backtickSubstitution' as const,
	_open: createExactSequenceParser('`'),
	command: createParserAccessorParser(() => bashCommandParser),
	_close: createExactSequenceParser('`'),
});

// Word characters for use inside ${...} operands (} excluded from continuation to not consume the closing brace)
const bashBracedVarContinueExcludeParser: Parser<unknown, string> = createDisjunctionParser([
	bashSpecialCharParser,
	createExactSequenceParser('{'),
	createExactSequenceParser('}'),
]);

const bashBracedVarUnquotedWordCharsParser: Parser<string, string> = promiseCompose(
	createTupleParser([
		bashUnquotedWordStartCharParser,
		createArrayParser(promiseCompose(
			createTupleParser([
				createNegativeLookaheadParser(bashBracedVarContinueExcludeParser),
				createElementParser<string>(),
			]),
			([, ch]) => ch,
		)),
	]),
	([first, rest]) => first + rest.join(''),
);

const bashBracedVarLiteralWordPartParser: Parser<BashWordPartLiteral, string> = createObjectParser({
	type: 'literal' as const,
	value: bashBracedVarUnquotedWordCharsParser,
});

// Braced variable expansion: ${VAR} or ${VAR:-default}
const bashBracedVariableParser: Parser<BashWordPartVariableBraced, string> = createObjectParser({
	type: 'variableBraced' as const,
	_open: createExactSequenceParser('${'),
	name: bashVariableNameParser,
	operator: createOptionalParser(createDisjunctionParser([
		promiseCompose(createExactSequenceParser(':-'), () => ':-'),
		promiseCompose(createExactSequenceParser(':='), () => ':='),
		promiseCompose(createExactSequenceParser(':+'), () => ':+'),
		promiseCompose(createExactSequenceParser(':?'), () => ':?'),
		promiseCompose(createExactSequenceParser('##'), () => '##'),
		promiseCompose(createExactSequenceParser('%%'), () => '%%'),
		promiseCompose(createExactSequenceParser('-'), () => '-'),
		promiseCompose(createExactSequenceParser('='), () => '='),
		promiseCompose(createExactSequenceParser('+'), () => '+'),
		promiseCompose(createExactSequenceParser('?'), () => '?'),
		promiseCompose(createExactSequenceParser('#'), () => '#'),
		promiseCompose(createExactSequenceParser('%'), () => '%'),
	])),
	operand: createOptionalParser(createParserAccessorParser(() => bashBracedVarWordParser)),
	_close: createExactSequenceParser('}'),
});

// Arithmetic expansion: $((expression)) - handles nested parentheses
const bashArithmeticExpressionParser: Parser<string, string> = async (parserContext) => {
	let result = '';
	let depth = 0;
	for (;;) {
		const ch = await parserContext.peek(0);
		if (ch === undefined) {
			break;
		}

		if (ch === '(') {
			depth++;
			result += ch;
			parserContext.skip(1);
			continue;
		}

		if (ch === ')') {
			if (depth > 0) {
				depth--;
				result += ch;
				parserContext.skip(1);
				continue;
			}

			// At depth 0, a ')' means we've hit the closing '))' of $((
			break;
		}

		result += ch;
		parserContext.skip(1);
	}

	return result;
};

const bashArithmeticExpansionParser: Parser<BashWordPartArithmeticExpansion, string> = createObjectParser({
	type: 'arithmeticExpansion' as const,
	_open: createExactSequenceParser('$(('),
	expression: bashArithmeticExpressionParser,
	_close: createExactSequenceParser('))'),
});

// ANSI-C quoting: $'...' - content can include \' escapes
// Each unit is either a backslash-escape pair or a non-quote character
const bashAnsiCContentUnitParser: Parser<string, string> = createDisjunctionParser([
	// Backslash escape: \x (any char after backslash)
	promiseCompose(
		createTupleParser([
			createExactSequenceParser('\\'),
			createElementParser<string>(),
		]),
		([bs, ch]) => bs + ch,
	),
	// Any character that isn't ' (and isn't \ which is handled above)
	promiseCompose(
		createTupleParser([
			createNegativeLookaheadParser(createExactSequenceParser("'")),
			createElementParser<string>(),
		]),
		([, ch]) => ch,
	),
]);

const bashAnsiCContentParser: Parser<string, string> = promiseCompose(
	createArrayParser(bashAnsiCContentUnitParser),
	parts => parts.join(''),
);

const bashAnsiCQuotedParser: Parser<BashWordPartSingleQuoted, string> = createObjectParser({
	type: 'singleQuoted' as const,
	_prefix: createExactSequenceParser('$'),
	_open: createExactSequenceParser("'"),
	value: bashAnsiCContentParser,
	_close: createExactSequenceParser("'"),
});

// Process substitution: <(cmd) or >(cmd)
const bashProcessSubstitutionDirectionParser: Parser<'<' | '>', string> = promiseCompose(
	createTupleParser([
		createDisjunctionParser([
			createExactSequenceParser('<' as const),
			createExactSequenceParser('>' as const),
		]),
		createLookaheadParser(createExactSequenceParser('(')),
	]),
	([dir]) => dir as '<' | '>',
);

const bashProcessSubstitutionParser: Parser<BashWordPartProcessSubstitution, string> = createObjectParser({
	type: 'processSubstitution' as const,
	direction: bashProcessSubstitutionDirectionParser,
	_open: createExactSequenceParser('('),
	_ws1: bashOptionalInlineWhitespaceParser,
	command: createParserAccessorParser(() => bashCommandParser),
	_ws2: bashOptionalInlineWhitespaceParser,
	_close: createExactSequenceParser(')'),
});

// Escape sequences in double quotes: \\ \$ \` \" \! \newline
const bashDoubleQuotedEscapeCharParser: Parser<string, string> = createDisjunctionParser([
	createExactSequenceParser('\\'),
	createExactSequenceParser('$'),
	createExactSequenceParser('`'),
	createExactSequenceParser('"'),
	createExactSequenceParser('!'),
	createExactSequenceParser('\n'),
]);

const bashDoubleQuotedEscapeParser: Parser<BashWordPartLiteral, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('\\'),
		bashDoubleQuotedEscapeCharParser,
	]),
	([, ch]) => ({ type: 'literal' as const, value: ch }),
);

// Literal text inside double quotes (no special chars)
const bashDoubleQuotedLiteralCharParser: Parser<string, string> = promiseCompose(
	createTupleParser([
		createNegativeLookaheadParser(createDisjunctionParser([
			createExactSequenceParser('$'),
			createExactSequenceParser('`'),
			createExactSequenceParser('"'),
			createExactSequenceParser('\\'),
		])),
		createElementParser<string>(),
	]),
	([, ch]) => ch,
);

const bashDoubleQuotedLiteralParser: Parser<BashWordPartLiteral, string> = promiseCompose(
	createNonEmptyArrayParser(bashDoubleQuotedLiteralCharParser),
	chars => ({ type: 'literal' as const, value: chars.join('') }),
);

// Bare $ not followed by a valid expansion start
const bashBareDollarParser: Parser<BashWordPartLiteral, string> = promiseCompose(
	createExactSequenceParser('$'),
	() => ({ type: 'literal' as const, value: '$' }),
);

// Bare \ not followed by a recognized escape character
const bashBareBackslashParser: Parser<BashWordPartLiteral, string> = promiseCompose(
	createExactSequenceParser('\\'),
	() => ({ type: 'literal' as const, value: '\\' }),
);

// Double quoted string parts (inside "...")
const bashDoubleQuotedPartParser: Parser<BashWordPart, string> = createDisjunctionParser([
	bashBracedVariableParser,
	bashArithmeticExpansionParser,
	bashSimpleVariableParser,
	bashCommandSubstitutionParser,
	bashBacktickSubstitutionParser,
	bashDoubleQuotedEscapeParser,
	bashDoubleQuotedLiteralParser,
	bashBareDollarParser,
	bashBareBackslashParser,
]);

// Double quoted string: "..."
const bashDoubleQuotedParser: Parser<BashWordPartDoubleQuoted, string> = createObjectParser({
	type: 'doubleQuoted' as const,
	_open: createExactSequenceParser('"'),
	parts: createArrayParser(bashDoubleQuotedPartParser),
	_close: createExactSequenceParser('"'),
});

// Literal word part (unquoted)
const bashLiteralWordPartParser: Parser<BashWordPartLiteral, string> = createObjectParser({
	type: 'literal' as const,
	value: bashUnquotedWordCharsParser,
});

// Bare {} treated as a literal word (e.g., find -exec cmd {} \;)
const bashBraceWordPartParser: Parser<BashWordPartLiteral, string> = promiseCompose(
	createExactSequenceParser('{}'),
	() => ({
		type: 'literal' as const,
		value: '{}',
	}),
);

// Bare { treated as a literal word part (e.g., echo {, echo {.})
// Note: } is NOT included here because it would break brace group closing
const bashOpenBraceWordPartParser: Parser<BashWordPartLiteral, string> = promiseCompose(
	createExactSequenceParser('{'),
	() => ({
		type: 'literal' as const,
		value: '{',
	}),
);

// Bare } treated as a literal word part (e.g., echo }, echo }hello)
const bashCloseBraceWordPartParser: Parser<BashWordPartLiteral, string> = promiseCompose(
	createExactSequenceParser('}'),
	() => ({
		type: 'literal' as const,
		value: '}',
	}),
);

// Escape sequence outside quotes: backslash followed by any character
const bashEscapeParser: Parser<BashWordPartLiteral, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('\\'),
		createElementParser<string>(),
	]),
	([, ch]) => ({ type: 'literal' as const, value: ch }),
);

// Word part for use inside ${...} operands (uses literal parser that excludes } from continuation)
const bashBracedVarWordPartParser: Parser<BashWordPart, string> = createDisjunctionParser([
	bashAnsiCQuotedParser,
	bashSingleQuotedParser,
	bashDoubleQuotedParser,
	bashBracedVariableParser,
	bashArithmeticExpansionParser,
	bashCommandSubstitutionParser,
	bashBacktickSubstitutionParser,
	bashSimpleVariableParser,
	bashEscapeParser,
	bashBracedVarLiteralWordPartParser,
	bashBareDollarParser,
]);

const bashBracedVarWordParser: Parser<BashWord, string> = createObjectParser({
	parts: createNonEmptyArrayParser(bashBracedVarWordPartParser),
});

// Word part (any part of a word, } excluded from first position so brace groups work)
const bashWordPartParser: Parser<BashWordPart, string> = createDisjunctionParser([
	bashAnsiCQuotedParser,
	bashSingleQuotedParser,
	bashDoubleQuotedParser,
	bashBracedVariableParser,
	bashArithmeticExpansionParser,
	bashCommandSubstitutionParser,
	bashBacktickSubstitutionParser,
	bashSimpleVariableParser,
	bashProcessSubstitutionParser,
	bashEscapeParser,
	bashBraceWordPartParser,
	bashOpenBraceWordPartParser,
	bashLiteralWordPartParser,
	bashBareDollarParser,
]);

// Word part including } as a starter (for argument positions where } is not reserved)
const bashArgWordPartParser: Parser<BashWordPart, string> = createDisjunctionParser([
	bashAnsiCQuotedParser,
	bashSingleQuotedParser,
	bashDoubleQuotedParser,
	bashBracedVariableParser,
	bashArithmeticExpansionParser,
	bashCommandSubstitutionParser,
	bashBacktickSubstitutionParser,
	bashSimpleVariableParser,
	bashProcessSubstitutionParser,
	bashEscapeParser,
	bashBraceWordPartParser,
	bashOpenBraceWordPartParser,
	bashCloseBraceWordPartParser,
	bashLiteralWordPartParser,
	bashBareDollarParser,
]);

// Word (sequence of word parts)
export const bashWordParser: Parser<BashWord, string> = createObjectParser({
	parts: createNonEmptyArrayParser(bashWordPartParser),
});

// Argument word (allows } as first character)
const bashArgWordParser: Parser<BashWord, string> = createObjectParser({
	parts: createNonEmptyArrayParser(bashArgWordPartParser),
});

setParserName(bashWordParser, 'bashWordParser');

// Assignment name: identifier followed by =
const bashAssignmentNameParser: Parser<string, string> = promiseCompose(
	createTupleParser([
		bashIdentifierParser,
		createExactSequenceParser('='),
	]),
	([name]) => name,
);

// Assignment: NAME=value or NAME=
const bashAssignmentParser: Parser<BashAssignment, string> = createObjectParser({
	name: bashAssignmentNameParser,
	value: createOptionalParser(bashWordParser),
});

// Redirect operators
const bashRedirectOperatorParser: Parser<BashRedirect['operator'], string> = createDisjunctionParser([
	promiseCompose(createExactSequenceParser('>>'), () => '>>' as const),
	promiseCompose(createExactSequenceParser('>&'), () => '>&' as const),
	promiseCompose(createExactSequenceParser('>|'), () => '>|' as const),
	promiseCompose(createExactSequenceParser('>'), () => '>' as const),
	promiseCompose(createExactSequenceParser('<<<'), () => '<<<' as const),
	promiseCompose(createExactSequenceParser('<<'), () => '<<' as const),
	promiseCompose(createExactSequenceParser('<&'), () => '<&' as const),
	promiseCompose(createExactSequenceParser('<'), () => '<' as const),
]);

// File descriptor number
const bashFdParser: Parser<number, string> = promiseCompose(
	bashDigitsParser,
	digits => Number.parseInt(digits, 10),
);

// Heredoc: <<DELIM\ncontent\nDELIM or <<'DELIM'\ncontent\nDELIM or <<"DELIM"\ncontent\nDELIM
const bashHereDocParser: Parser<BashHereDoc, string> = async (parserContext) => {
	// Parse the delimiter - may be quoted or unquoted
	let delimiter = '';
	let quoted = false;

	const firstChar = await parserContext.peek(0);

	if (firstChar === "'") {
		// Single-quoted delimiter: <<'EOF'
		quoted = true;
		parserContext.skip(1);
		let ch = await parserContext.peek(0);
		while (ch !== undefined && ch !== "'") {
			delimiter += ch;
			parserContext.skip(1);
			ch = await parserContext.peek(0);
		}

		parserContext.skip(1); // consume closing quote
	} else if (firstChar === '"') {
		// Double-quoted delimiter: <<"EOF"
		quoted = true;
		parserContext.skip(1);
		let ch = await parserContext.peek(0);
		while (ch !== undefined && ch !== '"') {
			delimiter += ch;
			parserContext.skip(1);
			ch = await parserContext.peek(0);
		}

		parserContext.skip(1); // consume closing quote
	} else {
		// Unquoted delimiter
		let ch = await parserContext.peek(0);
		while (ch !== undefined && ch !== '\n' && ch !== ' ' && ch !== '\t') {
			delimiter += ch;
			parserContext.skip(1);
			ch = await parserContext.peek(0);
		}
	}

	// Consume the newline after the delimiter
	const newline = await parserContext.peek(0);
	if (newline === '\n') {
		parserContext.skip(1);
	}

	// Read lines until we find one that is exactly the delimiter
	let content = '';
	let currentLine = '';
	for (;;) {
		const ch = await parserContext.peek(0);
		if (ch === undefined) {
			break;
		}

		if (ch === '\n') {
			if (currentLine === delimiter) {
				parserContext.skip(1); // consume the newline after delimiter
				break;
			}

			content += currentLine + '\n';
			currentLine = '';
			parserContext.skip(1);
			continue;
		}

		currentLine += ch;
		parserContext.skip(1);
	}

	// Handle case where delimiter is at EOF without trailing newline
	if (currentLine === delimiter) {
		// delimiter found at EOF, content is complete
	} else if (currentLine.length > 0) {
		content += currentLine;
	}

	return {
		type: 'hereDoc' as const,
		delimiter,
		content,
		quoted,
	};
};

// Redirect: [n]op word (or heredoc for << operator)
const bashRedirectParser: Parser<BashRedirect, string> = async (parserContext) => {
	const fd = await createOptionalParser(bashFdParser)(parserContext);
	const operator = await bashRedirectOperatorParser(parserContext);
	await bashOptionalInlineWhitespaceParser(parserContext);

	if (operator === '<<') {
		const target = await bashHereDocParser(parserContext);
		return { fd, operator, target };
	}

	const target = await bashWordParser(parserContext);
	return { fd, operator, target };
};

// Word with optional trailing whitespace - for use in arrays
const bashWordWithWhitespaceParser: Parser<BashWord, string> = promiseCompose(
	createTupleParser([
		bashWordParser,
		bashOptionalInlineWhitespaceParser,
	]),
	([word]) => word,
);

// Arg word (allows }) with optional trailing whitespace
const bashArgWordWithWhitespaceParser: Parser<BashWord, string> = promiseCompose(
	createTupleParser([
		bashArgWordParser,
		bashOptionalInlineWhitespaceParser,
	]),
	([word]) => word,
);

// Redirect with optional trailing whitespace
const bashRedirectWithWhitespaceParser: Parser<BashRedirect, string> = promiseCompose(
	createTupleParser([
		bashRedirectParser,
		bashOptionalInlineWhitespaceParser,
	]),
	([redirect]) => redirect,
);

// Word or redirect for argument position (} allowed)
const bashArgWordOrRedirectParser: Parser<{ type: 'word'; word: BashWord } | { type: 'redirect'; redirect: BashRedirect }, string> = createDisjunctionParser([
	createObjectParser({ type: 'redirect' as const, redirect: bashRedirectWithWhitespaceParser }),
	createObjectParser({ type: 'word' as const, word: bashArgWordWithWhitespaceParser }),
]);

// Simple command: [assignments] [name] [args] [redirects]
export const bashSimpleCommandParser: Parser<BashSimpleCommand, string> = async (parserContext) => {
	// Parse assignments at the start
	const assignmentsParser = createArrayParser(promiseCompose(
		createTupleParser([
			bashAssignmentParser,
			bashOptionalInlineWhitespaceParser,
		]),
		([assignment]) => assignment,
	));
	const assignments = await assignmentsParser(parserContext);

	// Parse leading redirects before command name
	const leadingRedirectsParser = createArrayParser(bashRedirectWithWhitespaceParser);
	const leadingRedirects = await leadingRedirectsParser(parserContext);

	// Parse command name (} not allowed here, so brace group closing works)
	const name = await createOptionalParser(bashWordWithWhitespaceParser)(parserContext);

	// Only parse args if we have a command name
	const args: BashWord[] = [];
	const redirects: BashRedirect[] = [...leadingRedirects];

	if (name !== undefined) {
		const argItems = await createArrayParser(bashArgWordOrRedirectParser)(parserContext);
		for (const item of argItems) {
			if (item.type === 'word') {
				args.push(item.word);
			} else {
				redirects.push(item.redirect);
			}
		}
	}

	return {
		type: 'simple' as const,
		name,
		args,
		redirects,
		assignments,
	};
};

setParserName(bashSimpleCommandParser, 'bashSimpleCommandParser');

// Subshell: ( command )
const bashSubshellParser: Parser<BashSubshell, string> = createObjectParser({
	type: 'subshell' as const,
	_open: createExactSequenceParser('('),
	_ws1: bashOptionalInlineWhitespaceParser,
	body: createParserAccessorParser(() => bashCommandParser),
	_ws2: bashOptionalInlineWhitespaceParser,
	_close: createExactSequenceParser(')'),
});

setParserName(bashSubshellParser, 'bashSubshellParser');

// Brace group: { command; }
const bashBraceGroupParser: Parser<BashBraceGroup, string> = createObjectParser({
	type: 'braceGroup' as const,
	_open: createExactSequenceParser('{'),
	_ws1: bashInlineWhitespaceParser,
	body: createParserAccessorParser(() => bashCommandParser),
	_ws2: bashOptionalInlineWhitespaceParser,
	_semi: createOptionalParser(createExactSequenceParser(';')),
	_ws3: bashOptionalInlineWhitespaceParser,
	_close: createExactSequenceParser('}'),
});

setParserName(bashBraceGroupParser, 'bashBraceGroupParser');

// Command unit: simple command, subshell, or brace group
const bashCommandUnitParser: Parser<BashCommandUnit, string> = createDisjunctionParser([
	bashSubshellParser,
	bashBraceGroupParser,
	bashSimpleCommandParser,
]);

setParserName(bashCommandUnitParser, 'bashCommandUnitParser');

// Single pipe (not ||) - matches | only when not followed by another |
const bashSinglePipeParser: Parser<string, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('|'),
		createNegativeLookaheadParser(createExactSequenceParser('|')),
	]),
	() => '|',
);

// Pipeline: [!] cmd [| cmd]...
const bashPipelineParser: Parser<BashPipeline, string> = promiseCompose(
	createTupleParser([
		createOptionalParser(promiseCompose(
			createTupleParser([
				createExactSequenceParser('!'),
				bashInlineWhitespaceParser,
			]),
			() => true,
		)),
		createSeparatedNonEmptyArrayParser(
			bashCommandUnitParser,
			createTupleParser([
				bashOptionalInlineWhitespaceParser,
				bashSinglePipeParser,
				bashOptionalInlineWhitespaceParser,
			]),
		),
	]),
	([negated, commands]) => ({
		type: 'pipeline' as const,
		negated: negated ?? false,
		commands,
	}),
);

setParserName(bashPipelineParser, 'bashPipelineParser');

// Non-newline character
const bashNonNewlineCharParser: Parser<string, string> = promiseCompose(
	createTupleParser([
		createNegativeLookaheadParser(createExactSequenceParser('\n')),
		createElementParser<string>(),
	]),
	([, ch]) => ch,
);

// Comment: # through end of line (not consuming the newline)
const bashCommentParser: Parser<string, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('#'),
		createArrayParser(bashNonNewlineCharParser),
	]),
	([hash, chars]) => hash + chars.join(''),
);

// Blank line filler: whitespace, newlines, and comments
const bashBlankLineFillerParser: Parser<void, string> = promiseCompose(
	createArrayParser(createDisjunctionParser([
		bashInlineWhitespaceUnitParser,
		promiseCompose(createExactSequenceParser('\n'), () => '\n'),
		bashCommentParser,
	])),
	() => {},
);

// Newline separator: consumes a newline plus any following blank lines, comments, and whitespace
// This allows multi-line scripts with blank lines and mid-script comments
const bashNewlineSeparatorParser: Parser<'\n', string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('\n'),
		bashBlankLineFillerParser,
	]),
	() => '\n' as const,
);

// Command list separator
const bashListSeparatorParser: Parser<'&&' | '||' | ';' | '&' | '\n', string> = createDisjunctionParser([
	promiseCompose(createExactSequenceParser('&&'), () => '&&' as const),
	promiseCompose(createExactSequenceParser('||'), () => '||' as const),
	promiseCompose(createExactSequenceParser(';'), () => ';' as const),
	promiseCompose(createExactSequenceParser('&'), () => '&' as const),
	bashNewlineSeparatorParser,
]);

// Command list: pipeline [sep pipeline]...
const bashCommandListParser: Parser<BashCommandList, string> = promiseCompose(
	createTupleParser([
		bashPipelineParser,
		createArrayParser(createObjectParser({
			_ws1: bashOptionalInlineWhitespaceParser,
			separator: bashListSeparatorParser,
			_ws2: bashOptionalInlineWhitespaceParser,
			pipeline: bashPipelineParser,
		})),
		createOptionalParser(promiseCompose(
			createTupleParser([
				bashOptionalInlineWhitespaceParser,
				bashListSeparatorParser,
			]),
			([, separator]) => separator,
		)),
	]),
	([firstPipeline, rest, trailingSeparator]) => {
		const entries: BashCommandList['entries'] = [];

		if (rest.length === 0) {
			entries.push({
				pipeline: firstPipeline,
				separator: trailingSeparator ?? undefined,
			});
		} else {
			entries.push({
				pipeline: firstPipeline,
				separator: rest[0].separator,
			});

			for (let i = 0; i < rest.length - 1; i++) {
				entries.push({
					pipeline: rest[i].pipeline,
					separator: rest[i + 1].separator,
				});
			}

			entries.push({
				pipeline: rest[rest.length - 1].pipeline,
				separator: trailingSeparator ?? undefined,
			});
		}

		return {
			type: 'list' as const,
			entries,
		};
	},
);

setParserName(bashCommandListParser, 'bashCommandListParser');

// Top-level command parser
export const bashCommandParser: Parser<BashCommand, string> = bashCommandListParser;

setParserName(bashCommandParser, 'bashCommandParser');

// Trailing whitespace/comments/blank lines at end of script
const bashTrailingWhitespaceAndCommentsParser: Parser<undefined, string> = promiseCompose(
	bashBlankLineFillerParser,
	() => undefined,
);

// Script parser (handles leading/trailing whitespace and comments)
export const bashScriptParser: Parser<BashCommand, string> = promiseCompose(
	createTupleParser([
		bashOptionalInlineWhitespaceParser,
		bashCommandParser,
		bashTrailingWhitespaceAndCommentsParser,
	]),
	([, command]) => command,
);

setParserName(bashScriptParser, 'bashScriptParser');
