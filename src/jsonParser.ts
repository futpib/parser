import {
	type JsonArray, type JsonObject, type JsonPrimitive, type JsonValue, type Writable,
} from 'type-fest';
import { type Parser } from './parser.js';
import { createFixedLengthParser } from './fixedLengthParser.js';
import { parserParsingInvariant } from './parserParsingInvariant.js';
import { createUnionParser } from './unionParser.js';
import { createExactSequenceParser } from './exactSequenceParser.js';
import { promiseCompose } from './promiseCompose.js';
import { createSequenceParser } from './sequenceParser.js';

const jsonQuoteEscapeSequenceParser: Parser<string, string> = promiseCompose(createExactSequenceParser('\\"'), () => '"');
const jsonBackslashEscapeSequenceParser: Parser<string, string> = promiseCompose(createExactSequenceParser('\\\\'), () => '\\');
const jsonSlashEscapeSequenceParser: Parser<string, string> = promiseCompose(createExactSequenceParser('\\/'), () => '/');
const jsonBackspaceEscapeSequenceParser: Parser<string, string> = promiseCompose(createExactSequenceParser('\\b'), () => '\b');
const jsonFormFeedEscapeSequenceParser: Parser<string, string> = promiseCompose(createExactSequenceParser('\\f'), () => '\f');
const jsonNewLineEscapeSequenceParser: Parser<string, string> = promiseCompose(createExactSequenceParser('\\n'), () => '\n');
const jsonCarriageReturnEscapeSequenceParser: Parser<string, string> = promiseCompose(createExactSequenceParser('\\r'), () => '\r');
const jsonTabEscapeSequenceParser: Parser<string, string> = promiseCompose(createExactSequenceParser('\\t'), () => '\t');

const jsonUnicodeEscapeSequenceParser: Parser<string, string> = promiseCompose(
	createSequenceParser([
		createExactSequenceParser('\\u'),
		createFixedLengthParser<string>(4),
	]),
	([, hexCode]) => String.fromCharCode(Number.parseInt(hexCode, 16)),
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

const jsonStringParser: Parser<string, string> = async inputContext => {
	let quoteCount = 1;
	let string = '';

	const firstCharacter = await inputContext.read(0);

	parserParsingInvariant(firstCharacter === '"', 'Expected """, got "%s"', firstCharacter);

	while (true) {
		const character = parserParsingInvariant(await inputContext.peek(0), 'Unexpected end of input');

		if (character === '\\') {
			const escapeSequence = await jsonStringEscapeSequenceParser(inputContext);

			string += escapeSequence;

			continue;
		}

		inputContext.skip(1);

		if (character === '"') {
			quoteCount += 1;
		} else {
			string += character;
		}

		if (quoteCount === 2) {
			break;
		}
	}

	return string;
};

const jsonNumberParser: Parser<number, string> = async inputContext => {
	let numberString = await inputContext.read(0);

	parserParsingInvariant(
		numberString === '-' || (numberString >= '0' && numberString <= '9'),
		'Expected "-", "0" to "9", got "%s"',
		numberString,
	);

	while (true) {
		const character = await inputContext.peek(0);

		if (character === undefined) {
			break;
		}

		if (
			character === '-'
				|| (character >= '0' && character <= '9')
				|| character === '.'
				|| character === 'e'
				|| character === 'E'
				|| character === '+'
		) {
			numberString += character;
			inputContext.skip(1);
		} else {
			break;
		}
	}

	return Number(numberString);
};

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

const jsonObjectParser: Parser<JsonObject, string> = async inputContext => {
	const value: JsonObject = {};

	const firstCharacter = await inputContext.read(0);

	parserParsingInvariant(firstCharacter === '{', 'Expected "{", got "%s"', firstCharacter);

	while (true) {
		const keyStartOrClosingBrace = await inputContext.peek(0);

		if (keyStartOrClosingBrace === '}') {
			inputContext.skip(1);
			break;
		}

		const key = await jsonStringParser(inputContext);

		const colon = await inputContext.read(0);

		parserParsingInvariant(colon === ':', 'Expected ":", got "%s"', colon);

		const keyValue = await jsonValueParser(inputContext);

		Object.defineProperty(value, key, {
			value: keyValue,
			enumerable: true,
		});

		const commaOrClosingBrace = await inputContext.peek(0);

		parserParsingInvariant(
			(
				commaOrClosingBrace === ','
					|| commaOrClosingBrace === '}'
			),
			'Expected "," or "}", got "%s"',
			commaOrClosingBrace,
		);

		if (commaOrClosingBrace === '}') {
			inputContext.skip(1);
			break;
		}

		parserParsingInvariant(commaOrClosingBrace === ',', 'Expected ",", got "%s"', commaOrClosingBrace);

		inputContext.skip(1);
	}

	return value;
};

const jsonArrayParser: Parser<JsonArray, string> = async inputContext => {
	const value: Writable<JsonArray> = [];

	const firstCharacter = await inputContext.read(0);

	parserParsingInvariant(firstCharacter === '[', 'Expected "[", got "%s"', firstCharacter);

	while (true) {
		const valueStartOrClosingBracket = await inputContext.peek(0);

		if (valueStartOrClosingBracket === ']') {
			inputContext.skip(1);
			break;
		}

		const elementValue = await jsonValueParser(inputContext);

		value.push(elementValue);

		const commaOrClosingBracket = await inputContext.peek(0);

		if (commaOrClosingBracket === ']') {
			inputContext.skip(1);
			break;
		}

		parserParsingInvariant(commaOrClosingBracket === ',', 'Expected ",", got "%s"', commaOrClosingBracket);

		inputContext.skip(1);
	}

	return value;
};

export const jsonValueParser: Parser<JsonValue, string> = createUnionParser([
	jsonObjectParser,
	jsonArrayParser,
	jsonPrimitiveParser,
]);

Object.defineProperty(jsonValueParser, 'name', { value: 'jsonValueParser' });
