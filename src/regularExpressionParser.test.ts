import { testProp, fc } from '@fast-check/ava';
import { regularExpressionParser } from './regularExpressionParser.js';

const seed = process.env.SEED ? Number(process.env.SEED) : undefined;

// Import directly from file path to bypass package exports
// eslint-disable-next-line import/no-unresolved
import { parseRegExpString } from '../node_modules/@gruhn/regex-utils/dist/regex-parser.js';
// eslint-disable-next-line import/no-unresolved
import { AssertionDir, AssertionSign, type RegExpAST } from '../node_modules/@gruhn/regex-utils/dist/ast.js';
// eslint-disable-next-line import/no-unresolved
import type { CharSet as LibCharSet } from '../node_modules/@gruhn/regex-utils/dist/char-set.js';
import { runParser } from './parser.js';
import { stringParserInputCompanion } from './parserInputCompanion.js';
import { arbitrarilySlicedAsyncIterator } from './arbitrarilySlicedAsyncInterator.js';
import type { RegularExpression, CharacterSet } from './regularExpression.js';

// Convert new @gruhn/regex-utils AST format to our internal format
// The key difference: new version uses 'assertion' type instead of 'lookahead'
function convertFromRegExpAST(ast: RegExpAST): RegularExpression {
	switch (ast.type) {
		case 'epsilon':
			return { type: 'epsilon' };
		case 'literal':
			// CharSet from @gruhn/regex-utils has hash property, but our CharacterSet doesn't
			// We need to convert it to our format
			return { type: 'literal', charset: convertCharSet(ast.charset) };
		case 'concat':
			return { type: 'concat', left: convertFromRegExpAST(ast.left), right: convertFromRegExpAST(ast.right) };
		case 'union':
			return { type: 'union', left: convertFromRegExpAST(ast.left), right: convertFromRegExpAST(ast.right) };
		case 'star':
			return { type: 'star', inner: convertFromRegExpAST(ast.inner) };
		case 'plus':
			return { type: 'plus', inner: convertFromRegExpAST(ast.inner) };
		case 'optional':
			return { type: 'optional', inner: convertFromRegExpAST(ast.inner) };
		case 'repeat':
			return { type: 'repeat', inner: convertFromRegExpAST(ast.inner), bounds: ast.bounds };
		case 'capture-group':
			if (ast.name !== undefined) {
				return { type: 'capture-group', inner: convertFromRegExpAST(ast.inner), name: ast.name };
			}
			return { type: 'capture-group', inner: convertFromRegExpAST(ast.inner) };
		case 'assertion':
			// Convert new 'assertion' format to old 'lookahead' format
			// Only handle lookahead assertions (AHEAD direction)
			if (ast.direction === AssertionDir.AHEAD) {
				return {
					type: 'lookahead',
					isPositive: ast.sign === AssertionSign.POSITIVE,
					inner: convertFromRegExpAST(ast.inner),
					right: convertFromRegExpAST(ast.outer),
				};
			}
			// For lookbehind, we'll throw an error as our parser doesn't support it yet
			throw new Error('Lookbehind assertions are not supported');
		case 'start-anchor':
			return { type: 'start-anchor', left: convertFromRegExpAST(ast.left), right: convertFromRegExpAST(ast.right) };
		case 'end-anchor':
			return { type: 'end-anchor', left: convertFromRegExpAST(ast.left), right: convertFromRegExpAST(ast.right) };
	}
}

// Convert CharSet from @gruhn/regex-utils to our CharacterSet format
// The CharSet from the library includes hash and other metadata we don't need
function convertCharSet(charset: LibCharSet): CharacterSet {
	if (charset.type === 'empty') {
		return { type: 'empty' };
	}
	if (charset.type === 'node') {
		return {
			type: 'node',
			range: { start: charset.range.start, end: charset.range.end },
			left: convertCharSet(charset.left),
			right: convertCharSet(charset.right),
		};
	}
	// Fallback - return empty
	return { type: 'empty' };
}


// Normalize AST for comparison - removes hashes from CharSets and normalizes structure
function normalizeCharacterSet(charset: CharacterSet): CharacterSet {
	if (charset.type === 'empty') {
		return { type: 'empty' };
	}
	return {
		type: 'node',
		range: { start: charset.range.start, end: charset.range.end },
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

testProp(
	'regularExpressionParser matches @gruhn/regex-utils',
	[
		arbitrarilySlicedAsyncIterator(supportedRegexArbitrary),
	],
	async (t, [regexStr, regexStringChunkIterator]) => {
		const expected = normalizeRegularExpression(convertFromRegExpAST(parseRegExpString(regexStr)));
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
