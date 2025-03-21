import test from 'ava';
import { uint8ArrayParserInputCompanion } from './parserInputCompanion.js';
import { runParser } from './parser.js';
import { createDexParser, dexParser } from './dexParser.js';
import { fetchCid } from './fetchCid.js';
import { createFixedLengthSequenceParser } from './fixedLengthSequenceParser.js';

const dexParserRawInstructions = createDexParser({
	createInstructionsParser: createFixedLengthSequenceParser,
});

for (const [ dexCid, shouldSnapshot ] of [
	[ 'bafkreibb4gsprc3fvmnyqx6obswvm7e7wngnfj64gz65ey72r7xgyzymt4', true ],
	[ 'bafybeiebe27ylo53trgitu6fqfbmba43c4ivxj3nt4kumsilkucpbdxtqq', false ],
	[ 'bafybeibbupm7uzhuq4pa674rb2amxsenbdaoijigmaf4onaodaql4mh7yy', false ],
	[ 'bafybeicb3qajmwy6li7hche2nkucvytaxcyxhwhphmi73tgydjzmyoqoda', false ],
] as const) {
	test.serial(
		'dex (with instructions as bytes) ' + dexCid,
		async t => {
			const dexStream = await fetchCid(dexCid);

			const actual = await runParser(dexParserRawInstructions, dexStream, uint8ArrayParserInputCompanion, {
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

for (const [ dexCid, shouldSnapshot ] of [
	[ 'bafkreibb4gsprc3fvmnyqx6obswvm7e7wngnfj64gz65ey72r7xgyzymt4', true ],
	// [ 'bafybeiebe27ylo53trgitu6fqfbmba43c4ivxj3nt4kumsilkucpbdxtqq', false ],
	// [ 'bafybeibbupm7uzhuq4pa674rb2amxsenbdaoijigmaf4onaodaql4mh7yy', false ],
	// [ 'bafybeicb3qajmwy6li7hche2nkucvytaxcyxhwhphmi73tgydjzmyoqoda', false ],
] as const) {
	test.serial(
		'dex (with parsed instructions)' + dexCid,
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
