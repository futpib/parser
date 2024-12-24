import test from 'ava';
import { uint8ArrayParserInputCompanion } from './parserInputCompanion.js';
import { runParser } from './parser.js';
import { apkParser } from './apkParser.js';
import { fetchCid } from './fetchCid.js';

for (const apkCid of [
	'bafkreicckcmzrdxwoc3w2in3tivpyxrdtcfpct4zwauq3igew3nkpvfapu',
	'bafkreidqycbgrtp7ywhevsgtm464dqpamxsijpaqfcfz2k3ymc3wrzsb5m',
]) {
	test(
		'apk ' + apkCid,
		async t => {
			const apkStream = await fetchCid(apkCid);

			const actual = await runParser(apkParser, apkStream, uint8ArrayParserInputCompanion, {
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
