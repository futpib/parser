import { type JsonObject, type JsonValue } from 'type-fest';
import invariant from 'invariant';
import { type Parser } from './parser.js';
import { invariantDefined } from './invariantDefined.js';
import { createFixedLengthParser } from './fixedLengthParser.js';
import { promiseCompose } from './promiseCompose.js';
import { createSequenceParser } from './sequenceParser.js';
import { createSkipParser } from './skipParser.js';

const createFixedLengthBufferParser = (length: number): Parser<Buffer, Uint8Array> => promiseCompose(createFixedLengthParser<Uint8Array>(length), sequence => Buffer.from(sequence));

const buffer1Parser = createFixedLengthBufferParser(1);
const buffer4Parser = createFixedLengthBufferParser(4);
const buffer8Parser = createFixedLengthBufferParser(8);

const cstringParser: Parser<string, Uint8Array> = async parserContext => {
	let string = '';

	while (true) {
		const character = await parserContext.peek(0);

		invariant(character !== undefined, 'Unexpected end of input');

		if (character === 0) {
			parserContext.skip(1);
			break;
		}

		string += String.fromCharCode(character);
		parserContext.skip(1);
	}

	return string;
};

const doubleParser: Parser<number, Uint8Array> = promiseCompose(buffer8Parser, buffer => buffer.readDoubleLE(0));
const int32Parser: Parser<number, Uint8Array> = promiseCompose(buffer4Parser, buffer => buffer.readInt32LE(0));
const uint32Parser: Parser<number, Uint8Array> = promiseCompose(buffer4Parser, buffer => buffer.readUInt32LE(0));

const bsonStringParser: Parser<string, Uint8Array> = async parserContext => {
	const stringSize = await uint32Parser(parserContext);

	let string = '';

	for (let i = 0; i < stringSize - 1; i++) {
		const character = await parserContext.peek(0);

		invariant(character !== undefined, 'Unexpected end of input');

		parserContext.skip(1);

		string += String.fromCharCode(character);
	}

	const nullCharacter = await parserContext.peek(0);

	invariant(nullCharacter === 0, 'Expected null character');

	parserContext.skip(1);

	return string;
};

const createRecursiveParser = <Output, Sequence>(getParser: () => Parser<Output, Sequence>): Parser<Output, Sequence> => (parserContext) => {
	return getParser()(parserContext);
}

const bsonArrayParser = promiseCompose(
	createSequenceParser([
		createSkipParser(4),
		createRecursiveParser(() => bsonElementListParser),
	]),
	([ _, elements ]) => elements.map(([ _, value ]) => value),
);

const bsonBooleanParser: Parser<boolean, Uint8Array> = async parserContext => {
	const booleanValue = invariantDefined(await parserContext.read(0), 'Unexpected end of input');

	return booleanValue === 1;
};

const int8Parser: Parser<number, Uint8Array> = promiseCompose(buffer1Parser, buffer => buffer.readInt8(0));

const bsonElementParser: Parser<[ string, JsonValue ], Uint8Array> = async parserContext => {
	const elementType = await int8Parser(parserContext);
	const elementName = await cstringParser(parserContext);

	if (elementType === 1) {
		const elementValue = await doubleParser(parserContext);

		return [ elementName, elementValue ];
	}

	if (elementType === 2) {
		const elementValue = await bsonStringParser(parserContext);

		return [ elementName, elementValue ];
	}

	if (elementType === 3) {
		const elementValue = await bsonDocumentParser(parserContext);

		return [ elementName, elementValue ];
	}

	if (elementType === 4) {
		const elementValue = await bsonArrayParser(parserContext);

		return [ elementName, elementValue ];
	}

	if (elementType === 8) {
		const elementValue = await bsonBooleanParser(parserContext);

		return [ elementName, elementValue ];
	}

	if (elementType === 10) {
		return [ elementName, null ];
	}

	if (elementType === 16) {
		const elementValue = await int32Parser(parserContext);

		return [ elementName, elementValue ];
	}

	invariant(false, 'Not implemented %s', elementType);
};

const bsonElementListParser: Parser<Array<[ string, JsonValue ]>, Uint8Array> = async parserContext => {
	const elements: Array<[ string, JsonValue ]> = [];

	while (true) {
		const elementTypeBuffer = Buffer.alloc(1);

		elementTypeBuffer[0] = invariantDefined(await parserContext.peek(0), 'Unexpected end of input');

		const elementType = elementTypeBuffer.readInt8(0);

		if (elementType === 0) {
			parserContext.skip(1);
			break;
		}

		const element = await bsonElementParser(parserContext);

		elements.push(element);
	}

	return elements;
};

export const bsonDocumentParser: Parser<JsonObject, Uint8Array> = promiseCompose(
	createSequenceParser([
		createSkipParser(4),
		bsonElementListParser,
	]),
	([ _, elements ]) => Object.fromEntries(elements),
);
