import test from 'ava';
import { uint8ArrayParserInputCompanion } from './parserInputCompanion.js';
import { runParser } from './parser.js';
import { apkParser, apkSigningBlockParser } from './apkParser.js';
import { runUnparser } from './unparser.js';
import { apkSigningBlockUnparser } from './apkUnparser.js';
import { uint8ArrayUnparserOutputCompanion } from './unparserOutputCompanion.js';
import invariant from 'invariant';

for (const apkCid of [
	'bafkreicckcmzrdxwoc3w2in3tivpyxrdtcfpct4zwauq3igew3nkpvfapu',
]) {
	test(
		'apk ' + apkCid,
		async t => {
			const apkResponse = await fetch('https://ipfs.io/ipfs/' + apkCid);

			const apkStream = apkResponse.body!;

			const apk = await runParser(apkParser, apkStream, uint8ArrayParserInputCompanion, {
				errorJoinMode: 'all',
			});

			const apkSigningBlock = apk.signingBlock;

			invariant(apkSigningBlock, 'APK has no signing block');

			const apkSigningBlockStream = runUnparser(apkSigningBlockUnparser, apkSigningBlock, uint8ArrayUnparserOutputCompanion);

			const actual = await runParser(apkSigningBlockParser, apkSigningBlockStream, uint8ArrayParserInputCompanion, {
				errorJoinMode: 'all',
			});

			t.deepEqual(actual, apkSigningBlock);
		},
	);
}
