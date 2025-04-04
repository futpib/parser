import test from 'ava';
import { runParser } from './parser.js';
import { stringParserInputCompanion, uint8ArrayParserInputCompanion } from './parserInputCompanion.js';
import { dalvikExecutableParser, dalvikExecutableWithRawInstructionsParser } from './dalvikExecutableParser.js';
import { fetchCid } from './fetchCid.js';
import { hasExecutable } from './hasExecutable.js';
import { baksmaliClass } from './backsmali.js';
import { smaliParser } from './smaliParser.js';

const hasBaksmaliPromise = hasExecutable('baksmali');

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

for (const [ dexCid, smaliFilePath ] of [
	[ 'bafkreibb4gsprc3fvmnyqx6obswvm7e7wngnfj64gz65ey72r7xgyzymt4', 'pl/czak/minimal/MainActivity' ],
	// [ 'bafybeiebe27ylo53trgitu6fqfbmba43c4ivxj3nt4kumsilkucpbdxtqq' ],
	// [ 'bafybeibbupm7uzhuq4pa674rb2amxsenbdaoijigmaf4onaodaql4mh7yy' ],
	// [ 'bafybeicb3qajmwy6li7hche2nkucvytaxcyxhwhphmi73tgydjzmyoqoda' ],
] as const) {
	test.serial(
		'dex parser against smali parser ' + dexCid + ' ' + smaliFilePath,
		async t => {
			const hasBaksmali = await hasBaksmaliPromise;

			if (!hasBaksmali) {
				return;
			}

			const dexStream = await fetchCid(dexCid);

			const smali = await baksmaliClass(dexStream, smaliFilePath);

			const classDefinitionFromSmali = await runParser(smaliParser, smali, stringParserInputCompanion, {
				errorJoinMode: 'all',
			});

			const dexStream2 = await fetchCid(dexCid);

			const executableFromDex = await runParser(dalvikExecutableParser, dexStream2, uint8ArrayParserInputCompanion, {
				errorJoinMode: 'all',
			});

			const classDefinitionFromDex = executableFromDex.classDefinitions.find(classDefinition => classDefinition.class === classDefinitionFromSmali.class);

			// console.log(smali);

			// console.dir({
			// 	classDefinitionFromDex,
			// 	classDefinitionFromSmali,
			// }, {
			// 	depth: null,
			// });

			objectWalk(classDefinitionFromDex, (_path, value) => {
				if (
					value
						&& typeof value === 'object'
						&& 'debugInfo' in value
				) {
					value.debugInfo = undefined;
				}
			});

			t.deepEqual(
				classDefinitionFromDex,
				classDefinitionFromSmali,
			);
		},
	);
}
