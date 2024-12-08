import test from 'ava';
import { uint8ArrayInputCompanion } from './inputCompanion.js';
import { runParser } from './parser.js';
import { apkParser } from './apkParser.js';

for (const apkCid of [
	'bafkreicckcmzrdxwoc3w2in3tivpyxrdtcfpct4zwauq3igew3nkpvfapu',
	'bafkreidqycbgrtp7ywhevsgtm464dqpamxsijpaqfcfz2k3ymc3wrzsb5m',
]) {
	test(
		'apk ' + apkCid,
		async t => {
			const apkResponse = await fetch('https://ipfs.io/ipfs/' + apkCid);

			const apkStream = apkResponse.body!;

			const actual = await runParser(apkParser, apkStream, uint8ArrayInputCompanion, {
				errorJoinMode: 'all',
			});

			for (const entry of actual.entries) {
				if (entry.type === 'file') {
					entry.content = new Uint8Array([ entry.content.length ]);
				}
			}

			t.snapshot(actual);
		},
	);
}