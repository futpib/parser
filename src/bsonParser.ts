import { type JsonObject, type JsonValue } from 'type-fest';
import invariant from 'invariant';
import { type Parser } from './parser.js';
import { invariantDefined } from './invariantDefined.js';
import { createFixedLengthParser } from './fixedLengthParser.js';

const createFixedLengthBufferParser = (length: number): Parser<Buffer, Uint8Array> => {
	const fixedLengthChunkParser = createFixedLengthParser<Uint8Array>(length);

	return async parserContext => {
		const sequence = await fixedLengthChunkParser(parserContext);

		return Buffer.from(sequence);
	};
};

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

const doubleParser: Parser<number, Uint8Array> = async inputContext => {
	const doubleBuffer = await buffer8Parser(inputContext);

	return doubleBuffer.readDoubleLE(0);
};

const int32Parser: Parser<number, Uint8Array> = async inputContext => {
	const int32Buffer = await buffer4Parser(inputContext);

	return int32Buffer.readInt32LE(0);
};

const bsonStringParser: Parser<string, Uint8Array> = async inputContext => {
	const stringSizeBuffer = await buffer4Parser(inputContext);

	const stringSize = stringSizeBuffer.readUInt32LE(0);

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

const bsonArrayParser: Parser<JsonValue[], Uint8Array> = async inputContext => {
	inputContext.skip(4);

	return (await bsonElementListParser(inputContext)).map(([ _, value ]) => value);
};

const bsonBooleanParser: Parser<boolean, Uint8Array> = async inputContext => {
	const booleanValue = invariantDefined(await inputContext.peek(0), 'Unexpected end of input');

	inputContext.skip(1);

	return booleanValue === 1;
};

const bsonElementParser: Parser<[ string, JsonValue ], Uint8Array> = async inputContext => {
	const elementTypeBuffer = Buffer.alloc(1);

	elementTypeBuffer[0] = invariantDefined(await inputContext.peek(0), 'Unexpected end of input');

	const elementType = elementTypeBuffer.readInt8(0);

	inputContext.skip(1);

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

export const bsonDocumentParser: Parser<JsonObject, Uint8Array> = async inputContext => {
	inputContext.skip(4);

	return Object.fromEntries(await bsonElementListParser(inputContext));
};
