import test from 'ava';
import { uint8ArrayParserInputCompanion } from './parserInputCompanion.js';
import { runParser } from './parser.js';
import { androidPackageParser, androidPackageSigningBlockParser } from './androidPackageParser.js';
import { runUnparser } from './unparser.js';
import { androidPackageSigningBlockUnparser } from './androidPackageUnparser.js';
import { uint8ArrayUnparserOutputCompanion } from './unparserOutputCompanion.js';
import invariant from 'invariant';
import { fetchCid } from './fetchCid.js';

for (const androidPackageCid of [
	'bafkreicckcmzrdxwoc3w2in3tivpyxrdtcfpct4zwauq3igew3nkpvfapu',
]) {
	test(
		'androidPackage ' + androidPackageCid,
		async t => {
			const androidPackageStream = await fetchCid(androidPackageCid);

			const androidPackage = await runParser(androidPackageParser, androidPackageStream, uint8ArrayParserInputCompanion, {
				errorJoinMode: 'all',
			});

			const androidPackageSigningBlock = androidPackage.signingBlock;

			invariant(androidPackageSigningBlock, 'APK has no signing block');

			const androidPackageSigningBlockStream = runUnparser(androidPackageSigningBlockUnparser, androidPackageSigningBlock, uint8ArrayUnparserOutputCompanion);

			const actual = await runParser(androidPackageSigningBlockParser, androidPackageSigningBlockStream, uint8ArrayParserInputCompanion, {
				errorJoinMode: 'all',
			});

			t.deepEqual(actual, androidPackageSigningBlock);
		},
	);
}
