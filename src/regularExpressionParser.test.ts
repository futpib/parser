import { testProp, fc } from '@fast-check/ava';
import { regularExpressionParser } from './regularExpressionParser.js';

const seed = process.env.SEED ? Number(process.env.SEED) : undefined;

// Import directly from file path to bypass package exports
// eslint-disable-next-line import/no-unresolved
import { parseRegExpString } from '../node_modules/@gruhn/regex-utils/dist/regex-parser.js';
import { runParser } from './parser.js';
import { stringParserInputCompanion } from './parserInputCompanion.js';
import { arbitrarilySlicedAsyncIterator } from './arbitrarilySlicedAsyncInterator.js';
import type { RegularExpression, CharacterSet, AssertionSign, AssertionDir } from './regularExpression.js';

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
		case 'assertion':
			return { type: 'assertion', direction: ast.direction, sign: ast.sign, inner: normalizeRegularExpression(ast.inner), outer: normalizeRegularExpression(ast.outer) };
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
		const expected = normalizeRegularExpression(parseRegExpString(regexStr));
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
