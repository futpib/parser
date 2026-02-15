import { type JsonObject, type JsonValue } from 'type-fest';
import { getParserName, setParserName, type Parser } from './parser.js';
import { createFixedLengthSequenceParser } from './fixedLengthSequenceParser.js';
import { promiseCompose } from './promiseCompose.js';
import { createTupleParser } from './tupleParser.js';
import { createSkipParser } from './skipParser.js';
import { createParserAccessorParser } from './parserAccessorParser.js';
import { createTerminatedArrayParser } from './terminatedArrayParser.js';
import { createExactElementParser } from './exactElementParser.js';
import { createUnionParser } from './unionParser.js';
import { parserCreatorCompose } from './parserCreatorCompose.js';
import { createPredicateElementParser } from './predicateElementParser.js';

const createFixedLengthBufferParser = (length: number): Parser<Buffer, Uint8Array> => promiseCompose(createFixedLengthSequenceParser<Uint8Array>(length), sequence => Buffer.from(sequence));

const buffer1Parser = createFixedLengthBufferParser(1);
const buffer4Parser = createFixedLengthBufferParser(4);
const buffer8Parser = createFixedLengthBufferParser(8);

const nullByteParser: Parser<number, Uint8Array> = createExactElementParser(0);

const nonNullByteParser: Parser<number, Uint8Array> = createPredicateElementParser((byte: number) => byte !== 0);

const cstringParser: Parser<string, Uint8Array> = promiseCompose(
	createTerminatedArrayParser(
		nonNullByteParser,
		nullByteParser,
	),
	([ sequence ]) => Buffer.from(sequence).toString('utf8'),
);

const doubleParser: Parser<number, Uint8Array> = promiseCompose(buffer8Parser, buffer => buffer.readDoubleLE(0));

setParserName(doubleParser, 'doubleParser');

const int32Parser: Parser<number, Uint8Array> = promiseCompose(buffer4Parser, buffer => buffer.readInt32LE(0));

setParserName(int32Parser, 'int32Parser');

const uint32Parser: Parser<number, Uint8Array> = promiseCompose(buffer4Parser, buffer => buffer.readUInt32LE(0));

setParserName(uint32Parser, 'uint32Parser');

const createFixedLengthStringParser = (length: number): Parser<string, Uint8Array> => promiseCompose(
	createFixedLengthBufferParser(length),
	buffer => buffer.toString('utf8'),
);

const createFixedLengthNullTerminatedStringParser = (lengthWihoutNullTerminator: number): Parser<string, Uint8Array> => promiseCompose(
	createTupleParser([
		createFixedLengthStringParser(lengthWihoutNullTerminator),
		nullByteParser,
	]),
	([ string ]) => string,
);

const bsonStringParser: Parser<string, Uint8Array> = async parserContext => {
	const stringSize = await uint32Parser(parserContext);

	return createFixedLengthNullTerminatedStringParser(stringSize - 1)(parserContext);
};

setParserName(bsonStringParser, 'bsonStringParser');

const bsonArrayParser = promiseCompose(
	createTupleParser([
		createSkipParser(4),
		createParserAccessorParser(() => bsonElementListParser),
	]),
	([ _, elements ]) => elements.map(([ _, value ]) => value),
);

setParserName(bsonArrayParser, 'bsonArrayParser');

const bsonBooleanParser: Parser<boolean, Uint8Array> = async parserContext => {
	const booleanValue = await parserContext.read(0);

	return booleanValue === 1;
};

const int8Parser: Parser<number, Uint8Array> = promiseCompose(buffer1Parser, buffer => buffer.readInt8(0));

const createExactInt8Parser = (value: number): Parser<number, Uint8Array> => parserCreatorCompose(
	() => int8Parser,
	actualValue => async parserContext => {
		parserContext.invariant(actualValue === value, 'Expected %s, got %s', value, actualValue);

		return actualValue;
	},
)();

const createBsonElementParser = <ValueOutput>(
	elementType: number,
	valueParser: Parser<ValueOutput, Uint8Array>,
): Parser<[ string, ValueOutput ], Uint8Array> => setParserName(
	promiseCompose(
		createTupleParser([
			createExactInt8Parser(elementType),
			cstringParser,
			valueParser,
		]),
		([ _, elementName, elementValue ]) => [ elementName, elementValue ],
	),
	`bsonElementParser(${elementType}, ${getParserName(valueParser)})`,
);

const bsonDoubleElementParser = createBsonElementParser(1, doubleParser);
const bsonStringElementParser = createBsonElementParser(2, bsonStringParser);
const bsonDocumentElementParser = createBsonElementParser(3, createParserAccessorParser(() => bsonDocumentParser));
const bsonArrayElementParser = createBsonElementParser(4, bsonArrayParser);
const bsonBooleanElementParser = createBsonElementParser(8, bsonBooleanParser);
const bsonNullElementParser = createBsonElementParser(10, async () => null);
const bsonInt32ElementParser = createBsonElementParser(16, int32Parser);

const bsonElementParser: Parser<[ string, JsonValue ], Uint8Array> = createUnionParser([
	bsonDoubleElementParser,
	bsonStringElementParser,
	bsonDocumentElementParser,
	bsonArrayElementParser,
	bsonBooleanElementParser,
	bsonNullElementParser,
	bsonInt32ElementParser,
]);

const bsonElementListParser: Parser<Array<[ string, JsonValue ]>, Uint8Array> = promiseCompose(
	createTerminatedArrayParser(
		bsonElementParser,
		nullByteParser,
	),
	([ elements ]) => elements,
);

export const bsonDocumentParser: Parser<JsonObject, Uint8Array> = promiseCompose(
	createTupleParser([
		createSkipParser(4),
		bsonElementListParser,
	]),
	([ _, elements ]) => Object.fromEntries(elements),
);
