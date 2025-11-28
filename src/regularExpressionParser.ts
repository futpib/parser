import { type Parser } from './parser.js';
import { createUnionParser } from './unionParser.js';
import { createExactSequenceParser } from './exactSequenceParser.js';
import { promiseCompose } from './promiseCompose.js';
import { createTupleParser } from './tupleParser.js';
import { createArrayParser } from './arrayParser.js';
import { createParserAccessorParser } from './parserAccessorParser.js';
import { createElementParser } from './elementParser.js';
import { parserCreatorCompose } from './parserCreatorCompose.js';
import { createOptionalParser } from './optionalParser.js';
import { createFixedLengthSequenceParser } from './fixedLengthSequenceParser.js';
import { createTerminatedArrayParser } from './terminatedArrayParser.js';
import { createDisjunctionParser } from './disjunctionParser.js';
import { createNegativeLookaheadParser } from './negativeLookaheadParser.js';
import { createObjectParser } from './objectParser.js';
import {
	type CharacterSet,
	type CodePointRange,
	type RegularExpression,
	type RepeatBounds,
} from './regularExpression.js';

// CharacterSet helpers

const emptyCharacterSet: CharacterSet = { type: 'empty' };

function codePointRangeIsEmpty(range: CodePointRange): boolean {
	return range.start > range.end;
}

function codePointRangeIsStrictlyBefore(rangeA: CodePointRange, rangeB: CodePointRange): boolean {
	return rangeA.end + 1 < rangeB.start;
}

function codePointRangeIsStrictlyAfter(rangeA: CodePointRange, rangeB: CodePointRange): boolean {
	return codePointRangeIsStrictlyBefore(rangeB, rangeA);
}

function codePointRangeLeastUpperBound(rangeA: CodePointRange, rangeB: CodePointRange): CodePointRange {
	if (codePointRangeIsEmpty(rangeA)) return rangeB;
	if (codePointRangeIsEmpty(rangeB)) return rangeA;
	return {
		start: Math.min(rangeA.start, rangeB.start),
		end: Math.max(rangeA.end, rangeB.end),
	};
}

function codePointRangeStrictlyDisjoint(rangeA: CodePointRange, rangeB: CodePointRange): boolean {
	return codePointRangeIsStrictlyBefore(rangeA, rangeB) || codePointRangeIsStrictlyAfter(rangeA, rangeB);
}

function characterSetNode(range: CodePointRange, left: CharacterSet, right: CharacterSet): CharacterSet {
	return { type: 'node', range, left, right };
}

function* characterSetGetRanges(set: CharacterSet): Generator<CodePointRange> {
	if (set.type === 'node') {
		yield* characterSetGetRanges(set.left);
		yield set.range;
		yield* characterSetGetRanges(set.right);
	}
}

function characterSetExtractOverlap(set: CharacterSet, range: CodePointRange): { restCharSet: CharacterSet; extendedRange: CodePointRange } {
	if (set.type === 'empty') {
		return { restCharSet: set, extendedRange: range };
	}

	let extendedRange = range;
	let newLeft = set.left;
	let newRight = set.right;

	if (range.start < set.range.start) {
		const resultLeft = characterSetExtractOverlap(set.left, range);
		extendedRange = codePointRangeLeastUpperBound(extendedRange, resultLeft.extendedRange);
		newLeft = resultLeft.restCharSet;
	}

	if (range.end > set.range.end) {
		const resultRight = characterSetExtractOverlap(set.right, range);
		extendedRange = codePointRangeLeastUpperBound(extendedRange, resultRight.extendedRange);
		newRight = resultRight.restCharSet;
	}

	if (codePointRangeStrictlyDisjoint(range, set.range)) {
		return {
			extendedRange,
			restCharSet: characterSetNode(set.range, newLeft, newRight),
		};
	}

	return {
		extendedRange: codePointRangeLeastUpperBound(set.range, extendedRange),
		restCharSet: characterSetUnion(newLeft, newRight),
	};
}

function characterSetInsertRange(set: CharacterSet, range: CodePointRange): CharacterSet {
	if (codePointRangeIsEmpty(range)) {
		return set;
	}

	if (set.type === 'empty') {
		return characterSetNode(range, emptyCharacterSet, emptyCharacterSet);
	}

	if (codePointRangeIsStrictlyBefore(range, set.range)) {
		return characterSetNode(set.range, characterSetInsertRange(set.left, range), set.right);
	}

	if (codePointRangeIsStrictlyAfter(range, set.range)) {
		return characterSetNode(set.range, set.left, characterSetInsertRange(set.right, range));
	}

	const resultLeft = characterSetExtractOverlap(set.left, range);
	const resultRight = characterSetExtractOverlap(set.right, range);
	const resultRange = [set.range, resultLeft.extendedRange, resultRight.extendedRange].reduce(codePointRangeLeastUpperBound);

	if (codePointRangeIsEmpty(resultRange)) {
		return emptyCharacterSet;
	}

	return characterSetNode(resultRange, resultLeft.restCharSet, resultRight.restCharSet);
}

function characterSetUnion(setA: CharacterSet, setB: CharacterSet): CharacterSet {
	return [...characterSetGetRanges(setB)].reduce(characterSetInsertRange, setA);
}

function codePointRangeSplitAt(point: number, range: CodePointRange): [CodePointRange, CodePointRange] {
	return [
		{ start: range.start, end: Math.min(range.end, point) },
		{ start: Math.max(range.start, point + 1), end: range.end },
	];
}

function codePointRangeUnion(rangeA: CodePointRange, rangeB: CodePointRange): CodePointRange[] {
	if (codePointRangeIsEmpty(rangeA) && codePointRangeIsEmpty(rangeB)) return [];
	if (codePointRangeIsEmpty(rangeA)) return [rangeB];
	if (codePointRangeIsEmpty(rangeB)) return [rangeA];
	if (rangeA.end + 1 < rangeB.start) return [rangeA, rangeB];
	if (rangeB.end + 1 < rangeA.start) return [rangeB, rangeA];
	return [{
		start: Math.min(rangeA.start, rangeB.start),
		end: Math.max(rangeA.end, rangeB.end),
	}];
}

function codePointRangeDifference(rangeA: CodePointRange, rangeB: CodePointRange): CodePointRange[] {
	const [before, restRangeA] = codePointRangeSplitAt(rangeB.start - 1, rangeA);
	const [, after] = codePointRangeSplitAt(rangeB.end, restRangeA);
	return codePointRangeUnion(before, after);
}

function characterSetDeleteRange(set: CharacterSet, range: CodePointRange): CharacterSet {
	if (codePointRangeIsEmpty(range)) {
		return set;
	}

	if (set.type === 'empty') {
		return emptyCharacterSet;
	}

	const [rangeBeforeStart] = codePointRangeSplitAt(set.range.start - 1, range);
	const [rangeRest2, rangeAfterEnd] = codePointRangeSplitAt(set.range.end, range);
	const newLeft = characterSetDeleteRange(set.left, rangeBeforeStart);
	const newRight = characterSetDeleteRange(set.right, rangeAfterEnd);
	const setRangeRest = codePointRangeDifference(set.range, rangeRest2);

	if (setRangeRest.length === 0) {
		return characterSetUnion(newLeft, newRight);
	}

	if (setRangeRest.length === 1) {
		return characterSetNode(setRangeRest[0]!, newLeft, newRight);
	}

	// setRangeRest.length === 2
	return characterSetUnion(
		characterSetInsertRange(newLeft, setRangeRest[0]!),
		characterSetInsertRange(newRight, setRangeRest[1]!),
	);
}

function characterSetDifference(setA: CharacterSet, setB: CharacterSet): CharacterSet {
	return [...characterSetGetRanges(setB)].reduce(characterSetDeleteRange, setA);
}

function characterSetFromRange(range: CodePointRange): CharacterSet {
	if (codePointRangeIsEmpty(range)) {
		return emptyCharacterSet;
	}
	return characterSetNode(range, emptyCharacterSet, emptyCharacterSet);
}

function characterSetSingleton(char: string): CharacterSet {
	const codePoint = char.codePointAt(0)!;
	return characterSetFromRange({ start: codePoint, end: codePoint });
}

function characterSetCharRange(startChar: string, endChar: string): CharacterSet {
	const start = startChar.codePointAt(0)!;
	const end = endChar.codePointAt(0)!;
	return characterSetFromRange({ start, end });
}

function characterSetFromArray(chars: string[]): CharacterSet {
	return chars.map(characterSetSingleton).reduce(characterSetUnion, emptyCharacterSet);
}

function characterSetComplement(set: CharacterSet): CharacterSet {
	return characterSetDifference(alphabet, set);
}

// Pre-defined character sets
const alphabet: CharacterSet = characterSetDifference(
	characterSetFromRange({ start: 0, end: 0x10FFFF }),
	characterSetFromArray(['\r', '\n', '\u2028', '\u2029']),
);

const wildcardCharacterSet: CharacterSet = characterSetDifference(
	alphabet,
	characterSetFromArray(['\r', '\n', '\u2028', '\u2029']),
);

const digitChars: CharacterSet = characterSetCharRange('0', '9');
const nonDigitChars: CharacterSet = characterSetComplement(digitChars);

const wordChars: CharacterSet = [
	characterSetCharRange('a', 'z'),
	characterSetCharRange('A', 'Z'),
	characterSetCharRange('0', '9'),
	characterSetSingleton('_'),
].reduce(characterSetUnion);
const nonWordChars: CharacterSet = characterSetComplement(wordChars);

const whiteSpaceChars: CharacterSet = [
	characterSetSingleton('\f'),
	characterSetSingleton('\n'),
	characterSetSingleton('\r'),
	characterSetSingleton('\t'),
	characterSetSingleton('\v'),
	characterSetSingleton('\u0020'),
	characterSetSingleton('\u00a0'),
	characterSetSingleton('\u1680'),
	characterSetCharRange('\u2000', '\u200a'),
	characterSetSingleton('\u2028'),
	characterSetSingleton('\u2029'),
	characterSetSingleton('\u202f'),
	characterSetSingleton('\u205f'),
	characterSetSingleton('\u3000'),
	characterSetSingleton('\ufeff'),
].reduce(characterSetUnion);
const nonWhiteSpaceChars: CharacterSet = characterSetComplement(whiteSpaceChars);

// AST constructors

const epsilon: RegularExpression = { type: 'epsilon' };

function literal(charset: CharacterSet): RegularExpression {
	return { type: 'literal', charset };
}

function concat(left: RegularExpression, right: RegularExpression): RegularExpression {
	return { type: 'concat', left, right };
}

function union(left: RegularExpression, right: RegularExpression): RegularExpression {
	return { type: 'union', left, right };
}

function star(inner: RegularExpression): RegularExpression {
	return { type: 'star', inner };
}

function plus(inner: RegularExpression): RegularExpression {
	return { type: 'plus', inner };
}

function optional(inner: RegularExpression): RegularExpression {
	return { type: 'optional', inner };
}

function repeat(inner: RegularExpression, bounds: RepeatBounds): RegularExpression {
	return { type: 'repeat', inner, bounds };
}

function captureGroup(inner: RegularExpression, name?: string): RegularExpression {
	if (name === undefined) {
		return { type: 'capture-group', inner };
	}
	return { type: 'capture-group', inner, name };
}

function lookahead(isPositive: boolean, inner: RegularExpression, right: RegularExpression): RegularExpression {
	return { type: 'lookahead', isPositive, inner, right };
}

function startAnchor(left: RegularExpression, right: RegularExpression): RegularExpression {
	return { type: 'start-anchor', left, right };
}

function endAnchor(left: RegularExpression, right: RegularExpression): RegularExpression {
	return { type: 'end-anchor', left, right };
}

// Parser implementation

const elementParser: Parser<string, string> = createElementParser();

const metaCharacters = new Set(['\\', '^', '$', '.', '|', '?', '*', '+', '(', ')', '[', ']', '{', '}']);

// Escape sequences for control characters
const escapeNParser: Parser<RegularExpression, string> = promiseCompose(
	createExactSequenceParser('\\n'),
	() => literal(characterSetSingleton('\n')),
);

const escapeRParser: Parser<RegularExpression, string> = promiseCompose(
	createExactSequenceParser('\\r'),
	() => literal(characterSetSingleton('\r')),
);

const escapeTParser: Parser<RegularExpression, string> = promiseCompose(
	createExactSequenceParser('\\t'),
	() => literal(characterSetSingleton('\t')),
);

const escapeFParser: Parser<RegularExpression, string> = promiseCompose(
	createExactSequenceParser('\\f'),
	() => literal(characterSetSingleton('\f')),
);

const escapeVParser: Parser<RegularExpression, string> = promiseCompose(
	createExactSequenceParser('\\v'),
	() => literal(characterSetSingleton('\v')),
);

const escape0Parser: Parser<RegularExpression, string> = promiseCompose(
	createExactSequenceParser('\\0'),
	() => literal(characterSetSingleton('\0')),
);

// Character class escapes
const escapeDigitParser: Parser<RegularExpression, string> = promiseCompose(
	createExactSequenceParser('\\d'),
	() => literal(digitChars),
);

const escapeNonDigitParser: Parser<RegularExpression, string> = promiseCompose(
	createExactSequenceParser('\\D'),
	() => literal(nonDigitChars),
);

const escapeWordParser: Parser<RegularExpression, string> = promiseCompose(
	createExactSequenceParser('\\w'),
	() => literal(wordChars),
);

const escapeNonWordParser: Parser<RegularExpression, string> = promiseCompose(
	createExactSequenceParser('\\W'),
	() => literal(nonWordChars),
);

const escapeSpaceParser: Parser<RegularExpression, string> = promiseCompose(
	createExactSequenceParser('\\s'),
	() => literal(whiteSpaceChars),
);

const escapeNonSpaceParser: Parser<RegularExpression, string> = promiseCompose(
	createExactSequenceParser('\\S'),
	() => literal(nonWhiteSpaceChars),
);

// Hex escape \xHH
const escapeHexParser: Parser<RegularExpression, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('\\x'),
		createFixedLengthSequenceParser<string>(2),
	]),
	([, hexCode]) => literal(characterSetSingleton(String.fromCharCode(Number.parseInt(hexCode, 16)))),
);

// Unicode escape \uHHHH
const escapeUnicodeParser: Parser<RegularExpression, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('\\u'),
		createFixedLengthSequenceParser<string>(4),
	]),
	([, hexCode]) => literal(characterSetSingleton(String.fromCharCode(Number.parseInt(hexCode, 16)))),
);

// Escaped metacharacter (e.g., \., \*, etc.)
const escapeMetacharacterParser: Parser<RegularExpression, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('\\'),
		elementParser,
	]),
	([, char]) => literal(characterSetSingleton(char)),
);

// All escape sequences - use createDisjunctionParser to try specific escapes first
const escapeParser: Parser<RegularExpression, string> = createDisjunctionParser([
	escapeNParser,
	escapeRParser,
	escapeTParser,
	escapeFParser,
	escapeVParser,
	escape0Parser,
	escapeDigitParser,
	escapeNonDigitParser,
	escapeWordParser,
	escapeNonWordParser,
	escapeSpaceParser,
	escapeNonSpaceParser,
	escapeHexParser,
	escapeUnicodeParser,
	escapeMetacharacterParser, // Must be last - matches any escaped char
]);

// Dot (matches any character except newline)
const dotParser: Parser<RegularExpression, string> = promiseCompose(
	createExactSequenceParser('.'),
	() => literal(wildcardCharacterSet),
);

// Literal character (non-metacharacter)
const literalCharacterParser: Parser<RegularExpression, string> = parserCreatorCompose(
	() => elementParser,
	char => async parserContext => {
		parserContext.invariant(!metaCharacters.has(char), 'Unexpected metacharacter "%s"', char);
		return literal(characterSetSingleton(char));
	},
)();

// Character class internals

// Character in a character class (different rules than outside)
const charClassMetaCharacters = new Set(['\\', ']', '^', '-']);

// Escape sequences inside character class (returns CharacterSet)
const charClassEscapeNParser: Parser<CharacterSet, string> = promiseCompose(
	createExactSequenceParser('\\n'),
	() => characterSetSingleton('\n'),
);

const charClassEscapeRParser: Parser<CharacterSet, string> = promiseCompose(
	createExactSequenceParser('\\r'),
	() => characterSetSingleton('\r'),
);

const charClassEscapeTParser: Parser<CharacterSet, string> = promiseCompose(
	createExactSequenceParser('\\t'),
	() => characterSetSingleton('\t'),
);

const charClassEscapeFParser: Parser<CharacterSet, string> = promiseCompose(
	createExactSequenceParser('\\f'),
	() => characterSetSingleton('\f'),
);

const charClassEscapeVParser: Parser<CharacterSet, string> = promiseCompose(
	createExactSequenceParser('\\v'),
	() => characterSetSingleton('\v'),
);

const charClassEscape0Parser: Parser<CharacterSet, string> = promiseCompose(
	createExactSequenceParser('\\0'),
	() => characterSetSingleton('\0'),
);

const charClassEscapeDigitParser: Parser<CharacterSet, string> = promiseCompose(
	createExactSequenceParser('\\d'),
	() => digitChars,
);

const charClassEscapeNonDigitParser: Parser<CharacterSet, string> = promiseCompose(
	createExactSequenceParser('\\D'),
	() => nonDigitChars,
);

const charClassEscapeWordParser: Parser<CharacterSet, string> = promiseCompose(
	createExactSequenceParser('\\w'),
	() => wordChars,
);

const charClassEscapeNonWordParser: Parser<CharacterSet, string> = promiseCompose(
	createExactSequenceParser('\\W'),
	() => nonWordChars,
);

const charClassEscapeSpaceParser: Parser<CharacterSet, string> = promiseCompose(
	createExactSequenceParser('\\s'),
	() => whiteSpaceChars,
);

const charClassEscapeNonSpaceParser: Parser<CharacterSet, string> = promiseCompose(
	createExactSequenceParser('\\S'),
	() => nonWhiteSpaceChars,
);

const charClassEscapeHexParser: Parser<CharacterSet, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('\\x'),
		createFixedLengthSequenceParser<string>(2),
	]),
	([, hexCode]) => characterSetSingleton(String.fromCharCode(Number.parseInt(hexCode, 16))),
);

const charClassEscapeUnicodeParser: Parser<CharacterSet, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('\\u'),
		createFixedLengthSequenceParser<string>(4),
	]),
	([, hexCode]) => characterSetSingleton(String.fromCharCode(Number.parseInt(hexCode, 16))),
);

const charClassEscapeMetacharacterParser: Parser<CharacterSet, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('\\'),
		elementParser,
	]),
	([, char]) => characterSetSingleton(char),
);

// Use createDisjunctionParser to try specific escapes before generic metacharacter escape
const charClassEscapeParser: Parser<CharacterSet, string> = createDisjunctionParser([
	charClassEscapeNParser,
	charClassEscapeRParser,
	charClassEscapeTParser,
	charClassEscapeFParser,
	charClassEscapeVParser,
	charClassEscape0Parser,
	charClassEscapeDigitParser,
	charClassEscapeNonDigitParser,
	charClassEscapeWordParser,
	charClassEscapeNonWordParser,
	charClassEscapeSpaceParser,
	charClassEscapeNonSpaceParser,
	charClassEscapeHexParser,
	charClassEscapeUnicodeParser,
	charClassEscapeMetacharacterParser, // Must be last - matches any escaped char
]);

// Single character (not escape, not ], not -)
const charClassLiteralParser: Parser<CharacterSet, string> = parserCreatorCompose(
	() => elementParser,
	char => async parserContext => {
		parserContext.invariant(!charClassMetaCharacters.has(char), 'Unexpected character class metacharacter "%s"', char);
		return characterSetSingleton(char);
	},
)();

// Single char in character class (escape or literal) - returns the character string for range checking
const charClassSingleCharParser: Parser<string, string> = createUnionParser([
	// Escape sequences that produce single chars
	promiseCompose(createExactSequenceParser('\\n'), () => '\n'),
	promiseCompose(createExactSequenceParser('\\r'), () => '\r'),
	promiseCompose(createExactSequenceParser('\\t'), () => '\t'),
	promiseCompose(createExactSequenceParser('\\f'), () => '\f'),
	promiseCompose(createExactSequenceParser('\\v'), () => '\v'),
	promiseCompose(createExactSequenceParser('\\0'), () => '\0'),
	promiseCompose(
		createTupleParser([
			createExactSequenceParser('\\x'),
			createFixedLengthSequenceParser<string>(2),
		]),
		([, hexCode]) => String.fromCharCode(Number.parseInt(hexCode, 16)),
	),
	promiseCompose(
		createTupleParser([
			createExactSequenceParser('\\u'),
			createFixedLengthSequenceParser<string>(4),
		]),
		([, hexCode]) => String.fromCharCode(Number.parseInt(hexCode, 16)),
	),
	promiseCompose(
		createTupleParser([
			createExactSequenceParser('\\'),
			elementParser,
		]),
		([, char]) => char,
	),
	// Literal char (not metacharacter, not -)
	parserCreatorCompose(
		() => elementParser,
		char => async parserContext => {
			parserContext.invariant(
				!charClassMetaCharacters.has(char) && char !== '-',
				'Unexpected character "%s"',
				char,
			);
			return char;
		},
	)(),
]);

// Character range (a-z)
const charClassRangeParser: Parser<CharacterSet, string> = promiseCompose(
	createTupleParser([
		charClassSingleCharParser,
		createExactSequenceParser('-'),
		charClassSingleCharParser,
	]),
	([startChar, , endChar]) => characterSetCharRange(startChar, endChar),
);

// Character class element: range, escape (for \d, \w, etc.), or single char
const charClassElementParser: Parser<CharacterSet, string> = createDisjunctionParser([
	charClassRangeParser,
	charClassEscapeParser,
	charClassLiteralParser,
	// Literal hyphen at end or after negation
	promiseCompose(
		createTupleParser([
			createExactSequenceParser('-'),
			createNegativeLookaheadParser(createExactSequenceParser(']')),
		]),
		() => characterSetSingleton('-'),
	),
]);

// Character class [...]
const characterClassParser: Parser<RegularExpression, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('['),
		createOptionalParser(createExactSequenceParser('^')),
		createTerminatedArrayParser(
			charClassElementParser,
			createExactSequenceParser(']'),
		),
	]),
	([, negation, [elements]]) => {
		let charset = elements.reduce(
			(acc, el) => characterSetUnion(acc, el),
			emptyCharacterSet,
		);
		if (negation !== undefined) {
			charset = characterSetComplement(charset);
		}
		return literal(charset);
	},
);

// Quantifiers
type Quantifier =
	| { type: 'star' }
	| { type: 'plus' }
	| { type: 'optional' }
	| { type: 'repeat'; bounds: RepeatBounds };

const starQuantifierParser: Parser<Quantifier, string> = promiseCompose(
	createExactSequenceParser('*'),
	() => ({ type: 'star' as const }),
);

const plusQuantifierParser: Parser<Quantifier, string> = promiseCompose(
	createExactSequenceParser('+'),
	() => ({ type: 'plus' as const }),
);

const optionalQuantifierParser: Parser<Quantifier, string> = promiseCompose(
	createExactSequenceParser('?'),
	() => ({ type: 'optional' as const }),
);

// Parse a number for quantifiers
const numberParser: Parser<number, string> = parserCreatorCompose(
	() => createArrayParser(parserCreatorCompose(
		() => elementParser,
		char => async parserContext => {
			parserContext.invariant(char >= '0' && char <= '9', 'Expected digit, got "%s"', char);
			return char;
		},
	)()),
	digits => async parserContext => {
		parserContext.invariant(digits.length > 0, 'Expected at least one digit');
		return Number.parseInt(digits.join(''), 10);
	},
)();

// {n}, {n,}, {n,m}
const braceQuantifierParser: Parser<Quantifier, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('{'),
		numberParser,
		createOptionalParser(
			createTupleParser([
				createExactSequenceParser(','),
				createOptionalParser(numberParser),
			]),
		),
		createExactSequenceParser('}'),
	]),
	([, min, comma]): Quantifier => {
		if (comma === undefined) {
			// {n} - exactly n
			return { type: 'repeat', bounds: min };
		}
		const [, max] = comma;
		if (max === undefined) {
			// {n,} - at least n
			return { type: 'repeat', bounds: { min } };
		}
		// {n,m} - between n and m
		return { type: 'repeat', bounds: { min, max } };
	},
);

const quantifierParser: Parser<Quantifier, string> = createUnionParser([
	starQuantifierParser,
	plusQuantifierParser,
	optionalQuantifierParser,
	braceQuantifierParser,
]);

// Groups
// Capture group (...)
const captureGroupParser: Parser<RegularExpression, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('('),
		createNegativeLookaheadParser(createExactSequenceParser('?')),
		createParserAccessorParser(() => alternationParser),
		createExactSequenceParser(')'),
	]),
	([, , inner]) => captureGroup(inner),
);

// Named capture group (?<name>...)
const namedCaptureGroupParser: Parser<RegularExpression, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('(?<'),
		createTerminatedArrayParser(
			parserCreatorCompose(
				() => elementParser,
				char => async parserContext => {
					parserContext.invariant(char !== '>', 'Unexpected ">"');
					return char;
				},
			)(),
			createExactSequenceParser('>'),
		),
		createParserAccessorParser(() => alternationParser),
		createExactSequenceParser(')'),
	]),
	([, [nameChars], inner]) => captureGroup(inner, nameChars.join('')),
);

// Non-capture group (?:...)
const nonCaptureGroupParser: Parser<RegularExpression, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('(?:'),
		createParserAccessorParser(() => alternationParser),
		createExactSequenceParser(')'),
	]),
	([, inner]) => inner,
);

// Lookahead markers for internal use during parsing
type LookaheadMarker = { type: 'lookahead-marker'; isPositive: boolean; inner: RegularExpression };

// Positive lookahead (?=...)
const positiveLookaheadMarkerParser: Parser<LookaheadMarker, string> = createObjectParser({
	type: 'lookahead-marker' as const,
	isPositive: true as const,
	_open: createExactSequenceParser('(?='),
	inner: createParserAccessorParser(() => alternationParser),
	_close: createExactSequenceParser(')'),
});

// Negative lookahead (?!...)
const negativeLookaheadMarkerParser: Parser<LookaheadMarker, string> = createObjectParser({
	type: 'lookahead-marker' as const,
	isPositive: false as const,
	_open: createExactSequenceParser('(?!'),
	inner: createParserAccessorParser(() => alternationParser),
	_close: createExactSequenceParser(')'),
});

const groupParser: Parser<RegularExpression, string> = createUnionParser([
	namedCaptureGroupParser,
	nonCaptureGroupParser,
	captureGroupParser,
]);

// Anchors
// Anchor markers for internal use during parsing
type AnchorMarker = { type: 'start-anchor-marker' } | { type: 'end-anchor-marker' };
type ParsedElement = RegularExpression | AnchorMarker | LookaheadMarker;

const startAnchorMarkerParser: Parser<AnchorMarker, string> = createObjectParser({
	type: 'start-anchor-marker' as const,
	_marker: createExactSequenceParser('^'),
});

const endAnchorMarkerParser: Parser<AnchorMarker, string> = createObjectParser({
	type: 'end-anchor-marker' as const,
	_marker: createExactSequenceParser('$'),
});

// Atom: the basic unit that can be quantified (excluding anchors)
const atomParser: Parser<RegularExpression, string> = createUnionParser([
	groupParser,
	characterClassParser,
	escapeParser,
	dotParser,
	literalCharacterParser,
]);

// Quantified atom
const quantifiedParser: Parser<RegularExpression, string> = promiseCompose(
	createTupleParser([
		atomParser,
		createOptionalParser(quantifierParser),
	]),
	([atom, quantifier]) => {
		if (quantifier === undefined) {
			return atom;
		}
		switch (quantifier.type) {
			case 'star':
				return star(atom);
			case 'plus':
				return plus(atom);
			case 'optional':
				return optional(atom);
			case 'repeat':
				return repeat(atom, quantifier.bounds);
		}
	},
);

// Element in a sequence: either a quantified atom, anchor marker, or lookahead marker
const sequenceElementParser: Parser<ParsedElement, string> = createUnionParser([
	startAnchorMarkerParser,
	endAnchorMarkerParser,
	positiveLookaheadMarkerParser,
	negativeLookaheadMarkerParser,
	quantifiedParser,
]);

// Helper to concatenate a list of RegularExpressions (right-associative)
function concatList(parts: RegularExpression[]): RegularExpression {
	if (parts.length === 0) {
		return epsilon;
	}
	return parts.reduceRight((acc, part) => concat(part, acc));
}

// Process elements with anchor markers and lookahead markers into proper AST
// Handles anchors and lookahead as infix operators like @gruhn/regex-utils
// Precedence order (lowest to highest): union -> start-anchor -> end-anchor -> lookahead -> concat
function processElements(elements: ParsedElement[]): RegularExpression {
	if (elements.length === 0) {
		return epsilon;
	}

	// Process start anchors first (lowest precedence among infix operators)
	const startAnchorIdx = elements.findIndex(e => 'type' in e && e.type === 'start-anchor-marker');
	if (startAnchorIdx !== -1) {
		const left = elements.slice(0, startAnchorIdx);
		const right = elements.slice(startAnchorIdx + 1);
		return startAnchor(processElements(left), processElements(right));
	}

	// Then end anchors
	const endAnchorIdx = elements.findIndex(e => 'type' in e && e.type === 'end-anchor-marker');
	if (endAnchorIdx !== -1) {
		const left = elements.slice(0, endAnchorIdx);
		const right = elements.slice(endAnchorIdx + 1);
		return endAnchor(processElements(left), processElements(right));
	}

	// Then lookaheads (higher precedence than anchors)
	const lookaheadIdx = elements.findIndex(e => 'type' in e && e.type === 'lookahead-marker');
	if (lookaheadIdx !== -1) {
		const marker = elements[lookaheadIdx] as LookaheadMarker;
		const left = elements.slice(0, lookaheadIdx);
		const right = elements.slice(lookaheadIdx + 1);
		const lookaheadExpr = lookahead(marker.isPositive, marker.inner, processElements(right));
		if (left.length === 0) {
			return lookaheadExpr;
		}
		// If there's content before the lookahead, concatenate it
		return concat(processElements(left), lookaheadExpr);
	}

	// No markers, just regular expressions - concatenate them
	const regexParts = elements as RegularExpression[];
	return concatList(regexParts);
}

// Concatenation: sequence of quantified atoms and anchors
const concatParser: Parser<RegularExpression, string> = promiseCompose(
	createArrayParser(sequenceElementParser),
	processElements,
);

// Alternation: concat ('|' concat)*
const alternationParser: Parser<RegularExpression, string> = promiseCompose(
	createTupleParser([
		concatParser,
		createArrayParser(
			promiseCompose(
				createTupleParser([
					createExactSequenceParser('|'),
					concatParser,
				]),
				([, right]) => right,
			),
		),
	]),
	([first, rest]) => {
		// Right-associative union like @gruhn/regex-utils
		const allParts = [first, ...rest];
		return allParts.reduceRight((acc, part) => union(part, acc));
	},
);

export const regularExpressionParser: Parser<RegularExpression, string> = alternationParser;
