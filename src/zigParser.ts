import { type Parser, setParserName } from './parser.js';
import { createUnionParser } from './unionParser.js';
import { createExactSequenceParser } from './exactSequenceParser.js';
import { promiseCompose } from './promiseCompose.js';
import { createTupleParser } from './tupleParser.js';
import { createDisjunctionParser } from './disjunctionParser.js';
import { createArrayParser } from './arrayParser.js';
import { createOptionalParser } from './optionalParser.js';
import { createRegExpParser } from './regexpParser.js';
import { createSeparatedNonEmptyArrayParser } from './separatedNonEmptyArrayParser.js';
import { createObjectParser } from './objectParser.js';
import { createNonEmptyArrayParser } from './nonEmptyArrayParser.js';
import { createParserAccessorParser } from './parserAccessorParser.js';
import { unescapeZigString } from './stringEscapes.js';
import {
	type ZigExpression,
	type ZigTypeExpression,
	type ZigStatement,
	type ZigBlockExpr,
	type ZigFnParam,
	type ZigFnDecl,
	type ZigVarDecl,
	type ZigTestDecl,
	type ZigUsingnamespaceDecl,
	type ZigContainerMember,
	type ZigContainerField,
	type ZigRoot,
} from './zig.js';

// Whitespace (spaces, tabs, newlines)
const zigWhitespaceParser: Parser<string, string> = promiseCompose(
	createRegExpParser(/\s+/),
	match => match[0],
);

// Line comment: // ...
const zigLineCommentParser: Parser<string, string> = promiseCompose(
	createRegExpParser(/\/\/[^\n]*/),
	match => match[0],
);

// Whitespace or comment
const zigWhitespaceOrCommentParser: Parser<string, string> = createUnionParser([
	zigWhitespaceParser,
	zigLineCommentParser,
]);

// Optional whitespace/comments (skippable)
const zigSkippableParser: Parser<unknown, string> = createArrayParser(zigWhitespaceOrCommentParser);

setParserName(zigSkippableParser, 'zigSkippableParser');

// Mandatory whitespace (at least one whitespace or comment)
const zigMandatorySkipParser: Parser<unknown, string> = createNonEmptyArrayParser(zigWhitespaceOrCommentParser);

setParserName(zigMandatorySkipParser, 'zigMandatorySkipParser');

// Keywords
const zigKeywords = new Set([
	'addrspace', 'align', 'allowzero', 'and', 'anyframe', 'anytype',
	'asm', 'async', 'await', 'break', 'callconv', 'catch', 'comptime',
	'const', 'continue', 'defer', 'else', 'enum', 'errdefer', 'error',
	'export', 'extern', 'false', 'fn', 'for', 'if', 'inline',
	'linksection', 'noalias', 'nosuspend', 'null', 'opaque', 'or',
	'orelse', 'packed', 'pub', 'resume', 'return', 'struct',
	'suspend', 'switch', 'test', 'threadlocal', 'true', 'try',
	'undefined', 'union', 'unreachable', 'var', 'volatile', 'while',
]);

// Identifier: [a-zA-Z_][a-zA-Z0-9_]* (not a keyword) or @"string"
const zigIdentifierParser: Parser<string, string> = createDisjunctionParser([
	promiseCompose(
		createRegExpParser(/@"(?:[^"\\]|\\.)*"/),
		match => match[0],
	),
	promiseCompose(
		createRegExpParser(/[a-zA-Z_][a-zA-Z0-9_]*/),
		match => {
			if (zigKeywords.has(match[0])) {
				throw Object.assign(
					new Error(`Expected identifier, got keyword "${match[0]}"`),
					{ depth: 0, position: 0, furthestReadPosition: 0, furthestPeekedPosition: 0 },
				);
			}
			return match[0];
		},
	),
]);

setParserName(zigIdentifierParser, 'zigIdentifierParser');

// Keyword parser helper
function zigKeyword(kw: string): Parser<string, string> {
	return promiseCompose(
		createRegExpParser(new RegExp(kw + '(?![a-zA-Z0-9_])')),
		match => match[0],
	);
}

// Literals
const zigIntegerLiteralParser: Parser<ZigExpression, string> = promiseCompose(
	createRegExpParser(/0x[0-9a-fA-F][0-9a-fA-F_]*|0o[0-7][0-7_]*|0b[01][01_]*|[0-9][0-9_]*/),
	match => ({
		type: 'IntegerLiteral' as const,
		value: match[0],
	}),
);

setParserName(zigIntegerLiteralParser, 'zigIntegerLiteralParser');

const zigFloatLiteralParser: Parser<ZigExpression, string> = promiseCompose(
	createRegExpParser(/[0-9][0-9_]*\.[0-9][0-9_]*(?:[eE][+-]?[0-9][0-9_]*)?|[0-9][0-9_]*[eE][+-]?[0-9][0-9_]*|0x[0-9a-fA-F][0-9a-fA-F_]*\.[0-9a-fA-F][0-9a-fA-F_]*(?:[pP][+-]?[0-9][0-9_]*)?|0x[0-9a-fA-F][0-9a-fA-F_]*[pP][+-]?[0-9][0-9_]*/),
	match => ({
		type: 'FloatLiteral' as const,
		value: match[0],
	}),
);

setParserName(zigFloatLiteralParser, 'zigFloatLiteralParser');

const zigStringLiteralParser: Parser<ZigExpression, string> = promiseCompose(
	createRegExpParser(/"(?:[^"\\]|\\.)*"/),
	match => ({
		type: 'StringLiteral' as const,
		value: unescapeZigString(match[0].slice(1, -1)),
	}),
);

setParserName(zigStringLiteralParser, 'zigStringLiteralParser');

const zigMultilineStringLiteralParser: Parser<ZigExpression, string> = promiseCompose(
	createRegExpParser(/(?:\\\\[^\n]*\n?)+/),
	match => ({
		type: 'MultilineStringLiteral' as const,
		value: match[0],
	}),
);

setParserName(zigMultilineStringLiteralParser, 'zigMultilineStringLiteralParser');

const zigCharLiteralParser: Parser<ZigExpression, string> = promiseCompose(
	createRegExpParser(/'(?:[^'\\]|\\.)*'/),
	match => ({
		type: 'CharLiteral' as const,
		value: unescapeZigString(match[0].slice(1, -1)),
	}),
);

setParserName(zigCharLiteralParser, 'zigCharLiteralParser');

const zigEnumLiteralParser: Parser<ZigExpression, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('.'),
		zigIdentifierParser,
	]),
	([, name]) => ({
		type: 'EnumLiteral' as const,
		name,
	}),
);

setParserName(zigEnumLiteralParser, 'zigEnumLiteralParser');

// Forward references via accessor parsers
const zigExpressionParser: Parser<ZigExpression, string> = createParserAccessorParser(() => zigExpressionParserImpl);
const zigTypeExprParser: Parser<ZigExpression, string> = createParserAccessorParser(() => zigErrorUnionExprParser);
const zigStatementParser: Parser<ZigStatement, string> = createParserAccessorParser(() => zigStatementParserImpl);
const zigBlockExprParser: Parser<ZigBlockExpr, string> = createParserAccessorParser(() => zigBlockExprParserImpl);
const zigPrefixExprParser: Parser<ZigExpression, string> = createParserAccessorParser(() => zigPrefixExprParserImpl);
const zigPrimaryExprParser: Parser<ZigExpression, string> = createParserAccessorParser(() => zigPrimaryExprParserImpl);

// Builtin call: @import("std"), @intCast(x), etc.
const zigBuiltinCallExprParser: Parser<ZigExpression, string> = promiseCompose(
	createTupleParser([
		createRegExpParser(/@[a-zA-Z_][a-zA-Z0-9_]*/),
		zigSkippableParser,
		createExactSequenceParser('('),
		zigSkippableParser,
		createOptionalParser(
			createSeparatedNonEmptyArrayParser(
				promiseCompose(
					createTupleParser([
						zigExpressionParser,
						zigSkippableParser,
					]),
					([expr]) => expr,
				),
				promiseCompose(
					createTupleParser([
						createExactSequenceParser(','),
						zigSkippableParser,
					]),
					() => ',',
				),
			),
		),
		zigSkippableParser,
		createOptionalParser(createExactSequenceParser(',')),
		zigSkippableParser,
		createExactSequenceParser(')'),
	]),
	([name, , , , args]) => ({
		type: 'BuiltinCallExpr' as const,
		name: name[0].slice(1),
		args: args ?? [],
	}),
);

setParserName(zigBuiltinCallExprParser, 'zigBuiltinCallExprParser');

// Error set: error{OutOfMemory, ...}
const zigErrorSetExprParser: Parser<ZigExpression, string> = promiseCompose(
	createTupleParser([
		zigKeyword('error'),
		zigSkippableParser,
		createExactSequenceParser('{'),
		zigSkippableParser,
		createOptionalParser(
			createSeparatedNonEmptyArrayParser(
				promiseCompose(
					createTupleParser([
						zigIdentifierParser,
						zigSkippableParser,
					]),
					([name]) => name,
				),
				promiseCompose(
					createTupleParser([
						createExactSequenceParser(','),
						zigSkippableParser,
					]),
					() => ',',
				),
			),
		),
		createOptionalParser(createExactSequenceParser(',')),
		zigSkippableParser,
		createExactSequenceParser('}'),
	]),
	([, , , , names]) => ({
		type: 'ErrorSetExpr' as const,
		names: names ?? [],
	}),
);

setParserName(zigErrorSetExprParser, 'zigErrorSetExprParser');

// Grouped expression: (expr)
const zigGroupedExprParser: Parser<ZigExpression, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('('),
		zigSkippableParser,
		zigExpressionParser,
		zigSkippableParser,
		createExactSequenceParser(')'),
	]),
	([, , inner]) => ({
		type: 'GroupedExpr' as const,
		inner,
	}),
);

setParserName(zigGroupedExprParser, 'zigGroupedExprParser');

// Capture: |name|
const zigCaptureParser: Parser<string, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('|'),
		zigSkippableParser,
		zigIdentifierParser,
		zigSkippableParser,
		createExactSequenceParser('|'),
		zigSkippableParser,
	]),
	([, , name]) => name,
);

setParserName(zigCaptureParser, 'zigCaptureParser');

// If expression: if (cond) |capture| body else |capture| elseBody
const zigIfExprParser: Parser<ZigExpression, string> = promiseCompose(
	createTupleParser([
		zigKeyword('if'),
		zigSkippableParser,
		createExactSequenceParser('('),
		zigSkippableParser,
		zigExpressionParser,
		zigSkippableParser,
		createExactSequenceParser(')'),
		zigSkippableParser,
		createOptionalParser(zigCaptureParser),
		zigExpressionParser,
		zigSkippableParser,
		createOptionalParser(
			promiseCompose(
				createTupleParser([
					zigKeyword('else'),
					zigSkippableParser,
					createOptionalParser(zigCaptureParser),
					zigExpressionParser,
				]),
				([, , capture, body]) => ({ capture, body }),
			),
		),
	]),
	([, , , , condition, , , , capture, body, , elsePart]) => ({
		type: 'IfExpr' as const,
		condition,
		...(capture ? { capture } : {}),
		body,
		...(elsePart?.capture ? { elseCapture: elsePart.capture } : {}),
		...(elsePart ? { elseBody: elsePart.body } : {}),
	}),
);

setParserName(zigIfExprParser, 'zigIfExprParser');

// Switch expression
const zigSwitchProngParser = promiseCompose(
	createTupleParser([
		createDisjunctionParser([
			promiseCompose(
				zigKeyword('else'),
				(): { isElse: boolean; cases: ZigExpression[] } => ({ isElse: true, cases: [] }),
			),
			promiseCompose(
				createSeparatedNonEmptyArrayParser(
					promiseCompose(
						createTupleParser([
							zigExpressionParser,
							zigSkippableParser,
						]),
						([expr]) => expr,
					),
					promiseCompose(
						createTupleParser([
							createExactSequenceParser(','),
							zigSkippableParser,
						]),
						() => ',',
					),
				),
				(cases): { isElse: boolean; cases: ZigExpression[] } => ({ isElse: false, cases }),
			),
		]),
		zigSkippableParser,
		createExactSequenceParser('=>'),
		zigSkippableParser,
		createOptionalParser(zigCaptureParser),
		zigExpressionParser,
	]),
	([casesInfo, , , , capture, body]) => ({
		type: 'SwitchProng' as const,
		cases: casesInfo.cases,
		isElse: casesInfo.isElse,
		...(capture ? { capture } : {}),
		body,
	}),
);

const zigSwitchExprParser: Parser<ZigExpression, string> = promiseCompose(
	createTupleParser([
		zigKeyword('switch'),
		zigSkippableParser,
		createExactSequenceParser('('),
		zigSkippableParser,
		zigExpressionParser,
		zigSkippableParser,
		createExactSequenceParser(')'),
		zigSkippableParser,
		createExactSequenceParser('{'),
		zigSkippableParser,
		createOptionalParser(
			createSeparatedNonEmptyArrayParser(
				promiseCompose(
					createTupleParser([
						zigSwitchProngParser,
						zigSkippableParser,
					]),
					([prong]) => prong,
				),
				promiseCompose(
					createTupleParser([
						createExactSequenceParser(','),
						zigSkippableParser,
					]),
					() => ',',
				),
			),
		),
		createOptionalParser(createExactSequenceParser(',')),
		zigSkippableParser,
		createExactSequenceParser('}'),
	]),
	([, , , , operand, , , , , , prongs]) => ({
		type: 'SwitchExpr' as const,
		operand,
		prongs: prongs ?? [],
	}),
);

setParserName(zigSwitchExprParser, 'zigSwitchExprParser');

// Struct init: .{ .field = value, ... }
const zigAnonStructInitParser: Parser<ZigExpression, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('.'),
		zigSkippableParser,
		createExactSequenceParser('{'),
		zigSkippableParser,
		createOptionalParser(
			createSeparatedNonEmptyArrayParser(
				promiseCompose(
					createTupleParser([
						createExactSequenceParser('.'),
						zigIdentifierParser,
						zigSkippableParser,
						createExactSequenceParser('='),
						zigSkippableParser,
						zigExpressionParser,
						zigSkippableParser,
					]),
					([, name, , , , value]) => ({ type: 'StructInitField' as const, name, value }),
				),
				promiseCompose(
					createTupleParser([
						createExactSequenceParser(','),
						zigSkippableParser,
					]),
					() => ',',
				),
			),
		),
		createOptionalParser(createExactSequenceParser(',')),
		zigSkippableParser,
		createExactSequenceParser('}'),
	]),
	([, , , , fields]) => ({
		type: 'StructInitExpr' as const,
		fields: fields ?? [],
	}),
);

setParserName(zigAnonStructInitParser, 'zigAnonStructInitParser');

// Anonymous array init: .{ expr1, expr2, ... }
const zigAnonArrayInitParser: Parser<ZigExpression, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('.'),
		zigSkippableParser,
		createExactSequenceParser('{'),
		zigSkippableParser,
		createOptionalParser(
			createSeparatedNonEmptyArrayParser(
				promiseCompose(
					createTupleParser([
						zigExpressionParser,
						zigSkippableParser,
					]),
					([expr]) => expr,
				),
				promiseCompose(
					createTupleParser([
						createExactSequenceParser(','),
						zigSkippableParser,
					]),
					() => ',',
				),
			),
		),
		createOptionalParser(createExactSequenceParser(',')),
		zigSkippableParser,
		createExactSequenceParser('}'),
	]),
	([, , , , elements]) => ({
		type: 'ArrayInitExpr' as const,
		elements: elements ?? [],
	}),
);

setParserName(zigAnonArrayInitParser, 'zigAnonArrayInitParser');

// Block expression: [label:] { statements... }
const zigBlockExprParserImpl: Parser<ZigBlockExpr, string> = promiseCompose(
	createTupleParser([
		createOptionalParser(
			promiseCompose(
				createTupleParser([
					zigIdentifierParser,
					zigSkippableParser,
					createExactSequenceParser(':'),
					zigSkippableParser,
				]),
				([label]) => label,
			),
		),
		createExactSequenceParser('{'),
		zigSkippableParser,
		createArrayParser(
			promiseCompose(
				createTupleParser([
					zigStatementParser,
					zigSkippableParser,
				]),
				([stmt]) => stmt,
			),
		),
		createExactSequenceParser('}'),
	]),
	([label, , , statements]) => ({
		type: 'BlockExpr' as const,
		...(label ? { label } : {}),
		statements,
	}),
);

setParserName(zigBlockExprParserImpl, 'zigBlockExprParserImpl');

// Try and comptime are handled as prefix operators below

// Identifier expression
const zigIdentifierExprParser: Parser<ZigExpression, string> = promiseCompose(
	zigIdentifierParser,
	name => ({
		type: 'Identifier' as const,
		name,
	}),
);

setParserName(zigIdentifierExprParser, 'zigIdentifierExprParser');

// Forward references for items defined later
const zigFnParamListParserRef: Parser<ZigFnParam[], string> = createParserAccessorParser(() => zigFnParamListParser);
const zigContainerMemberParserRef: Parser<ZigContainerMember, string> = createParserAccessorParser(() => zigContainerMemberParser);

// Function prototype type expression: fn(params) returnType
const zigFnProtoTypeExprParser: Parser<ZigExpression, string> = promiseCompose(
	createTupleParser([
		zigKeyword('fn'),
		zigSkippableParser,
		zigFnParamListParserRef,
		zigSkippableParser,
		zigTypeExprParser,
	]),
	([, , params, , returnType]): ZigExpression => ({
		type: 'FnProtoType' as const,
		params,
		returnType,
	}),
);

setParserName(zigFnProtoTypeExprParser, 'zigFnProtoTypeExprParser');

// Container field: name: type [align(expr)] [= default],
const zigContainerFieldParser: Parser<ZigContainerMember, string> = promiseCompose(
	createTupleParser([
		zigIdentifierParser,
		zigSkippableParser,
		createOptionalParser(promiseCompose(
			createTupleParser([createExactSequenceParser(':'), zigSkippableParser, zigExpressionParser, zigSkippableParser]),
			([, , type_]) => type_,
		)),
		createOptionalParser(promiseCompose(
			createTupleParser([zigKeyword('align'), zigSkippableParser, createExactSequenceParser('('), zigSkippableParser, zigExpressionParser, zigSkippableParser, createExactSequenceParser(')'), zigSkippableParser]),
			([, , , , expr]) => expr,
		)),
		createOptionalParser(promiseCompose(
			createTupleParser([createExactSequenceParser('='), zigSkippableParser, zigExpressionParser, zigSkippableParser]),
			([, , init]) => init,
		)),
		createExactSequenceParser(','),
	]),
	([name, , typeExpr, alignExpr, defaultValue]): ZigContainerMember => ({
		type: 'ContainerField',
		name,
		...(typeExpr !== undefined ? { typeExpr } : {}),
		...(alignExpr !== undefined ? { alignExpr } : {}),
		...(defaultValue !== undefined ? { defaultValue } : {}),
	}),
);

setParserName(zigContainerFieldParser, 'zigContainerFieldParser');

// Anonymous struct expression: struct { members... }
const zigStructExprParser: Parser<ZigExpression, string> = promiseCompose(
	createTupleParser([
		zigKeyword('struct'),
		zigSkippableParser,
		createExactSequenceParser('{'),
		zigSkippableParser,
		createArrayParser(
			promiseCompose(
				createTupleParser([
					createDisjunctionParser([
						zigContainerMemberParserRef,
						zigContainerFieldParser,
					]),
					zigSkippableParser,
				]),
				([member]) => member,
			),
		),
		createExactSequenceParser('}'),
	]),
	([, , , , members]): ZigExpression => ({
		type: 'StructExpr',
		members,
	}),
);

setParserName(zigStructExprParser, 'zigStructExprParser');

// Primary expression impl
const zigPrimaryExprParserImpl: Parser<ZigExpression, string> = createDisjunctionParser([
	zigBuiltinCallExprParser,
	zigStringLiteralParser,
	zigMultilineStringLiteralParser,
	zigCharLiteralParser,
	zigFloatLiteralParser,
	zigIntegerLiteralParser,
	promiseCompose(zigKeyword('true'), (): ZigExpression => ({ type: 'BoolLiteral', value: true })),
	promiseCompose(zigKeyword('false'), (): ZigExpression => ({ type: 'BoolLiteral', value: false })),
	promiseCompose(zigKeyword('null'), (): ZigExpression => ({ type: 'NullLiteral' })),
	promiseCompose(zigKeyword('undefined'), (): ZigExpression => ({ type: 'UndefinedLiteral' })),
	promiseCompose(zigKeyword('unreachable'), (): ZigExpression => ({ type: 'Identifier', name: 'unreachable' })),
	promiseCompose(zigKeyword('anytype'), (): ZigExpression => ({ type: 'Identifier', name: 'anytype' })),
	zigErrorSetExprParser,
	zigIfExprParser,
	zigSwitchExprParser,
	zigAnonStructInitParser,
	zigAnonArrayInitParser,
	zigFnProtoTypeExprParser,
	zigStructExprParser,
	promiseCompose(zigKeyword('type'), (): ZigExpression => ({ type: 'Identifier', name: 'type' })),
	zigBlockExprParser,
	zigGroupedExprParser,
	zigEnumLiteralParser,
	zigIdentifierExprParser,
]);

setParserName(zigPrimaryExprParserImpl, 'zigPrimaryExprParserImpl');

// Suffix operations
type SuffixOp =
	| { kind: 'field'; member: string }
	| { kind: 'call'; args: ZigExpression[] }
	| { kind: 'index'; index: ZigExpression }
	| { kind: 'slice'; start: ZigExpression; end?: ZigExpression; sentinel?: ZigExpression }
	| { kind: 'deref' }
	| { kind: 'unwrap' }
	| { kind: 'structInit'; fields: { type: 'StructInitField'; name: string; value: ZigExpression }[] }
	| { kind: 'arrayInit'; elements: ZigExpression[] };

const zigFieldAccessSuffixParser: Parser<SuffixOp, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('.'),
		zigIdentifierParser,
	]),
	([, member]): SuffixOp => ({ kind: 'field', member }),
);

const zigDerefSuffixParser: Parser<SuffixOp, string> = promiseCompose(
	createExactSequenceParser('.*'),
	(): SuffixOp => ({ kind: 'deref' }),
);

const zigUnwrapSuffixParser: Parser<SuffixOp, string> = promiseCompose(
	createExactSequenceParser('.?'),
	(): SuffixOp => ({ kind: 'unwrap' }),
);

const zigCallSuffixParser: Parser<SuffixOp, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('('),
		zigSkippableParser,
		createOptionalParser(
			createSeparatedNonEmptyArrayParser(
				promiseCompose(
					createTupleParser([
						zigExpressionParser,
						zigSkippableParser,
					]),
					([expr]) => expr,
				),
				promiseCompose(
					createTupleParser([
						createExactSequenceParser(','),
						zigSkippableParser,
					]),
					() => ',',
				),
			),
		),
		createOptionalParser(createExactSequenceParser(',')),
		zigSkippableParser,
		createExactSequenceParser(')'),
	]),
	([, , args]): SuffixOp => ({ kind: 'call', args: args ?? [] }),
);

const zigIndexSuffixParser: Parser<SuffixOp, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('['),
		zigSkippableParser,
		zigExpressionParser,
		zigSkippableParser,
		createOptionalParser(
			promiseCompose(
				createTupleParser([
					createExactSequenceParser('..'),
					zigSkippableParser,
					createOptionalParser(
						promiseCompose(
							createTupleParser([
								zigExpressionParser,
								zigSkippableParser,
							]),
							([expr]) => expr,
						),
					),
				]),
				([, , end]) => end,
			),
		),
		createExactSequenceParser(']'),
	]),
	([, , start, , sliceEnd]): SuffixOp => {
		if (sliceEnd !== undefined) {
			return { kind: 'slice', start, end: sliceEnd || undefined };
		}
		return { kind: 'index', index: start };
	},
);

// Typed struct init suffix: { .field = value, ... }
const zigStructInitSuffixParser: Parser<SuffixOp, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('{'),
		zigSkippableParser,
		createOptionalParser(
			createSeparatedNonEmptyArrayParser(
				promiseCompose(
					createTupleParser([
						createExactSequenceParser('.'),
						zigIdentifierParser,
						zigSkippableParser,
						createExactSequenceParser('='),
						zigSkippableParser,
						zigExpressionParser,
						zigSkippableParser,
					]),
					([, name, , , , value]) => ({ type: 'StructInitField' as const, name, value }),
				),
				promiseCompose(
					createTupleParser([
						createExactSequenceParser(','),
						zigSkippableParser,
					]),
					() => ',',
				),
			),
		),
		createOptionalParser(createExactSequenceParser(',')),
		zigSkippableParser,
		createExactSequenceParser('}'),
	]),
	([, , fields]): SuffixOp => ({ kind: 'structInit', fields: fields ?? [] }),
);

// Typed array init suffix: { expr, expr, ... }
const zigArrayInitSuffixParser: Parser<SuffixOp, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('{'),
		zigSkippableParser,
		createOptionalParser(
			createSeparatedNonEmptyArrayParser(
				promiseCompose(
					createTupleParser([
						zigExpressionParser,
						zigSkippableParser,
					]),
					([expr]) => expr,
				),
				promiseCompose(
					createTupleParser([
						createExactSequenceParser(','),
						zigSkippableParser,
					]),
					() => ',',
				),
			),
		),
		createOptionalParser(createExactSequenceParser(',')),
		zigSkippableParser,
		createExactSequenceParser('}'),
	]),
	([, , elements]): SuffixOp => ({ kind: 'arrayInit', elements: elements ?? [] }),
);

const zigSuffixOpParser: Parser<SuffixOp, string> = createDisjunctionParser([
	zigDerefSuffixParser,
	zigUnwrapSuffixParser,
	zigFieldAccessSuffixParser,
	zigCallSuffixParser,
	zigIndexSuffixParser,
]);

// Postfix expression: primary with suffix operations
const zigPostfixExprParser: Parser<ZigExpression, string> = promiseCompose(
	createTupleParser([
		zigPrimaryExprParser,
		createArrayParser(
			promiseCompose(
				createTupleParser([
					zigSkippableParser,
					zigSuffixOpParser,
				]),
				([, op]) => op,
			),
		),
	]),
	([primary, suffixes]): ZigExpression => {
		let result: ZigExpression = primary;
		for (const suffix of suffixes) {
			switch (suffix.kind) {
				case 'field':
					result = { type: 'FieldAccessExpr', operand: result, member: suffix.member };
					break;
				case 'call':
					result = { type: 'CallExpr', callee: result, args: suffix.args };
					break;
				case 'index':
					result = { type: 'IndexExpr', operand: result, index: suffix.index };
					break;
				case 'slice':
					result = { type: 'SliceExpr', operand: result, start: suffix.start, ...(suffix.end ? { end: suffix.end } : {}), ...(suffix.sentinel ? { sentinel: suffix.sentinel } : {}) };
					break;
				case 'deref':
					result = { type: 'FieldAccessExpr', operand: result, member: '*' };
					break;
				case 'unwrap':
					result = { type: 'FieldAccessExpr', operand: result, member: '?' };
					break;
				case 'structInit':
					result = { type: 'StructInitExpr', operand: result, fields: suffix.fields };
					break;
				case 'arrayInit':
					result = { type: 'ArrayInitExpr', operand: result, elements: suffix.elements };
					break;
			}
		}
		return result;
	},
);

setParserName(zigPostfixExprParser, 'zigPostfixExprParser');

// Pointer/array/slice type prefix: [*]T, [*c]T, []T, [N]T
const zigBracketTypePrefixParser: Parser<ZigExpression, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('['),
		zigSkippableParser,
		createDisjunctionParser([
			promiseCompose(createRegExpParser(/\*c(?![a-zA-Z0-9_])/), () => '*c' as const),
			promiseCompose(createRegExpParser(/\*(?!=)/), () => '*' as const),
			promiseCompose(createExactSequenceParser(''), () => '' as const),
		]),
		zigSkippableParser,
		createOptionalParser(promiseCompose(
			createTupleParser([createExactSequenceParser(':'), zigSkippableParser, zigExpressionParser, zigSkippableParser]),
			([, , sentinel]) => sentinel,
		)),
		createExactSequenceParser(']'),
		zigSkippableParser,
		createOptionalParser(promiseCompose(createTupleParser([zigKeyword('const'), zigMandatorySkipParser]), () => true as const)),
		createOptionalParser(promiseCompose(createTupleParser([zigKeyword('volatile'), zigMandatorySkipParser]), () => true as const)),
		zigPrefixExprParser,
	]),
	([, , kind, , _sentinel, , , _isConst, _isVolatile, child]): ZigExpression => ({
		type: 'PointerType',
		size: kind === '' ? 'slice' : kind === '*' ? 'many' : 'one',
		isConst: _isConst ?? false,
		child,
	}),
);

setParserName(zigBracketTypePrefixParser, 'zigBracketTypePrefixParser');

// Array type prefix: [N]T or [N:sentinel]T
const zigArrayTypePrefixParser: Parser<ZigExpression, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('['),
		zigSkippableParser,
		zigExpressionParser,
		zigSkippableParser,
		createOptionalParser(promiseCompose(
			createTupleParser([createExactSequenceParser(':'), zigSkippableParser, zigExpressionParser, zigSkippableParser]),
			([, , sentinel]) => sentinel,
		)),
		createExactSequenceParser(']'),
		zigSkippableParser,
		zigPrefixExprParser,
	]),
	([, , length, , sentinel, , , child]): ZigExpression => ({
		type: 'ArrayType' as const,
		length,
		...(sentinel !== undefined ? { sentinel } : {}),
		child,
	}),
);

setParserName(zigArrayTypePrefixParser, 'zigArrayTypePrefixParser');

// Optional type prefix: ?T
const zigOptionalTypePrefixParser: Parser<ZigExpression, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('?'),
		zigSkippableParser,
		zigPrefixExprParser,
	]),
	([, , child]): ZigExpression => ({
		type: 'OptionalType',
		child,
	}),
);

// Single pointer prefix: *T, *const T
const zigSinglePointerPrefixParser: Parser<ZigExpression, string> = promiseCompose(
	createTupleParser([
		createRegExpParser(/\*(?![*=])/),
		zigSkippableParser,
		createOptionalParser(promiseCompose(createTupleParser([zigKeyword('const'), zigMandatorySkipParser]), () => true as const)),
		createOptionalParser(promiseCompose(createTupleParser([zigKeyword('volatile'), zigMandatorySkipParser]), () => true as const)),
		zigPrefixExprParser,
	]),
	([, , isConst, _isVolatile, child]): ZigExpression => ({
		type: 'PointerType',
		size: 'one',
		isConst: isConst ?? false,
		child,
	}),
);

// Prefix unary operators
const zigPrefixUnaryParser: Parser<ZigExpression, string> = createDisjunctionParser([
	zigArrayTypePrefixParser,
	zigBracketTypePrefixParser,
	zigOptionalTypePrefixParser,
	zigSinglePointerPrefixParser,
	promiseCompose(
		createTupleParser([
			zigKeyword('try'),
			zigMandatorySkipParser,
			zigPrefixExprParser,
		]),
		([, , operand]): ZigExpression => ({ type: 'TryExpr', operand }),
	),
	promiseCompose(
		createTupleParser([
			zigKeyword('comptime'),
			zigMandatorySkipParser,
			zigPrefixExprParser,
		]),
		([, , operand]): ZigExpression => ({ type: 'ComptimeExpr', operand }),
	),
	promiseCompose(
		createTupleParser([
			createExactSequenceParser('!'),
			zigSkippableParser,
			zigPrefixExprParser,
		]),
		([, , operand]): ZigExpression => ({ type: 'UnaryExpr', operator: '!', operand }),
	),
	promiseCompose(
		createTupleParser([
			createRegExpParser(/-(?![-=>])/),
			zigSkippableParser,
			zigPrefixExprParser,
		]),
		([, , operand]): ZigExpression => ({ type: 'UnaryExpr', operator: '-', operand }),
	),
	promiseCompose(
		createTupleParser([
			createExactSequenceParser('~'),
			zigSkippableParser,
			zigPrefixExprParser,
		]),
		([, , operand]): ZigExpression => ({ type: 'UnaryExpr', operator: '~', operand }),
	),
	promiseCompose(
		createTupleParser([
			createRegExpParser(/&(?![&=])/),
			zigSkippableParser,
			zigPrefixExprParser,
		]),
		([, , operand]): ZigExpression => ({ type: 'UnaryExpr', operator: '&', operand }),
	),
]);

const zigPrefixExprParserImpl: Parser<ZigExpression, string> = createDisjunctionParser([
	zigPrefixUnaryParser,
	zigPostfixExprParser,
]);

setParserName(zigPrefixExprParserImpl, 'zigPrefixExprParserImpl');

// Helper to build left-associative binary expression parser
function createBinaryExprParser(
	operandParser: Parser<ZigExpression, string>,
	operatorParsers: Parser<string, string>[],
): Parser<ZigExpression, string> {
	return promiseCompose(
		createTupleParser([
			operandParser,
			createArrayParser(
				promiseCompose(
					createTupleParser([
						zigSkippableParser,
						createDisjunctionParser(operatorParsers),
						zigSkippableParser,
						operandParser,
					]),
					([, op, , right]) => ({ op, right }),
				),
			),
		]),
		([left, rest]): ZigExpression => {
			let result: ZigExpression = left;
			for (const { op, right } of rest) {
				result = { type: 'BinaryExpr', operator: op as ZigExpression extends { type: 'BinaryExpr'; operator: infer O } ? O : never, left: result, right };
			}
			return result;
		},
	);
}

// Multiplication operators
const zigMultiplyExprParser = createBinaryExprParser(zigPrefixExprParser, [
	promiseCompose(createRegExpParser(/\*\*(?!=)/), match => match[0]),
	promiseCompose(createRegExpParser(/\*(?![*=])/), match => match[0]),
	promiseCompose(createRegExpParser(/\/(?!=)/), match => match[0]),
	promiseCompose(createRegExpParser(/%(?!=)/), match => match[0]),
]);

setParserName(zigMultiplyExprParser, 'zigMultiplyExprParser');

// Addition operators
const zigAddExprParser = createBinaryExprParser(zigMultiplyExprParser, [
	promiseCompose(createRegExpParser(/\+\+(?!=)/), match => match[0]),
	promiseCompose(createRegExpParser(/\+(?![+=])/), match => match[0]),
	promiseCompose(createRegExpParser(/-(?![-=])/), match => match[0]),
]);

setParserName(zigAddExprParser, 'zigAddExprParser');

// Bit shift operators
const zigShiftExprParser = createBinaryExprParser(zigAddExprParser, [
	promiseCompose(createRegExpParser(/<<(?!=)/), match => match[0]),
	promiseCompose(createRegExpParser(/>>(?!=)/), match => match[0]),
]);

setParserName(zigShiftExprParser, 'zigShiftExprParser');

// Bitwise operators
const zigBitwiseExprParser = createBinaryExprParser(zigShiftExprParser, [
	promiseCompose(createRegExpParser(/&(?![&=])/), match => match[0]),
	promiseCompose(createRegExpParser(/\|(?![|=])/), match => match[0]),
	promiseCompose(createRegExpParser(/\^(?!=)/), match => match[0]),
]);

setParserName(zigBitwiseExprParser, 'zigBitwiseExprParser');

// Comparison operators (non-associative)
const zigCompareExprParser: Parser<ZigExpression, string> = promiseCompose(
	createTupleParser([
		zigBitwiseExprParser,
		createOptionalParser(
			promiseCompose(
				createTupleParser([
					zigSkippableParser,
					createDisjunctionParser([
						promiseCompose(createExactSequenceParser('=='), () => '=='),
						promiseCompose(createExactSequenceParser('!='), () => '!='),
						promiseCompose(createRegExpParser(/<=(?!=)/), match => match[0]),
						promiseCompose(createRegExpParser(/>=(?!=)/), match => match[0]),
						promiseCompose(createRegExpParser(/<(?![<=])/), match => match[0]),
						promiseCompose(createRegExpParser(/>(?![>=])/), match => match[0]),
					]),
					zigSkippableParser,
					zigBitwiseExprParser,
				]),
				([, op, , right]) => ({ op, right }),
			),
		),
	]),
	([left, rest]): ZigExpression => {
		if (!rest) return left;
		return { type: 'BinaryExpr', operator: rest.op as ZigExpression extends { type: 'BinaryExpr'; operator: infer O } ? O : never, left, right: rest.right };
	},
);

setParserName(zigCompareExprParser, 'zigCompareExprParser');

// orelse operator
const zigOrelseExprParser = createBinaryExprParser(zigCompareExprParser, [
	zigKeyword('orelse'),
]);

setParserName(zigOrelseExprParser, 'zigOrelseExprParser');

// catch operator
const zigCatchExprParser: Parser<ZigExpression, string> = promiseCompose(
	createTupleParser([
		zigOrelseExprParser,
		createArrayParser(
			promiseCompose(
				createTupleParser([
					zigSkippableParser,
					zigKeyword('catch'),
					zigSkippableParser,
					createOptionalParser(zigCaptureParser),
					zigOrelseExprParser,
				]),
				([, , , _capture, right]) => right,
			),
		),
	]),
	([left, rest]): ZigExpression => {
		let result: ZigExpression = left;
		for (const right of rest) {
			result = { type: 'BinaryExpr', operator: 'catch', left: result, right };
		}
		return result;
	},
);

setParserName(zigCatchExprParser, 'zigCatchExprParser');

// Boolean and
const zigAndExprParser = createBinaryExprParser(zigCatchExprParser, [
	zigKeyword('and'),
]);

setParserName(zigAndExprParser, 'zigAndExprParser');

// Boolean or
const zigOrExprParser = createBinaryExprParser(zigAndExprParser, [
	zigKeyword('or'),
]);

setParserName(zigOrExprParser, 'zigOrExprParser');

// Error union: Type!Type
const zigErrorUnionExprParser: Parser<ZigExpression, string> = promiseCompose(
	createTupleParser([
		zigOrExprParser,
		createOptionalParser(
			promiseCompose(
				createTupleParser([
					zigSkippableParser,
					createRegExpParser(/!(?!=)/),
					zigSkippableParser,
					zigOrExprParser,
				]),
				([, , , right]) => right,
			),
		),
	]),
	([left, right]): ZigExpression => {
		if (!right) return left;
		return { type: 'ErrorUnionType', error: left, payload: right };
	},
);

setParserName(zigErrorUnionExprParser, 'zigErrorUnionExprParser');

// Curly suffix expression: TypeExpr { .field = val, ... } or TypeExpr { val1, val2, ... }
// In Zig grammar, CurlySuffixExpr = TypeExpr ("{" init "}")?
type CurlySuffix =
	| { kind: 'structInit'; fields: { type: 'StructInitField'; name: string; value: ZigExpression }[] }
	| { kind: 'arrayInit'; elements: ZigExpression[] };

const zigCurlySuffixExprParser: Parser<ZigExpression, string> = promiseCompose(
	createTupleParser([
		zigErrorUnionExprParser,
		createOptionalParser(
			promiseCompose(
				createTupleParser([
					zigSkippableParser,
					createDisjunctionParser([
						zigStructInitSuffixParser,
						zigArrayInitSuffixParser,
					]),
				]),
				([, suffix]): CurlySuffix => suffix as CurlySuffix,
			),
		),
	]),
	([expr, suffix]): ZigExpression => {
		if (!suffix) return expr;
		if (suffix.kind === 'structInit') {
			return { type: 'StructInitExpr', operand: expr, fields: suffix.fields };
		}
		return { type: 'ArrayInitExpr', operand: expr, elements: suffix.elements };
	},
);

// Expression impl
const zigExpressionParserImpl: Parser<ZigExpression, string> = zigCurlySuffixExprParser;

setParserName(zigExpressionParserImpl, 'zigExpressionParserImpl');

// Statements

// Variable declaration statement: [pub] [extern] [comptime] [threadlocal] const/var name [: type] [align(expr)] [= init];
const zigVarDeclStmtParser: Parser<ZigStatement, string> = promiseCompose(
	createTupleParser([
		createOptionalParser(promiseCompose(createTupleParser([zigKeyword('pub'), zigMandatorySkipParser]), () => true as const)),
		createOptionalParser(promiseCompose(createTupleParser([zigKeyword('extern'), zigMandatorySkipParser]), () => true as const)),
		createOptionalParser(promiseCompose(createTupleParser([zigKeyword('comptime'), zigMandatorySkipParser]), () => true as const)),
		createOptionalParser(promiseCompose(createTupleParser([zigKeyword('threadlocal'), zigMandatorySkipParser]), () => true as const)),
		createDisjunctionParser([
			promiseCompose(zigKeyword('const'), () => true as const),
			promiseCompose(zigKeyword('var'), () => false as const),
		]),
		zigMandatorySkipParser,
		zigIdentifierParser,
		zigSkippableParser,
		createOptionalParser(promiseCompose(
			createTupleParser([createExactSequenceParser(':'), zigSkippableParser, zigExpressionParser, zigSkippableParser]),
			([, , type_]) => type_,
		)),
		createOptionalParser(promiseCompose(
			createTupleParser([zigKeyword('align'), zigSkippableParser, createExactSequenceParser('('), zigSkippableParser, zigExpressionParser, zigSkippableParser, createExactSequenceParser(')'), zigSkippableParser]),
			([, , , , expr]) => expr,
		)),
		createOptionalParser(promiseCompose(
			createTupleParser([createExactSequenceParser('='), zigSkippableParser, zigExpressionParser, zigSkippableParser]),
			([, , init]) => init,
		)),
		createExactSequenceParser(';'),
	]),
	([isPub, isExtern, isComptime, isThreadlocal, isConst, , name, , typeExpr, alignExpr, initExpr]): ZigStatement => ({
		type: 'VarDecl' as const,
		isConst,
		isPub: isPub ?? false,
		isExtern: isExtern ?? false,
		isComptime: isComptime ?? false,
		isThreadlocal: isThreadlocal ?? false,
		name,
		...(typeExpr !== undefined ? { typeExpr } : {}),
		...(alignExpr !== undefined ? { alignExpr } : {}),
		...(initExpr !== undefined ? { initExpr } : {}),
	}),
);

setParserName(zigVarDeclStmtParser, 'zigVarDeclStmtParser');

// Return statement: return [expr];
const zigReturnStmtParser: Parser<ZigStatement, string> = promiseCompose(
	createTupleParser([
		zigKeyword('return'),
		createOptionalParser(promiseCompose(
			createTupleParser([zigMandatorySkipParser, zigExpressionParser]),
			([, expr]) => expr,
		)),
		zigSkippableParser,
		createExactSequenceParser(';'),
	]),
	([, value]): ZigStatement => ({
		type: 'ReturnStmt',
		...(value !== undefined ? { value } : {}),
	}),
);

setParserName(zigReturnStmtParser, 'zigReturnStmtParser');

// Break statement: break [:label] [value];
const zigBreakStmtParser: Parser<ZigStatement, string> = promiseCompose(
	createTupleParser([
		zigKeyword('break'),
		zigSkippableParser,
		createOptionalParser(promiseCompose(
			createTupleParser([createExactSequenceParser(':'), zigIdentifierParser, zigSkippableParser]),
			([, label]) => label,
		)),
		createOptionalParser(promiseCompose(
			createTupleParser([zigExpressionParser, zigSkippableParser]),
			([expr]) => expr,
		)),
		createExactSequenceParser(';'),
	]),
	([, , label, value]): ZigStatement => ({
		type: 'BreakStmt',
		...(label ? { label } : {}),
		...(value !== undefined ? { value } : {}),
	}),
);

setParserName(zigBreakStmtParser, 'zigBreakStmtParser');

// Continue statement: continue [:label];
const zigContinueStmtParser: Parser<ZigStatement, string> = promiseCompose(
	createTupleParser([
		zigKeyword('continue'),
		zigSkippableParser,
		createOptionalParser(promiseCompose(
			createTupleParser([createExactSequenceParser(':'), zigIdentifierParser, zigSkippableParser]),
			([, label]) => label,
		)),
		createExactSequenceParser(';'),
	]),
	([, , label]): ZigStatement => ({
		type: 'ContinueStmt',
		...(label ? { label } : {}),
	}),
);

setParserName(zigContinueStmtParser, 'zigContinueStmtParser');

// Defer/errdefer statement
const zigDeferStmtParser: Parser<ZigStatement, string> = promiseCompose(
	createTupleParser([
		createDisjunctionParser([
			promiseCompose(zigKeyword('errdefer'), () => true as const),
			promiseCompose(zigKeyword('defer'), () => false as const),
		]),
		zigMandatorySkipParser,
		createOptionalParser(zigCaptureParser),
		zigStatementParser,
	]),
	([isErrdefer, , capture, body]): ZigStatement => ({
		type: 'DeferStmt',
		isErrdefer,
		...(capture ? { capture } : {}),
		body,
	}),
);

setParserName(zigDeferStmtParser, 'zigDeferStmtParser');

// If statement (produces IfExpr with statement bodies)
const zigIfStmtParser: Parser<ZigStatement, string> = promiseCompose(
	createTupleParser([
		zigKeyword('if'),
		zigSkippableParser,
		createExactSequenceParser('('),
		zigSkippableParser,
		zigExpressionParser,
		zigSkippableParser,
		createExactSequenceParser(')'),
		zigSkippableParser,
		createOptionalParser(zigCaptureParser),
		zigStatementParser,
		zigSkippableParser,
		createOptionalParser(promiseCompose(
			createTupleParser([zigKeyword('else'), zigSkippableParser, createOptionalParser(zigCaptureParser), zigStatementParser]),
			([, , capture, body]) => ({ capture, body }),
		)),
	]),
	([, , , , condition, , , , capture, body, , elsePart]): ZigStatement => ({
		type: 'IfExpr' as const,
		condition,
		...(capture ? { capture } : {}),
		body,
		...(elsePart?.capture ? { elseCapture: elsePart.capture } : {}),
		...(elsePart ? { elseBody: elsePart.body } : {}),
	}),
);

setParserName(zigIfStmtParser, 'zigIfStmtParser');

// While statement
const zigWhileStmtParser: Parser<ZigStatement, string> = promiseCompose(
	createTupleParser([
		createOptionalParser(promiseCompose(
			createTupleParser([zigIdentifierParser, zigSkippableParser, createExactSequenceParser(':'), zigSkippableParser]),
			([label]) => label,
		)),
		createOptionalParser(promiseCompose(createTupleParser([zigKeyword('inline'), zigMandatorySkipParser]), () => true as const)),
		zigKeyword('while'),
		zigSkippableParser,
		createExactSequenceParser('('),
		zigSkippableParser,
		zigExpressionParser,
		zigSkippableParser,
		createExactSequenceParser(')'),
		zigSkippableParser,
		createOptionalParser(zigCaptureParser),
		createOptionalParser(promiseCompose(
			createTupleParser([createExactSequenceParser(':'), zigSkippableParser, createExactSequenceParser('('), zigSkippableParser, zigExpressionParser, zigSkippableParser, createExactSequenceParser(')'), zigSkippableParser]),
			([, , , , expr]) => expr,
		)),
		zigStatementParser,
		zigSkippableParser,
		createOptionalParser(promiseCompose(
			createTupleParser([zigKeyword('else'), zigSkippableParser, zigStatementParser]),
			([, , body]) => body,
		)),
	]),
	([label, isInline, , , , , condition, , , , capture, continuation, body, , elseBody]): ZigStatement => ({
		type: 'WhileStmt',
		condition,
		...(capture ? { capture } : {}),
		...(continuation !== undefined ? { continuation } : {}),
		body,
		...(elseBody !== undefined ? { elseBody } : {}),
		...(label ? { label } : {}),
		isInline: isInline ?? false,
	}),
);

setParserName(zigWhileStmtParser, 'zigWhileStmtParser');

// For statement
const zigForStmtParser: Parser<ZigStatement, string> = promiseCompose(
	createTupleParser([
		createOptionalParser(promiseCompose(
			createTupleParser([zigIdentifierParser, zigSkippableParser, createExactSequenceParser(':'), zigSkippableParser]),
			([label]) => label,
		)),
		createOptionalParser(promiseCompose(createTupleParser([zigKeyword('inline'), zigMandatorySkipParser]), () => true as const)),
		zigKeyword('for'),
		zigSkippableParser,
		createExactSequenceParser('('),
		zigSkippableParser,
		createSeparatedNonEmptyArrayParser(
			promiseCompose(createTupleParser([zigExpressionParser, zigSkippableParser]), ([expr]) => expr),
			promiseCompose(createTupleParser([createExactSequenceParser(','), zigSkippableParser]), () => ','),
		),
		createExactSequenceParser(')'),
		zigSkippableParser,
		createExactSequenceParser('|'),
		zigSkippableParser,
		createSeparatedNonEmptyArrayParser(
			promiseCompose(
				createTupleParser([
					createOptionalParser(createExactSequenceParser('*')),
					zigSkippableParser,
					zigIdentifierParser,
					zigSkippableParser,
				]),
				([star, , name]) => (star ? '*' + name : name),
			),
			promiseCompose(createTupleParser([createExactSequenceParser(','), zigSkippableParser]), () => ','),
		),
		createExactSequenceParser('|'),
		zigSkippableParser,
		zigStatementParser,
		zigSkippableParser,
		createOptionalParser(promiseCompose(
			createTupleParser([zigKeyword('else'), zigSkippableParser, zigStatementParser]),
			([, , body]) => body,
		)),
	]),
	([label, isInline, , , , , inputs, , , , , captures, , , body, , elseBody]): ZigStatement => ({
		type: 'ForStmt',
		inputs,
		captures,
		body,
		...(elseBody !== undefined ? { elseBody } : {}),
		...(label ? { label } : {}),
		isInline: isInline ?? false,
	}),
);

setParserName(zigForStmtParser, 'zigForStmtParser');

// Block statement (produces BlockExpr)
const zigBlockStmtParser: Parser<ZigStatement, string> = promiseCompose(
	createTupleParser([
		createOptionalParser(promiseCompose(
			createTupleParser([zigIdentifierParser, zigSkippableParser, createExactSequenceParser(':'), zigSkippableParser]),
			([label]) => label,
		)),
		createExactSequenceParser('{'),
		zigSkippableParser,
		createArrayParser(promiseCompose(
			createTupleParser([zigStatementParser, zigSkippableParser]),
			([stmt]) => stmt,
		)),
		createExactSequenceParser('}'),
	]),
	([label, , , statements]): ZigStatement => ({
		type: 'BlockExpr' as const,
		...(label ? { label } : {}),
		statements,
	}),
);

setParserName(zigBlockStmtParser, 'zigBlockStmtParser');

// Assignment statement: expr op= expr;
const zigAssignStmtParser: Parser<ZigStatement, string> = promiseCompose(
	createTupleParser([
		zigExpressionParser,
		zigSkippableParser,
		createDisjunctionParser([
			promiseCompose(createExactSequenceParser('<<='), () => '<<=' as const),
			promiseCompose(createExactSequenceParser('>>='), () => '>>=' as const),
			promiseCompose(createExactSequenceParser('+='), () => '+=' as const),
			promiseCompose(createExactSequenceParser('-='), () => '-=' as const),
			promiseCompose(createExactSequenceParser('*='), () => '*=' as const),
			promiseCompose(createExactSequenceParser('/='), () => '/=' as const),
			promiseCompose(createExactSequenceParser('%='), () => '%=' as const),
			promiseCompose(createExactSequenceParser('&='), () => '&=' as const),
			promiseCompose(createExactSequenceParser('|='), () => '|=' as const),
			promiseCompose(createExactSequenceParser('^='), () => '^=' as const),
			promiseCompose(createExactSequenceParser('='), () => '=' as const),
		]),
		zigSkippableParser,
		zigExpressionParser,
		zigSkippableParser,
		createExactSequenceParser(';'),
	]),
	([target, , operator, , value]): ZigStatement => ({
		type: 'AssignStmt',
		target,
		operator,
		value,
	}),
);

setParserName(zigAssignStmtParser, 'zigAssignStmtParser');

// Expression statement: expr; (returns the expression directly without wrapping)
const zigExprStmtParser: Parser<ZigStatement, string> = promiseCompose(
	createTupleParser([
		zigExpressionParser,
		zigSkippableParser,
		createExactSequenceParser(';'),
	]),
	([expression]): ZigStatement => expression,
);

setParserName(zigExprStmtParser, 'zigExprStmtParser');

// Statement impl
const zigStatementParserImpl: Parser<ZigStatement, string> = createDisjunctionParser([
	zigVarDeclStmtParser,
	zigReturnStmtParser,
	zigBreakStmtParser,
	zigContinueStmtParser,
	zigDeferStmtParser,
	zigIfStmtParser,
	zigWhileStmtParser,
	zigForStmtParser,
	zigBlockStmtParser,
	zigAssignStmtParser,
	zigExprStmtParser,
]);

setParserName(zigStatementParserImpl, 'zigStatementParserImpl');

// Top-level declarations

// Function parameter
const zigFnParamParser: Parser<ZigFnParam, string> = promiseCompose(
	createTupleParser([
		createOptionalParser(promiseCompose(createTupleParser([zigKeyword('comptime'), zigMandatorySkipParser]), () => true as const)),
		createOptionalParser(promiseCompose(createTupleParser([zigKeyword('noalias'), zigMandatorySkipParser]), () => true as const)),
		createOptionalParser(promiseCompose(
			createTupleParser([zigIdentifierParser, zigSkippableParser, createExactSequenceParser(':'), zigSkippableParser]),
			([name]) => name,
		)),
		zigExpressionParser,
	]),
	([isComptime, isNoalias, name, typeExpr]): ZigFnParam => ({
		type: 'FnParam',
		...(name ? { name } : {}),
		isComptime: isComptime ?? false,
		isNoalias: isNoalias ?? false,
		typeExpr,
	}),
);

setParserName(zigFnParamParser, 'zigFnParamParser');

// Function parameter list
const zigFnParamListParser: Parser<ZigFnParam[], string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('('),
		zigSkippableParser,
		createOptionalParser(
			createSeparatedNonEmptyArrayParser(
				promiseCompose(createTupleParser([zigFnParamParser, zigSkippableParser]), ([param]) => param),
				promiseCompose(createTupleParser([createExactSequenceParser(','), zigSkippableParser]), () => ','),
			),
		),
		createOptionalParser(createExactSequenceParser(',')),
		zigSkippableParser,
		createExactSequenceParser(')'),
	]),
	([, , params]) => params ?? [],
);

setParserName(zigFnParamListParser, 'zigFnParamListParser');

// Function declaration
const zigFnDeclParser: Parser<ZigFnDecl, string> = promiseCompose(
	createTupleParser([
		createOptionalParser(promiseCompose(createTupleParser([zigKeyword('pub'), zigMandatorySkipParser]), () => true as const)),
		createOptionalParser(promiseCompose(createTupleParser([zigKeyword('extern'), zigMandatorySkipParser]), () => true as const)),
		createOptionalParser(promiseCompose(createTupleParser([zigKeyword('export'), zigMandatorySkipParser]), () => true as const)),
		createOptionalParser(promiseCompose(createTupleParser([zigKeyword('inline'), zigMandatorySkipParser]), () => true as const)),
		createOptionalParser(promiseCompose(createTupleParser([zigKeyword('comptime'), zigMandatorySkipParser]), () => true as const)),
		zigKeyword('fn'),
		zigMandatorySkipParser,
		zigIdentifierParser,
		zigSkippableParser,
		zigFnParamListParser,
		zigSkippableParser,
		zigTypeExprParser,
		zigSkippableParser,
		createDisjunctionParser([
			zigBlockExprParser,
			promiseCompose(createExactSequenceParser(';'), (): undefined => undefined),
		]),
	]),
	([isPub, isExtern, isExport, isInline, isComptime, , , name, , params, , returnType, , body]): ZigFnDecl => ({
		type: 'FnDecl',
		isPub: isPub ?? false,
		isExtern: isExtern ?? false,
		isExport: isExport ?? false,
		isInline: isInline ?? false,
		isComptime: isComptime ?? false,
		name,
		params,
		returnType,
		...(body !== undefined ? { body } : {}),
	}),
);

setParserName(zigFnDeclParser, 'zigFnDeclParser');

// Top-level variable declaration
const zigVarDeclParser: Parser<ZigVarDecl, string> = promiseCompose(
	createTupleParser([
		createOptionalParser(promiseCompose(createTupleParser([zigKeyword('pub'), zigMandatorySkipParser]), () => true as const)),
		createOptionalParser(promiseCompose(createTupleParser([zigKeyword('extern'), zigMandatorySkipParser]), () => true as const)),
		createOptionalParser(promiseCompose(createTupleParser([zigKeyword('comptime'), zigMandatorySkipParser]), () => true as const)),
		createOptionalParser(promiseCompose(createTupleParser([zigKeyword('threadlocal'), zigMandatorySkipParser]), () => true as const)),
		createDisjunctionParser([
			promiseCompose(zigKeyword('const'), () => true as const),
			promiseCompose(zigKeyword('var'), () => false as const),
		]),
		zigMandatorySkipParser,
		zigIdentifierParser,
		zigSkippableParser,
		createOptionalParser(promiseCompose(
			createTupleParser([createExactSequenceParser(':'), zigSkippableParser, zigExpressionParser, zigSkippableParser]),
			([, , type_]) => type_,
		)),
		createOptionalParser(promiseCompose(
			createTupleParser([zigKeyword('align'), zigSkippableParser, createExactSequenceParser('('), zigSkippableParser, zigExpressionParser, zigSkippableParser, createExactSequenceParser(')'), zigSkippableParser]),
			([, , , , expr]) => expr,
		)),
		createOptionalParser(promiseCompose(
			createTupleParser([createExactSequenceParser('='), zigSkippableParser, zigExpressionParser, zigSkippableParser]),
			([, , init]) => init,
		)),
		createExactSequenceParser(';'),
	]),
	([isPub, isExtern, isComptime, isThreadlocal, isConst, , name, , typeExpr, alignExpr, initExpr]): ZigVarDecl => ({
		type: 'VarDecl',
		isConst,
		isPub: isPub ?? false,
		isExtern: isExtern ?? false,
		isComptime: isComptime ?? false,
		isThreadlocal: isThreadlocal ?? false,
		name,
		...(typeExpr !== undefined ? { typeExpr } : {}),
		...(alignExpr !== undefined ? { alignExpr } : {}),
		...(initExpr !== undefined ? { initExpr } : {}),
	}),
);

setParserName(zigVarDeclParser, 'zigVarDeclParser');

// Test declaration: test ["name"] { ... }
const zigTestDeclParser: Parser<ZigTestDecl, string> = promiseCompose(
	createTupleParser([
		zigKeyword('test'),
		zigSkippableParser,
		createOptionalParser(promiseCompose(
			createTupleParser([zigStringLiteralParser, zigSkippableParser]),
			([str]) => (str as { type: 'StringLiteral'; value: string }).value,
		)),
		zigBlockExprParser,
	]),
	([, , name, body]): ZigTestDecl => ({
		type: 'TestDecl',
		...(name ? { name } : {}),
		body,
	}),
);

setParserName(zigTestDeclParser, 'zigTestDeclParser');

// Usingnamespace declaration: [pub] usingnamespace expr;
const zigUsingnamespaceDeclParser: Parser<ZigUsingnamespaceDecl, string> = promiseCompose(
	createTupleParser([
		createOptionalParser(promiseCompose(createTupleParser([zigKeyword('pub'), zigMandatorySkipParser]), () => true as const)),
		zigKeyword('usingnamespace'),
		zigMandatorySkipParser,
		zigExpressionParser,
		zigSkippableParser,
		createExactSequenceParser(';'),
	]),
	([isPub, , , expression]): ZigUsingnamespaceDecl => ({
		type: 'UsingnamespaceDecl',
		isPub: isPub ?? false,
		expression,
	}),
);

setParserName(zigUsingnamespaceDeclParser, 'zigUsingnamespaceDeclParser');

// Container member (top-level declaration)
const zigContainerMemberParser: Parser<ZigContainerMember, string> = createDisjunctionParser([
	zigFnDeclParser,
	zigVarDeclParser,
	zigTestDeclParser,
	zigUsingnamespaceDeclParser,
]);

setParserName(zigContainerMemberParser, 'zigContainerMemberParser');

// Root: source file
export const zigSourceFileParser: Parser<ZigRoot, string> = createObjectParser({
	_ws1: zigSkippableParser,
	type: 'Root' as const,
	members: createArrayParser(
		promiseCompose(
			createTupleParser([
				zigContainerMemberParser,
				zigSkippableParser,
			]),
			([member]) => member,
		),
	),
	_ws2: zigSkippableParser,
});

setParserName(zigSourceFileParser, 'zigSourceFileParser');
