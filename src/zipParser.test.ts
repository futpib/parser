import { testProp } from '@fast-check/ava';
import { arbitraryZipStream } from './arbitraryZipStream.js';
import { zipParser } from './zipParser.js';
import { uint8ArrayParserInputCompanion } from './parserInputCompanion.js';
import { runParser } from './parser.js';

testProp(
	'zip',
	[
		arbitraryZipStream,
	],
	async (t, [ zip, zipStream ]) => {
		const actual = await runParser(zipParser, zipStream, uint8ArrayParserInputCompanion, {
			errorJoinMode: 'all',
		});

		actual.entries.sort((a, b) => a.path.localeCompare(b.path));
		zip.entries.sort((a, b) => a.path.localeCompare(b.path));

		t.deepEqual(actual, zip);
	},
	{
		verbose: true,
	},
);
