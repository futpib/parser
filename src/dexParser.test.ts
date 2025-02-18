import test from 'ava';
import { uint8ArrayParserInputCompanion } from './parserInputCompanion.js';
import { runParser } from './parser.js';
import { dexParser } from './dexParser.js';
import { fetchCid } from './fetchCid.js';

for (const [ dexCid, shouldSnapshot ] of [
	[ 'bafkreibb4gsprc3fvmnyqx6obswvm7e7wngnfj64gz65ey72r7xgyzymt4', true ],
	[ 'bafybeiebe27ylo53trgitu6fqfbmba43c4ivxj3nt4kumsilkucpbdxtqq', false ],
	[ 'bafybeibbupm7uzhuq4pa674rb2amxsenbdaoijigmaf4onaodaql4mh7yy', false ],
] as const) {
	test.serial(
		'dex ' + dexCid,
		async t => {
			const dexStream = await fetchCid(dexCid);

			const actual = await runParser(dexParser, dexStream, uint8ArrayParserInputCompanion, {
				errorJoinMode: 'all',
			});

			if (shouldSnapshot) {
				t.snapshot(actual);
			} else {
				//console.dir(actual, { depth: null });
				t.pass();
			}
		},
	);
}
