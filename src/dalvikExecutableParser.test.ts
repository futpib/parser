import test from 'ava';
import { uint8ArrayParserInputCompanion } from './parserInputCompanion.js';
import { runParser, runParserWithRemainingInput } from './parser.js';
import { createDalvikExecutableParser, dalvikExecutableParser } from './dalvikExecutableParser.js';
import { fetchCid } from './fetchCid.js';
import { createFixedLengthSequenceParser } from './fixedLengthSequenceParser.js';

const dalvikExecutableParserRawInstructions = createDalvikExecutableParser({
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

			const { output: actual, remainingInput } = await runParserWithRemainingInput(dalvikExecutableParserRawInstructions, dexStream, uint8ArrayParserInputCompanion, {
				errorJoinMode: 'all',
			});

			// if (remainingInput) {
			// 	for await (const buffer of remainingInput) {
			// 		console.log(buffer);
			// 	}

			// 	t.fail('remainingInput');
			// }

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
		'dex (with parsed instructions) ' + dexCid,
		async t => {
			const dexStream = await fetchCid(dexCid);

			const { output: actual, remainingInput } = await runParserWithRemainingInput(dalvikExecutableParser, dexStream, uint8ArrayParserInputCompanion, {
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
