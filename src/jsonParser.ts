import {
	type JsonArray, type JsonObject, type JsonPrimitive, type JsonValue, type Writable,
} from 'type-fest';
import { setParserName, type Parser } from './parser.js';
import { createFixedLengthSequenceParser } from './fixedLengthSequenceParser.js';
import { createUnionParser } from './unionParser.js';
import { createExactSequenceParser } from './exactSequenceParser.js';
import { promiseCompose } from './promiseCompose.js';
import { createTupleParser } from './tupleParser.js';
import { createDisjunctionParser } from './disjunctionParser.js';
import { createTerminatedArrayParser } from './terminatedArrayParser.js';
import { createArrayParser } from './arrayParser.js';
import { createParserAccessorParser } from './parserAccessorParser.js';
import { createElementParser } from './elementParser.js';
import { parserCreatorCompose } from './parserCreatorCompose.js';
import { createSeparatedArrayParser } from './separatedArrayParser.js';

const whitespaceParser: Parser<unknown, string> = createArrayParser(createUnionParser([
	createExactSequenceParser(' '),
	createExactSequenceParser('\t'),
	createExactSequenceParser('\r'),
	createExactSequenceParser('\n'),
]));

const jsonQuoteEscapeSequenceParser: Parser<string, string> = promiseCompose(createExactSequenceParser(String.raw`\"`), () => '"');
const jsonBackslashEscapeSequenceParser: Parser<string, string> = promiseCompose(createExactSequenceParser('\\\\'), () => '\\');
const jsonSlashEscapeSequenceParser: Parser<string, string> = promiseCompose(createExactSequenceParser(String.raw`\/`), () => '/');
const jsonBackspaceEscapeSequenceParser: Parser<string, string> = promiseCompose(createExactSequenceParser(String.raw`\b`), () => '\b');
const jsonFormFeedEscapeSequenceParser: Parser<string, string> = promiseCompose(createExactSequenceParser(String.raw`\f`), () => '\f');
const jsonNewLineEscapeSequenceParser: Parser<string, string> = promiseCompose(createExactSequenceParser(String.raw`\n`), () => '\n');
const jsonCarriageReturnEscapeSequenceParser: Parser<string, string> = promiseCompose(createExactSequenceParser(String.raw`\r`), () => '\r');
const jsonTabEscapeSequenceParser: Parser<string, string> = promiseCompose(createExactSequenceParser(String.raw`\t`), () => '\t');

const jsonUnicodeEscapeSequenceParser: Parser<string, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser(String.raw`\u`),
		createFixedLengthSequenceParser<string>(4),
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

const elementParser: Parser<string, string> = createElementParser();

const jsonStringCharacterParser: Parser<string, string> = createDisjunctionParser([
	jsonStringEscapeSequenceParser,
	parserCreatorCompose(
		() => elementParser,
		character => async parserContext => {
			parserContext.invariant(character !== '"', 'Unexpected """');
			return character;
		},
	)(),
]);

export const jsonStringParser: Parser<string, string> = promiseCompose(
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

export const jsonNumberParser: Parser<number, string> = parserCreatorCompose(
	() => createArrayParser(parserCreatorCompose(
		() => elementParser,
		character => async parserContext => {
			parserContext.invariant(
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
	)()),
	characters => async parserContext => {
		parserContext.invariant(characters.length > 0, 'Expected at least one character');

		return Number(characters.join(''));
	},
)();

const jsonTrueParser: Parser<true, string> = promiseCompose(createExactSequenceParser('true'), () => true);

setParserName(jsonTrueParser, 'jsonTrueParser');

const jsonFalseParser: Parser<false, string> = promiseCompose(createExactSequenceParser('false'), () => false);

setParserName(jsonFalseParser, 'jsonFalseParser');

// eslint-disable-next-line @typescript-eslint/ban-types
const jsonNullParser: Parser<null, string> = promiseCompose(createExactSequenceParser('null'), () => null);

setParserName(jsonNullParser, 'jsonNullParser');

const jsonPrimitiveParser: Parser<JsonPrimitive, string> = createUnionParser([
	jsonStringParser,
	jsonNumberParser,
	jsonTrueParser,
	jsonFalseParser,
	jsonNullParser,
]);

setParserName(jsonPrimitiveParser, 'jsonPrimitiveParser');

const jsonObjectEntryParser: Parser<[string, JsonValue], string> = promiseCompose(
	createTupleParser([
		jsonStringParser,
		whitespaceParser,
		createExactSequenceParser(':'),
		whitespaceParser,
		createParserAccessorParser(() => jsonValueParser),
	]),
	([ key, _whitespace1, _colon, _whitespace2, value ]) => [ key, value ],
);

const jsonObjectParser: Parser<JsonObject, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('{'),
		whitespaceParser,
		promiseCompose(
			createTerminatedArrayParser(
				createDisjunctionParser([
					promiseCompose(
						createTupleParser([
							createParserAccessorParser(() => jsonObjectEntryParser),
							whitespaceParser,
							createExactSequenceParser(','),
							whitespaceParser,
						]),
						([ entry ]) => entry,
					),
					promiseCompose(
						createTupleParser([
							createParserAccessorParser(() => jsonObjectEntryParser),
							whitespaceParser,
						]),
						([ value ]) => value,
					),
				]),
				createExactSequenceParser('}'),
			),
			([ entries ]) => entries,
		),
	]),
	([ _brace, _whitespace, entries ]) => {
		const object: Writable<JsonObject> = {};

		for (const [ key, value ] of entries) {
			Object.defineProperty(object, key, {
				value,
				enumerable: true,
			});
		}

		return object;
	},
);

const jsonArrayParser: Parser<JsonArray, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('['),
		whitespaceParser,
		createSeparatedArrayParser(
			createParserAccessorParser(() => jsonValueParser),
			createTupleParser([
				whitespaceParser,
				createExactSequenceParser(','),
				whitespaceParser,
			]),
		),
		whitespaceParser,
		createExactSequenceParser(']'),
		whitespaceParser,
	]),
	([ _bracket, _whitespace, values ]) => values,
);

export const jsonValueParser: Parser<JsonValue, string> = createUnionParser([
	jsonObjectParser,
	jsonArrayParser,
	jsonPrimitiveParser,
]);

setParserName(jsonValueParser, 'jsonValueParser');
