import {
	type JsonArray, type JsonObject, type JsonPrimitive, type JsonValue, type Writable,
} from 'type-fest';
import invariant from 'invariant';
import { type Parser } from './parser.js';
import { createFixedLengthParser } from './fixedLengthParser.js';
import { parserParsingInvariant } from './parserParsingInvariant.js';
import { createUnionParser } from './unionParser.js';

const jsonStringEscapeSequenceParser: Parser<string, string> = async inputContext => {
	const backslash = await inputContext.read(0);

	parserParsingInvariant(backslash === '\\', 'Expected "\\", got "%s"', backslash);

	const character = await inputContext.peek(0);

	if (character === '"') {
		inputContext.skip(1);
		return '"';
	}

	if (character === '\\') {
		inputContext.skip(1);
		return '\\';
	}

	if (character === '/') {
		inputContext.skip(1);
		return '/';
	}

	if (character === 'b') {
		inputContext.skip(1);
		return '\b';
	}

	if (character === 'f') {
		inputContext.skip(1);
		return '\f';
	}

	if (character === 'n') {
		inputContext.skip(1);
		return '\n';
	}

	if (character === 'r') {
		inputContext.skip(1);
		return '\r';
	}

	if (character === 't') {
		inputContext.skip(1);
		return '\t';
	}

	if (character === 'u') {
		inputContext.skip(1);

		const hexCode = await createFixedLengthParser<string>(4)(inputContext);

		return String.fromCharCode(Number.parseInt(hexCode, 16));
	}

	invariant(false, 'Not implemented %s', character);
};

const jsonStringParser: Parser<string, string> = async inputContext => {
	let quoteCount = 0;
	let string = '';

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
	let numberString = '';

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

const jsonPrimitiveParser: Parser<JsonPrimitive, string> = async inputContext => {
	const character = parserParsingInvariant(await inputContext.peek(0), 'Unexpected end of input');

	if (character === '"') {
		return jsonStringParser(inputContext);
	}

	if (character === '-' || (character >= '0' && character <= '9')) {
		return jsonNumberParser(inputContext);
	}

	if (character === 't') {
		inputContext.skip(4);
		return true;
	}

	if (character === 'f') {
		inputContext.skip(5);
		return false;
	}

	if (character === 'n') {
		inputContext.skip(4);
		return null;
	}

	return parserParsingInvariant(false, 'Unexpected character "%s"', character);
};

const jsonObjectParser: Parser<JsonObject, string> = async inputContext => {
	const value: JsonObject = {};

	const firstCharacter = await inputContext.peek(0);

	parserParsingInvariant(firstCharacter === '{', 'Expected "{", got "%s"', firstCharacter);

	inputContext.skip(1);

	while (true) {
		const keyStartOrClosingBrace = await inputContext.peek(0);

		if (keyStartOrClosingBrace === '}') {
			inputContext.skip(1);
			break;
		}

		const key = await jsonStringParser(inputContext);

		const colon = await inputContext.peek(0);

		parserParsingInvariant(colon === ':', 'Expected ":", got "%s"', colon);

		inputContext.skip(1);

		const keyValue = await jsonValueParser(inputContext);

		Object.defineProperty(value, key, {
			value: keyValue,
			enumerable: true,
		});

		const commaOrClosingBrace = await inputContext.peek(0);

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

	const firstCharacter = await inputContext.peek(0);

	parserParsingInvariant(firstCharacter === '[', 'Expected "[", got "%s"', firstCharacter);

	inputContext.skip(1);

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
