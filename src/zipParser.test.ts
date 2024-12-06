import { testProp } from '@fast-check/ava';
import { arbitraryZipStream } from './arbitraryZipStream.js';
import { zipParser } from './zipParser.js';
import { uint8ArrayInputCompanion } from './inputCompanion.js';
import { runParser } from './parser.js';

async function * readableStreamToUint8ArrayAsyncIterator(stream: ReadableStream<Uint8Array>) {
	for await (const chunk of stream) {
		yield chunk;
	}
}

testProp(
	'zip',
	[
		arbitraryZipStream,
	],
	async (t, [ zip, zipStream ]) => {
		const actual = await runParser(zipParser, readableStreamToUint8ArrayAsyncIterator(zipStream), uint8ArrayInputCompanion, {
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
