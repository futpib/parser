import test from 'ava';
import { runParser } from './parser.js';
import { uint8ArrayParserInputCompanion } from './parserInputCompanion.js';
import { dalvikExecutableParser, dalvikExecutableWithRawInstructionsParser } from './dalvikExecutableParser.js';
import { fetchCid } from './fetchCid.js';

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

			const actual = await runParser(dalvikExecutableWithRawInstructionsParser, dexStream, uint8ArrayParserInputCompanion, {
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

type ObjectPath = (string | symbol | number)[];

function objectWalk(object: unknown, f: (path: ObjectPath, value: unknown) => void, initialPath: ObjectPath = []) {
	f(initialPath, object);

	if (
		!object
			|| typeof object !== 'object'
	) {
		return;
	}

	if (Array.isArray(object)) {
		for (const [ index, value ] of object.entries()) {
			objectWalk(value, f, [ ...initialPath, index ]);
		}
	} else {
		for (const [ key, value ] of Object.entries(object)) {
			objectWalk(value, f, [ ...initialPath, key ]);
		}
	}
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
			debugger;
			const dexStream = await fetchCid(dexCid);

			const actual = await runParser(dalvikExecutableParser, dexStream, uint8ArrayParserInputCompanion, {
				errorJoinMode: 'all',
			});

			objectWalk(actual, (path) => {
				const key = path.at(-1);

				if (typeof key !== 'string') {
					return;
				}

				t.false(key.endsWith('Offset'), 'All offsets should be resolved: ' + path.join('.'));
				t.false(key.endsWith('Index'), 'All indexes should be resolved: ' + path.join('.'));
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
