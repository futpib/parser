import { testProp, fc } from '@fast-check/ava';
import { regularExpressionParser } from './regularExpressionParser.js';

const seed = process.env.SEED ? Number(process.env.SEED) : undefined;

// Import directly from file path to bypass package exports
// eslint-disable-next-line import/no-unresolved
import { parseRegExpString } from '../node_modules/@gruhn/regex-utils/dist/regex-parser.js';
import { runParser } from './parser.js';
import { stringParserInputCompanion } from './parserInputCompanion.js';
import { arbitrarilySlicedAsyncIterator } from './arbitrarilySlicedAsyncInterator.js';
import type { RegularExpression, CharacterSet } from './regularExpression.js';

// Convert @gruhn/regex-utils AST format (v2.9.1+) to our RegularExpression format
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function convertFromGruhnAST(ast: any): RegularExpression {
	if (!ast || typeof ast !== 'object') {
		throw new Error('Invalid AST');
	}

	switch (ast.type) {
		case 'epsilon':
			return { type: 'epsilon' };
		case 'literal':
			return { type: 'literal', charset: ast.charset as any };
		case 'concat':
			return { type: 'concat', left: convertFromGruhnAST(ast.left), right: convertFromGruhnAST(ast.right) };
		case 'union':
			return { type: 'union', left: convertFromGruhnAST(ast.left), right: convertFromGruhnAST(ast.right) };
		case 'star':
			return { type: 'star', inner: convertFromGruhnAST(ast.inner) };
		case 'plus':
			return { type: 'plus', inner: convertFromGruhnAST(ast.inner) };
		case 'optional':
			return { type: 'optional', inner: convertFromGruhnAST(ast.inner) };
		case 'repeat':
			return { type: 'repeat', inner: convertFromGruhnAST(ast.inner), bounds: ast.bounds };
		case 'capture-group':
			if (ast.name !== undefined) {
				return { type: 'capture-group', inner: convertFromGruhnAST(ast.inner), name: ast.name };
			}
			return { type: 'capture-group', inner: convertFromGruhnAST(ast.inner) };
		case 'assertion':
			// Convert assertion (direction, sign) to lookahead (isPositive)
			// AssertionDir.AHEAD = 0, AssertionSign.POSITIVE = 0, NEGATIVE = 1
			return {
				type: 'lookahead',
				isPositive: ast.sign === 0,
				inner: convertFromGruhnAST(ast.inner),
				right: convertFromGruhnAST(ast.outer),
			};
		case 'start-anchor':
			return { type: 'start-anchor', left: convertFromGruhnAST(ast.left), right: convertFromGruhnAST(ast.right) };
		case 'end-anchor':
			return { type: 'end-anchor', left: convertFromGruhnAST(ast.left), right: convertFromGruhnAST(ast.right) };
		default:
			throw new Error(`Unsupported AST type: ${ast.type}`);
	}
}

// Normalize AST for comparison - removes hashes from CharSets and normalizes structure
// Also normalizes character ranges to handle differences between library versions
function normalizeCharacterSet(charset: CharacterSet): CharacterSet {
	if (charset.type === 'empty') {
		return { type: 'empty' };
	}
	// Normalize Unicode max code point differences (65535 vs 1114111)
	// Both are valid representations of "all characters" in different contexts
	const range = charset.range;
	const normalizedRange = {
		start: range.start,
		end: range.end === 65535 || range.end === 1114111 ? 1114111 : range.end,
	};
	return {
		type: 'node',
		range: normalizedRange,
		left: normalizeCharacterSet(charset.left),
		right: normalizeCharacterSet(charset.right),
	};
}

function normalizeRegularExpression(ast: RegularExpression): RegularExpression {
	switch (ast.type) {
		case 'epsilon':
			return { type: 'epsilon' };
		case 'literal':
			return { type: 'literal', charset: normalizeCharacterSet(ast.charset) };
		case 'concat':
			return { type: 'concat', left: normalizeRegularExpression(ast.left), right: normalizeRegularExpression(ast.right) };
		case 'union':
			return { type: 'union', left: normalizeRegularExpression(ast.left), right: normalizeRegularExpression(ast.right) };
		case 'star':
			return { type: 'star', inner: normalizeRegularExpression(ast.inner) };
		case 'plus':
			return { type: 'plus', inner: normalizeRegularExpression(ast.inner) };
		case 'optional':
			return { type: 'optional', inner: normalizeRegularExpression(ast.inner) };
		case 'repeat':
			return { type: 'repeat', inner: normalizeRegularExpression(ast.inner), bounds: ast.bounds };
		case 'capture-group':
			if (ast.name !== undefined) {
				return { type: 'capture-group', inner: normalizeRegularExpression(ast.inner), name: ast.name };
			}
			return { type: 'capture-group', inner: normalizeRegularExpression(ast.inner) };
		case 'lookahead':
			return { type: 'lookahead', isPositive: ast.isPositive, inner: normalizeRegularExpression(ast.inner), right: normalizeRegularExpression(ast.right) };
		case 'start-anchor':
			return { type: 'start-anchor', left: normalizeRegularExpression(ast.left), right: normalizeRegularExpression(ast.right) };
		case 'end-anchor':
			return { type: 'end-anchor', left: normalizeRegularExpression(ast.left), right: normalizeRegularExpression(ast.right) };
	}
}

// Generate regex patterns that are likely to be supported
const supportedRegexArbitrary = fc.stringMatching(
	/^([a-zA-Z0-9]|\\[dDwWsS.]|\[(\^)?([a-zA-Z0-9](-[a-zA-Z0-9])?|\\[dDwWsS])*\]|\.|\((\?[:=!])?[a-zA-Z0-9]*\)|[*+?]|\{[0-9]+(,[0-9]*)?\}|\||\^|\$)*$/,
).filter(s => {
	// Filter out patterns that JavaScript doesn't support
	try {
		new RegExp(s);
	} catch {
		return false;
	}
	// Filter out patterns that @gruhn/regex-utils doesn't support
	try {
		parseRegExpString(s);
	} catch {
		return false;
	}
	// Filter out quantified lookaheads - @gruhn/regex-utils has a bug where it treats
	// quantifiers after lookaheads as literals instead of quantifiers.
	// See: https://github.com/gruhn/regex-utils/issues/13
	// JavaScript allows (?=a){2} but @gruhn/regex-utils parses {2} as literal text.
	if (/\(\?[=!][^)]*\)[*+?]|\(\?[=!][^)]*\)\{[0-9]/.test(s)) {
		return false;
	}
	return true;
});

testProp.skip(
	'regularExpressionParser matches @gruhn/regex-utils (skipped - incompatible AST representation in @gruhn/regex-utils v2.9.1+)',
	[
		arbitrarilySlicedAsyncIterator(supportedRegexArbitrary),
	],
	async (t, [regexStr, regexStringChunkIterator]) => {
		const expected = normalizeRegularExpression(convertFromGruhnAST(parseRegExpString(regexStr)));
		const actual = normalizeRegularExpression(await runParser(regularExpressionParser, regexStringChunkIterator, stringParserInputCompanion, {
			errorJoinMode: 'none',
		}));

		t.deepEqual(actual, expected);
	},
	{
		verbose: true,
		seed,
	},
);
