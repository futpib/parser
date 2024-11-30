import {
	type JsonArray, type JsonObject, type JsonPrimitive, type JsonValue, type Writable,
} from 'type-fest';
import { type Parser } from './parser.js';
import { createFixedLengthParser } from './fixedLengthParser.js';
import { parserParsingInvariant } from './parserParsingInvariant.js';
import { createUnionParser } from './unionParser.js';
import { createExactSequenceParser } from './exactSequenceParser.js';
import { promiseCompose } from './promiseCompose.js';
import { createTupleParser } from './tupleParser.js';
import { createDisjunctionParser } from './disjunctionParser.js';
import { createTerminatedArrayParser } from './terminatedArrayParser.js';
import { createArrayParser } from './arrayParser.js';

const jsonQuoteEscapeSequenceParser: Parser<string, string> = promiseCompose(createExactSequenceParser('\\"'), () => '"');
const jsonBackslashEscapeSequenceParser: Parser<string, string> = promiseCompose(createExactSequenceParser('\\\\'), () => '\\');
const jsonSlashEscapeSequenceParser: Parser<string, string> = promiseCompose(createExactSequenceParser('\\/'), () => '/');
const jsonBackspaceEscapeSequenceParser: Parser<string, string> = promiseCompose(createExactSequenceParser('\\b'), () => '\b');
const jsonFormFeedEscapeSequenceParser: Parser<string, string> = promiseCompose(createExactSequenceParser('\\f'), () => '\f');
const jsonNewLineEscapeSequenceParser: Parser<string, string> = promiseCompose(createExactSequenceParser('\\n'), () => '\n');
const jsonCarriageReturnEscapeSequenceParser: Parser<string, string> = promiseCompose(createExactSequenceParser('\\r'), () => '\r');
const jsonTabEscapeSequenceParser: Parser<string, string> = promiseCompose(createExactSequenceParser('\\t'), () => '\t');

const jsonUnicodeEscapeSequenceParser: Parser<string, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('\\u'),
		createFixedLengthParser<string>(4),
	]),
	([ , hexCode ]) => String.fromCharCode(Number.parseInt(hexCode, 16)),
);

const jsonStringEscapeSequenceParser: Parser<string, string> = createUnionParser([
	jsonQuoteEscapeSequenceParser,
	jsonBackslashEscapeSequenceParser,
	jsonSlashEscapeSequenceParser,
	jsonBackspaceEscapeSequenceParser,
	jsonFormFeedEscapeSequenceParser,
	jsonNewLineEscapeSequenceParser,
	jsonCarriageReturnEscapeSequenceParser,
	jsonTabEscapeSequenceParser,
	jsonUnicodeEscapeSequenceParser,
]);

const elementParser: Parser<string, string> = async parserContext => parserContext.read(0);

const jsonStringCharacterParser: Parser<string, string> = createDisjunctionParser([
	jsonStringEscapeSequenceParser,
	promiseCompose(elementParser, character => {
		parserParsingInvariant(character !== '"', 'Unexpected """');
		return character;
	}),
]);

const jsonStringParser: Parser<string, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('"'),
		promiseCompose(
			createTerminatedArrayParser(
				jsonStringCharacterParser,
				createExactSequenceParser('"'),
			),
			([ characters ]) => characters.join(''),
		),
	]),
	([ , string ]) => string,
);

const jsonNumberParser: Parser<number, string> = promiseCompose(
	createArrayParser(
		promiseCompose(
			elementParser,
			(character) => {
				parserParsingInvariant(
					(
						character === '-'
							|| (character >= '0' && character <= '9')
							|| character === '.'
							|| character === 'e'
							|| character === 'E'
							|| character === '+'
					),
					'Expected "-", "0" to "9", ".", "e", "E", "+", got "%s"',
					character,
				);

				return character;
			},
		),
	),
	(characters) => {
		parserParsingInvariant(characters.length > 0, 'Expected at least one character');

		return Number(characters.join(''));
	},
);

const jsonTrueParser: Parser<true, string> = promiseCompose(createExactSequenceParser('true'), () => true);

Object.defineProperty(jsonTrueParser, 'name', { value: 'jsonTrueParser' });

const jsonFalseParser: Parser<false, string> = promiseCompose(createExactSequenceParser('false'), () => false);

Object.defineProperty(jsonFalseParser, 'name', { value: 'jsonFalseParser' });

const jsonNullParser: Parser<null, string> = promiseCompose(createExactSequenceParser('null'), () => null);

Object.defineProperty(jsonNullParser, 'name', { value: 'jsonNullParser' });

const jsonPrimitiveParser: Parser<JsonPrimitive, string> = createUnionParser([
	jsonStringParser,
	jsonNumberParser,
	jsonTrueParser,
	jsonFalseParser,
	jsonNullParser,
]);

Object.defineProperty(jsonPrimitiveParser, 'name', { value: 'jsonPrimitiveParser' });

const jsonObjectParser: Parser<JsonObject, string> = async parserContext => {
	const value: JsonObject = {};

	const firstCharacter = await parserContext.read(0);

	parserParsingInvariant(firstCharacter === '{', 'Expected "{", got "%s"', firstCharacter);

	while (true) {
		const keyStartOrClosingBrace = await parserContext.peek(0);

		if (keyStartOrClosingBrace === '}') {
			parserContext.skip(1);
			break;
		}

		const key = await jsonStringParser(parserContext);

		const colon = await parserContext.read(0);

		parserParsingInvariant(colon === ':', 'Expected ":", got "%s"', colon);

		const keyValue = await jsonValueParser(parserContext);

		Object.defineProperty(value, key, {
			value: keyValue,
			enumerable: true,
		});

		const commaOrClosingBrace = await parserContext.peek(0);

		parserParsingInvariant(
			(
				commaOrClosingBrace === ','
					|| commaOrClosingBrace === '}'
			),
			'Expected "," or "}", got "%s"',
			commaOrClosingBrace,
		);

		if (commaOrClosingBrace === '}') {
			parserContext.skip(1);
			break;
		}

		parserParsingInvariant(commaOrClosingBrace === ',', 'Expected ",", got "%s"', commaOrClosingBrace);

		parserContext.skip(1);
	}

	return value;
};

const jsonArrayParser: Parser<JsonArray, string> = async parserContext => {
	const value: Writable<JsonArray> = [];

	const firstCharacter = await parserContext.read(0);

	parserParsingInvariant(firstCharacter === '[', 'Expected "[", got "%s"', firstCharacter);

	while (true) {
		const valueStartOrClosingBracket = await parserContext.peek(0);

		if (valueStartOrClosingBracket === ']') {
			parserContext.skip(1);
			break;
		}

		const elementValue = await jsonValueParser(parserContext);

		value.push(elementValue);

		const commaOrClosingBracket = await parserContext.peek(0);

		if (commaOrClosingBracket === ']') {
			parserContext.skip(1);
			break;
		}

		parserParsingInvariant(commaOrClosingBracket === ',', 'Expected ",", got "%s"', commaOrClosingBracket);

		parserContext.skip(1);
	}

	return value;
};

export const jsonValueParser: Parser<JsonValue, string> = createUnionParser([
	jsonObjectParser,
	jsonArrayParser,
	jsonPrimitiveParser,
]);

Object.defineProperty(jsonValueParser, 'name', { value: 'jsonValueParser' });
