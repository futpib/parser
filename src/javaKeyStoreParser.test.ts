import test from 'ava';
import { uint8ArrayParserInputCompanion } from './parserInputCompanion.js';
import { runParser } from './parser.js';
import { javaKeyStoreParser } from './javaKeyStoreParser.js';
import { fetchCid } from './fetchCid.js';

for (const javaKeyStoreCid of [
	'bafkreig6k53b6p7bdvfjxc5mcb4qv3mffqls5ymqerxkqd6ih2xy5cs3n4',
]) {
	test(
		'javaKeyStore ' + javaKeyStoreCid,
		async t => {
			const javaKeyStoreStream = await fetchCid(javaKeyStoreCid);

			const actual = await runParser(javaKeyStoreParser, javaKeyStoreStream, uint8ArrayParserInputCompanion, {
				errorJoinMode: 'all',
			});

			t.snapshot(actual);
		},
	);
}
