import test from 'ava';
import { uint8ArrayInputCompanion } from './inputCompanion.js';
import { runParser } from './parser.js';
import { javaKeyStoreParser } from './javaKeyStoreParser.js';

for (const javaKeyStoreCid of [
	'bafkreig6k53b6p7bdvfjxc5mcb4qv3mffqls5ymqerxkqd6ih2xy5cs3n4',
]) {
	test(
		'javaKeyStore ' + javaKeyStoreCid,
		async t => {
			const javaKeyStoreResponse = await fetch('https://ipfs.io/ipfs/' + javaKeyStoreCid);

			const javaKeyStoreStream = javaKeyStoreResponse.body!;

			const actual = await runParser(javaKeyStoreParser, javaKeyStoreStream, uint8ArrayInputCompanion, {
				errorJoinMode: 'all',
			});

			t.snapshot(actual);
		},
	);
}
