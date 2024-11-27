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

const cstringParser: Parser<string, Uint8Array> = async inputContext => {
	let string = '';

	while (true) {
		const character = await inputContext.peek(0);

		invariant(character !== undefined, 'Unexpected end of input');

		if (character === 0) {
			inputContext.skip(1);
			break;
		}

		string += String.fromCharCode(character);
		inputContext.skip(1);
	}

	return string;
};

const doubleParser: Parser<number, Uint8Array> = promiseCompose(buffer8Parser, buffer => buffer.readDoubleLE(0));
const int32Parser: Parser<number, Uint8Array> = promiseCompose(buffer4Parser, buffer => buffer.readInt32LE(0));
const uint32Parser: Parser<number, Uint8Array> = promiseCompose(buffer4Parser, buffer => buffer.readUInt32LE(0));

const bsonStringParser: Parser<string, Uint8Array> = async inputContext => {
	const stringSize = await uint32Parser(inputContext);

	let string = '';

	for (let i = 0; i < stringSize - 1; i++) {
		const character = await inputContext.peek(0);

		invariant(character !== undefined, 'Unexpected end of input');

		inputContext.skip(1);

		string += String.fromCharCode(character);
	}

	const nullCharacter = await inputContext.peek(0);

	invariant(nullCharacter === 0, 'Expected null character');

	inputContext.skip(1);

	return string;
};

const createRecursiveParser = <Output, Sequence>(getParser: () => Parser<Output, Sequence>): Parser<Output, Sequence> => (inputContext) => {
	return getParser()(inputContext);
}

const bsonArrayParser = promiseCompose(
	createSequenceParser([
		createSkipParser(4),
		createRecursiveParser(() => bsonElementListParser),
	]),
	([ _, elements ]) => elements.map(([ _, value ]) => value),
);

const bsonBooleanParser: Parser<boolean, Uint8Array> = async inputContext => {
	const booleanValue = invariantDefined(await inputContext.read(0), 'Unexpected end of input');

	return booleanValue === 1;
};

const int8Parser: Parser<number, Uint8Array> = promiseCompose(buffer1Parser, buffer => buffer.readInt8(0));

const bsonElementParser: Parser<[ string, JsonValue ], Uint8Array> = async inputContext => {
	const elementType = await int8Parser(inputContext);
	const elementName = await cstringParser(inputContext);

	if (elementType === 1) {
		const elementValue = await doubleParser(inputContext);

		return [ elementName, elementValue ];
	}

	if (elementType === 2) {
		const elementValue = await bsonStringParser(inputContext);

		return [ elementName, elementValue ];
	}

	if (elementType === 3) {
		const elementValue = await bsonDocumentParser(inputContext);

		return [ elementName, elementValue ];
	}

	if (elementType === 4) {
		const elementValue = await bsonArrayParser(inputContext);

		return [ elementName, elementValue ];
	}

	if (elementType === 8) {
		const elementValue = await bsonBooleanParser(inputContext);

		return [ elementName, elementValue ];
	}

	if (elementType === 10) {
		return [ elementName, null ];
	}

	if (elementType === 16) {
		const elementValue = await int32Parser(inputContext);

		return [ elementName, elementValue ];
	}

	invariant(false, 'Not implemented %s', elementType);
};

const bsonElementListParser: Parser<Array<[ string, JsonValue ]>, Uint8Array> = async inputContext => {
	const elements: Array<[ string, JsonValue ]> = [];

	while (true) {
		const elementTypeBuffer = Buffer.alloc(1);

		elementTypeBuffer[0] = invariantDefined(await inputContext.peek(0), 'Unexpected end of input');

		const elementType = elementTypeBuffer.readInt8(0);

		if (elementType === 0) {
			inputContext.skip(1);
			break;
		}

		const element = await bsonElementParser(inputContext);

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
