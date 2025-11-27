import { type Parser, setParserName } from './parser.js';
import { createUnionParser } from './unionParser.js';
import { createExactSequenceParser } from './exactSequenceParser.js';
import { promiseCompose } from './promiseCompose.js';
import { createTupleParser } from './tupleParser.js';
import { createDisjunctionParser } from './disjunctionParser.js';
import { createArrayParser } from './arrayParser.js';
import { createParserAccessorParser } from './parserAccessorParser.js';
import { createOptionalParser } from './optionalParser.js';
import { createRegExpParser } from './regexpParser.js';
import { createNonEmptyArrayParser } from './nonEmptyArrayParser.js';
import { createSeparatedNonEmptyArrayParser } from './separatedNonEmptyArrayParser.js';
import {
	type BashWord,
	type BashWordPart,
	type BashWordPartLiteral,
	type BashWordPartSingleQuoted,
	type BashWordPartDoubleQuoted,
	type BashWordPartVariable,
	type BashWordPartCommandSubstitution,
	type BashWordPartBacktickSubstitution,
	type BashSimpleCommand,
	type BashSubshell,
	type BashBraceGroup,
	type BashCommandUnit,
	type BashPipeline,
	type BashCommandList,
	type BashRedirect,
	type BashAssignment,
	type BashCommand,
} from './bash.js';

// Whitespace (spaces and tabs, not newlines - those are significant)
const bashInlineWhitespaceParser: Parser<string, string> = promiseCompose(
	createRegExpParser(/[ \t]+/),
	match => match[0],
);

const bashOptionalInlineWhitespaceParser: Parser<string, string> = promiseCompose(
	createRegExpParser(/[ \t]*/),
	match => match[0],
);

// Newline
const bashNewlineParser: Parser<string, string> = promiseCompose(
	createRegExpParser(/\n/),
	match => match[0],
);

// Word characters (unquoted, no special chars)
// Note: {} are excluded so brace groups are parsed correctly
const bashUnquotedWordCharsParser: Parser<string, string> = promiseCompose(
	createRegExpParser(/[^\s\n|&;<>(){}$`"'\\#]+/),
	match => match[0],
);

// Single quoted string: '...'
const bashSingleQuotedParser: Parser<BashWordPartSingleQuoted, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser("'"),
		promiseCompose(
			createRegExpParser(/[^']*/),
			match => match[0],
		),
		createExactSequenceParser("'"),
	]),
	([, value]) => ({
		type: 'singleQuoted' as const,
		value,
	}),
);

// Variable name
const bashVariableNameParser: Parser<string, string> = promiseCompose(
	createRegExpParser(/[a-zA-Z_][a-zA-Z0-9_]*|[0-9]+|[@*#?$!-]/),
	match => match[0],
);

// Simple variable: $var
const bashSimpleVariableParser: Parser<BashWordPartVariable, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('$'),
		bashVariableNameParser,
	]),
	([, name]) => ({
		type: 'variable' as const,
		name,
	}),
);

// Command substitution: $(...)
const bashCommandSubstitutionParser: Parser<BashWordPartCommandSubstitution, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('$('),
		bashOptionalInlineWhitespaceParser,
		createParserAccessorParser(() => bashCommandParser),
		bashOptionalInlineWhitespaceParser,
		createExactSequenceParser(')'),
	]),
	([, , command]) => ({
		type: 'commandSubstitution' as const,
		command,
	}),
);

// Backtick substitution: `...`
const bashBacktickSubstitutionParser: Parser<BashWordPartBacktickSubstitution, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('`'),
		createParserAccessorParser(() => bashCommandParser),
		createExactSequenceParser('`'),
	]),
	([, command]) => ({
		type: 'backtickSubstitution' as const,
		command,
	}),
);

// Double quoted string parts (inside "...")
const bashDoubleQuotedPartParser: Parser<BashWordPart, string> = createDisjunctionParser([
	bashSimpleVariableParser,
	bashCommandSubstitutionParser,
	bashBacktickSubstitutionParser,
	// Escape sequences in double quotes
	promiseCompose(
		createRegExpParser(/\\[\\$`"!\n]/),
		match => ({
			type: 'literal' as const,
			value: match[0].slice(1),
		}),
	),
	// Literal text (no special chars)
	promiseCompose(
		createRegExpParser(/[^$`"\\]+/),
		match => ({
			type: 'literal' as const,
			value: match[0],
		}),
	),
]);

// Double quoted string: "..."
const bashDoubleQuotedParser: Parser<BashWordPartDoubleQuoted, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('"'),
		createArrayParser(bashDoubleQuotedPartParser),
		createExactSequenceParser('"'),
	]),
	([, parts]) => ({
		type: 'doubleQuoted' as const,
		parts,
	}),
);

// Literal word part (unquoted)
const bashLiteralWordPartParser: Parser<BashWordPartLiteral, string> = promiseCompose(
	bashUnquotedWordCharsParser,
	value => ({
		type: 'literal' as const,
		value,
	}),
);

// Escape sequence outside quotes
const bashEscapeParser: Parser<BashWordPartLiteral, string> = promiseCompose(
	createRegExpParser(/\\./),
	match => ({
		type: 'literal' as const,
		value: match[0].slice(1),
	}),
);

// Word part (any part of a word)
const bashWordPartParser: Parser<BashWordPart, string> = createDisjunctionParser([
	bashSingleQuotedParser,
	bashDoubleQuotedParser,
	bashCommandSubstitutionParser,
	bashBacktickSubstitutionParser,
	bashSimpleVariableParser,
	bashEscapeParser,
	bashLiteralWordPartParser,
]);

// Word (sequence of word parts)
export const bashWordParser: Parser<BashWord, string> = promiseCompose(
	createNonEmptyArrayParser(bashWordPartParser),
	parts => ({ parts }),
);

setParserName(bashWordParser, 'bashWordParser');

// Assignment: NAME=value or NAME=
const bashAssignmentParser: Parser<BashAssignment, string> = promiseCompose(
	createTupleParser([
		promiseCompose(
			createRegExpParser(/[a-zA-Z_][a-zA-Z0-9_]*=/),
			match => match[0].slice(0, -1),
		),
		createOptionalParser(bashWordParser),
	]),
	([name, value]) => ({
		name,
		value: value ?? undefined,
	}),
);

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

// Redirect: [n]op word
const bashRedirectParser: Parser<BashRedirect, string> = promiseCompose(
	createTupleParser([
		createOptionalParser(promiseCompose(
			createRegExpParser(/[0-9]+/),
			match => Number.parseInt(match[0], 10),
		)),
		bashRedirectOperatorParser,
		bashOptionalInlineWhitespaceParser,
		bashWordParser,
	]),
	([fd, operator, , target]) => ({
		fd: fd ?? undefined,
		operator,
		target,
	}),
);

// Word with optional trailing whitespace - for use in arrays
const bashWordWithWhitespaceParser: Parser<BashWord, string> = promiseCompose(
	createTupleParser([
		bashWordParser,
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

// Word or redirect - for interleaved parsing in simple commands
const bashWordOrRedirectParser: Parser<{ type: 'word'; word: BashWord } | { type: 'redirect'; redirect: BashRedirect }, string> = createDisjunctionParser([
	promiseCompose(bashRedirectWithWhitespaceParser, redirect => ({ type: 'redirect' as const, redirect })),
	promiseCompose(bashWordWithWhitespaceParser, word => ({ type: 'word' as const, word })),
]);

// Simple command: [assignments] [name] [args] [redirects]
export const bashSimpleCommandParser: Parser<BashSimpleCommand, string> = promiseCompose(
	createTupleParser([
		// Assignments at the start
		createArrayParser(promiseCompose(
			createTupleParser([
				bashAssignmentParser,
				bashOptionalInlineWhitespaceParser,
			]),
			([assignment]) => assignment,
		)),
		// Command name, args, and redirects (interleaved)
		createArrayParser(bashWordOrRedirectParser),
	]),
	([assignments, items]) => {
		const words: BashWord[] = [];
		const redirects: BashRedirect[] = [];

		for (const item of items) {
			if (item.type === 'word') {
				words.push(item.word);
			} else {
				redirects.push(item.redirect);
			}
		}

		const [name, ...args] = words;

		return {
			type: 'simple' as const,
			name,
			args,
			redirects,
			assignments,
		};
	},
);

setParserName(bashSimpleCommandParser, 'bashSimpleCommandParser');

// Subshell: ( command )
const bashSubshellParser: Parser<BashSubshell, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('('),
		bashOptionalInlineWhitespaceParser,
		createParserAccessorParser(() => bashCommandParser),
		bashOptionalInlineWhitespaceParser,
		createExactSequenceParser(')'),
	]),
	([, , body]) => ({
		type: 'subshell' as const,
		body,
	}),
);

setParserName(bashSubshellParser, 'bashSubshellParser');

// Brace group: { command; }
const bashBraceGroupParser: Parser<BashBraceGroup, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('{'),
		bashInlineWhitespaceParser,
		createParserAccessorParser(() => bashCommandParser),
		bashOptionalInlineWhitespaceParser,
		createOptionalParser(createExactSequenceParser(';')),
		bashOptionalInlineWhitespaceParser,
		createExactSequenceParser('}'),
	]),
	([, , body]) => ({
		type: 'braceGroup' as const,
		body,
	}),
);

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
	createRegExpParser(/\|(?!\|)/),
	match => match[0],
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

// Command list separator
const bashListSeparatorParser: Parser<'&&' | '||' | ';' | '&' | '\n', string> = createDisjunctionParser([
	promiseCompose(createExactSequenceParser('&&'), () => '&&' as const),
	promiseCompose(createExactSequenceParser('||'), () => '||' as const),
	promiseCompose(createExactSequenceParser(';'), () => ';' as const),
	promiseCompose(createExactSequenceParser('&'), () => '&' as const),
	promiseCompose(bashNewlineParser, () => '\n' as const),
]);

// Command list: pipeline [sep pipeline]...
const bashCommandListParser: Parser<BashCommandList, string> = promiseCompose(
	createTupleParser([
		bashPipelineParser,
		createArrayParser(promiseCompose(
			createTupleParser([
				bashOptionalInlineWhitespaceParser,
				bashListSeparatorParser,
				bashOptionalInlineWhitespaceParser,
				bashPipelineParser,
			]),
			([, separator, , pipeline]) => ({ separator, pipeline }),
		)),
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

// Script parser (handles leading/trailing whitespace)
export const bashScriptParser: Parser<BashCommand, string> = promiseCompose(
	createTupleParser([
		bashOptionalInlineWhitespaceParser,
		bashCommandParser,
		bashOptionalInlineWhitespaceParser,
	]),
	([, command]) => command,
);

setParserName(bashScriptParser, 'bashScriptParser');
