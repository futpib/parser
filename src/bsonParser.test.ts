import { testProp, fc } from '@fast-check/ava';
import { BSON } from 'bson';
import { bsonDocumentParser } from './bsonParser.js';
import { arbitrarilySlicedAsyncIterator } from './arbitrarilySlicedAsyncInterator.js';
import { runParser } from './parser.js';
import { uint8ArrayInputCompanion } from './inputCompanion.js';

testProp(
	'bson',
	[
		arbitrarilySlicedAsyncIterator(
			fc
				.json()
				.filter(jsonString => {
					// BSON.serialize does not support non-object top-level values
					const jsonValue = JSON.parse(jsonString);

					return (
						jsonValue !== null
							&& typeof jsonValue === 'object'
							&& !Array.isArray(jsonValue)
					);
				})
				.map(jsonString => BSON.serialize(JSON.parse(jsonString))),
		),
	],
	async (t, [ bsonUint8Array, bsonUint8ArrayChunkIterator ]) => {
		const actual = await runParser(bsonDocumentParser, bsonUint8ArrayChunkIterator, uint8ArrayInputCompanion);
		const expected = BSON.deserialize(bsonUint8Array);

		t.deepEqual(actual, expected);
	},
	{
		verbose: true,
	},
);
