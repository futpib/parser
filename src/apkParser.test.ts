import test from 'ava';
import { uint8ArrayInputCompanion } from './inputCompanion.js';
import { runParser } from './parser.js';
import { apkParser } from './apkParser.js';

test(
	'apk',
	async t => {
		const apkResponse = await fetch('https://ipfs.io/ipfs/bafkreicckcmzrdxwoc3w2in3tivpyxrdtcfpct4zwauq3igew3nkpvfapu');

		const apkStream = apkResponse.body!;

		const actual = await runParser(apkParser, apkStream, uint8ArrayInputCompanion, {
			errorJoinMode: 'all',
		});

		for (const entry of actual.entries) {
			if (entry.type === 'file') {
				entry.content = new Uint8Array([ entry.content.length ]);
			}
		}

		for (const pair of actual.signingBlock?.pairs ?? []) {
			pair.value = new Uint8Array([ pair.value.length ]);
		}

		t.snapshot(actual);
	},
);
