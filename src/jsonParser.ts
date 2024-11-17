import {
	type JsonArray, type JsonObject, type JsonPrimitive, type JsonValue, type Writable,
} from 'type-fest';
import invariant from 'invariant';
import { type Parser } from './parser.js';
import { createFixedLengthChunkParser } from './fixedLengthChunkParser.js';

const jsonStringEscapeSequenceParser: Parser<string, string> = async inputReader => {
	const backslash = await inputReader.peek(0);

	invariant(backslash !== undefined, 'Unexpected end of input');
	invariant(backslash === '\\', 'Expected "\\"');

	inputReader.skip(1);
	const character = await inputReader.peek(0);

	if (character === '"') {
		inputReader.skip(1);
		return '"';
	}

	if (character === '\\') {
		inputReader.skip(1);
		return '\\';
	}

	if (character === '/') {
		inputReader.skip(1);
		return '/';
	}

	if (character === 'b') {
		inputReader.skip(1);
		return '\b';
	}

	if (character === 'f') {
		inputReader.skip(1);
		return '\f';
	}

	if (character === 'n') {
		inputReader.skip(1);
		return '\n';
	}

	if (character === 'r') {
		inputReader.skip(1);
		return '\r';
	}

	if (character === 't') {
		inputReader.skip(1);
		return '\t';
	}

	if (character === 'u') {
		inputReader.skip(1);

		const hexCode = await createFixedLengthChunkParser<string>(4)(inputReader);

		return String.fromCharCode(Number.parseInt(hexCode, 16));
	}

	invariant(false, 'Not implemented %s', character);
};

const jsonStringParser: Parser<string, string> = async inputReader => {
	let quoteCount = 0;
	let string = '';

	while (true) {
		const character = await inputReader.peek(0);

		invariant(character !== undefined, 'Unexpected end of input');

		if (character === '\\') {
			const escapeSequence = await jsonStringEscapeSequenceParser(inputReader);

			string += escapeSequence;

			continue;
		}

		inputReader.skip(1);

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

const jsonNumberParser: Parser<number, string> = async inputReader => {
	let numberString = '';

	while (true) {
		const character = await inputReader.peek(0);

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
			inputReader.skip(1);
		} else {
			break;
		}
	}

	return Number(numberString);
};

const jsonPrimitiveParser: Parser<JsonPrimitive, string> = async inputReader => {
	const character = await inputReader.peek(0);

	invariant(character !== undefined, 'Unexpected end of input');

	if (character === '"') {
		return jsonStringParser(inputReader);
	}

	if (character === '-' || (character >= '0' && character <= '9')) {
		return jsonNumberParser(inputReader);
	}

	if (character === 't') {
		inputReader.skip(4);
		return true;
	}

	if (character === 'f') {
		inputReader.skip(5);
		return false;
	}

	if (character === 'n') {
		inputReader.skip(4);
		return null;
	}

	invariant(false, 'Not implemented %s', character);
};

const jsonObjectParser: Parser<JsonObject, string> = async inputReader => {
	const value: JsonObject = {};

	const firstCharacter = await inputReader.peek(0);

	invariant(firstCharacter === '{', 'Expected "{"');

	inputReader.skip(1);

	while (true) {
		const keyStartOrClosingBrace = await inputReader.peek(0);

		if (keyStartOrClosingBrace === '}') {
			inputReader.skip(1);
			break;
		}

		const key = await jsonStringParser(inputReader);

		const colon = await inputReader.peek(0);

		invariant(colon === ':', 'Expected ":"');

		inputReader.skip(1);

		const keyValue = await jsonValueParser(inputReader);

		Object.defineProperty(value, key, {
			value: keyValue,
			enumerable: true,
		});

		const commaOrClosingBrace = await inputReader.peek(0);

		if (commaOrClosingBrace === '}') {
			inputReader.skip(1);
			break;
		}

		invariant(commaOrClosingBrace === ',', 'Expected ","');

		inputReader.skip(1);
	}

	return value;
};

const jsonArrayParser: Parser<JsonArray, string> = async inputReader => {
	const value: Writable<JsonArray> = [];

	const firstCharacter = await inputReader.peek(0);

	invariant(firstCharacter === '[', 'Expected "["');

	inputReader.skip(1);

	while (true) {
		const valueStartOrClosingBracket = await inputReader.peek(0);

		if (valueStartOrClosingBracket === ']') {
			inputReader.skip(1);
			break;
		}

		const keyValue = await jsonValueParser(inputReader);

		value.push(keyValue);

		const commaOrClosingBracket = await inputReader.peek(0);

		if (commaOrClosingBracket === ']') {
			inputReader.skip(1);
			break;
		}

		invariant(commaOrClosingBracket === ',', 'Expected ","');

		inputReader.skip(1);
	}

	return value;
};

export const jsonValueParser: Parser<JsonValue, string> = async inputReader => {
	const character = await inputReader.peek(0);

	invariant(character !== undefined, 'Unexpected end of input');

	if (character === '{') {
		return jsonObjectParser(inputReader);
	}

	if (character === '[') {
		return jsonArrayParser(inputReader);
	}

	return jsonPrimitiveParser(inputReader);
};
