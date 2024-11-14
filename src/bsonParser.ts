import { JsonObject, JsonValue } from 'type-fest';
import { Parser } from './parser.js';
import { invariantDefined } from './invariantDefined.js';
import invariant from 'invariant';

const cstringParser: Parser<string, Uint8Array> = async (inputReader) => {
	let string = '';

	while (true) {
		const character = await inputReader.peek(0);

		invariant(character !== undefined, 'Unexpected end of input');

		if (character === 0) {
			inputReader.skip(1);
			break;
		}

		string += String.fromCharCode(character);
		inputReader.skip(1);
	}

	return string;
}

const doubleParser: Parser<number, Uint8Array> = async (inputReader) => {
	const doubleBuffer = Buffer.alloc(8);

	doubleBuffer[0] = invariantDefined(await inputReader.peek(0), 'Unexpected end of input');
	doubleBuffer[1] = invariantDefined(await inputReader.peek(1), 'Unexpected end of input');
	doubleBuffer[2] = invariantDefined(await inputReader.peek(2), 'Unexpected end of input');
	doubleBuffer[3] = invariantDefined(await inputReader.peek(3), 'Unexpected end of input');
	doubleBuffer[4] = invariantDefined(await inputReader.peek(4), 'Unexpected end of input');
	doubleBuffer[5] = invariantDefined(await inputReader.peek(5), 'Unexpected end of input');
	doubleBuffer[6] = invariantDefined(await inputReader.peek(6), 'Unexpected end of input');
	doubleBuffer[7] = invariantDefined(await inputReader.peek(7), 'Unexpected end of input');

	inputReader.skip(8);

	return doubleBuffer.readDoubleLE(0);
}

const int32Parser: Parser<number, Uint8Array> = async (inputReader) => {
	const int32Buffer = Buffer.alloc(4);

	int32Buffer[0] = invariantDefined(await inputReader.peek(0), 'Unexpected end of input');
	int32Buffer[1] = invariantDefined(await inputReader.peek(1), 'Unexpected end of input');
	int32Buffer[2] = invariantDefined(await inputReader.peek(2), 'Unexpected end of input');
	int32Buffer[3] = invariantDefined(await inputReader.peek(3), 'Unexpected end of input');

	inputReader.skip(4);

	return int32Buffer.readInt32LE(0);
}

const bsonStringParser: Parser<string, Uint8Array> = async (inputReader) => {
	const stringSizeBuffer = Buffer.alloc(4);

	stringSizeBuffer[0] = invariantDefined(await inputReader.peek(0), 'Unexpected end of input');
	stringSizeBuffer[1] = invariantDefined(await inputReader.peek(1), 'Unexpected end of input');
	stringSizeBuffer[2] = invariantDefined(await inputReader.peek(2), 'Unexpected end of input');
	stringSizeBuffer[3] = invariantDefined(await inputReader.peek(3), 'Unexpected end of input');

	const stringSize = stringSizeBuffer.readUInt32LE(0);

	inputReader.skip(4);

	let string = '';

	for (let i = 0; i < stringSize - 1; i++) {
		const character = await inputReader.peek(0);

		invariant(character !== undefined, 'Unexpected end of input');

		inputReader.skip(1);

		string += String.fromCharCode(character);
	}

	const nullCharacter = await inputReader.peek(0);

	invariant(nullCharacter === 0, 'Expected null character');

	inputReader.skip(1);

	return string;
}

const bsonArrayParser: Parser<JsonValue[], Uint8Array> = async (inputReader) => {
	inputReader.skip(4);

	return (await bsonElementListParser(inputReader)).map(([ _, value ]) => value);
};

const bsonBooleanParser: Parser<boolean, Uint8Array> = async (inputReader) => {
	const booleanValue = invariantDefined(await inputReader.peek(0), 'Unexpected end of input');

	inputReader.skip(1);

	return booleanValue === 1;
}

const bsonElementParser: Parser<[ string, JsonValue ], Uint8Array> = async (inputReader) => {
	const elementTypeBuffer = Buffer.alloc(1);

	elementTypeBuffer[0] = invariantDefined(await inputReader.peek(0), 'Unexpected end of input');

	const elementType = elementTypeBuffer.readInt8(0);

	inputReader.skip(1);

	const elementName = await cstringParser(inputReader);

	if (elementType === 1) {
		const elementValue = await doubleParser(inputReader);

		return [ elementName, elementValue ];
	}

	if (elementType === 2) {
		const elementValue = await bsonStringParser(inputReader);

		return [ elementName, elementValue ];
	}

	if (elementType === 3) {
		const elementValue = await bsonDocumentParser(inputReader);

		return [ elementName, elementValue ];
	}

	if (elementType === 4) {
		const elementValue = await bsonArrayParser(inputReader);

		return [ elementName, elementValue ];
	}

	if (elementType === 8) {
		const elementValue = await bsonBooleanParser(inputReader);

		return [ elementName, elementValue ];
	}

	if (elementType === 10) {
		return [ elementName, null ];
	}

	if (elementType === 16) {
		const elementValue = await int32Parser(inputReader);

		return [ elementName, elementValue ];
	}

	invariant(false, 'Not implemented %s', elementType);
}

const bsonElementListParser: Parser<[ string, JsonValue ][], Uint8Array> = async (inputReader) => {
	const elements: [ string, JsonValue ][] = [];

	while (true) {
		const elementTypeBuffer = Buffer.alloc(1);

		elementTypeBuffer[0] = invariantDefined(await inputReader.peek(0), 'Unexpected end of input');

		const elementType = elementTypeBuffer.readInt8(0);

		if (elementType === 0) {
			inputReader.skip(1);
			break;
		}

		const element = await bsonElementParser(inputReader);

		elements.push(element);
	}

	return elements;
};

export const bsonDocumentParser: Parser<JsonObject, Uint8Array> = async (inputReader) => {
	inputReader.skip(4);

	return Object.fromEntries(await bsonElementListParser(inputReader));
}
