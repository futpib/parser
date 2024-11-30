import { testProp, fc } from '@fast-check/ava';
import { jsonValueParser } from './jsonParser.js';
import { runParser } from './parser.js';
import { arbitrarilySlicedAsyncIterator } from './arbitrarilySlicedAsyncInterator.js';
import { stringInputCompanion } from './inputCompanion.js';

testProp(
	'json',
	[
		arbitrarilySlicedAsyncIterator(
			fc.tuple(fc.json(), fc.nat())
				.map(([ jsonString, indent ]) => JSON.stringify(JSON.parse(jsonString), null, indent)),
		),
	],
	async (t, [ jsonString, jsonStringChunkIterator ]) => {
		const actual = await runParser(jsonValueParser, jsonStringChunkIterator, stringInputCompanion);
		const expected = JSON.parse(jsonString);

		t.deepEqual(actual, expected);
	},
	{
		verbose: true,
	},
);
