import test from 'ava';
import { runParser } from './parser.js';
import { uint8ArrayParserInputCompanion } from './parserInputCompanion.js';
import { dalvikExecutableParser, dalvikExecutableWithRawInstructionsParser } from './dalvikExecutableParser.js';
import { fetchCid } from './fetchCid.js';

const dexWithRawInstructionsMacro = test.macro({
	title: (providedTitle, dexCid: string) => providedTitle ?? `dex (with instructions as bytes) ${dexCid}`,
	async exec(t, dexCid: string, shouldSnapshot: boolean) {
		const dexStream = await fetchCid(dexCid);

		const actual = await runParser(dalvikExecutableWithRawInstructionsParser, dexStream, uint8ArrayParserInputCompanion, {
			errorJoinMode: 'all',
		});

		if (shouldSnapshot) {
			t.snapshot(actual);
		} else {
			// Console.dir(actual, { depth: null });
			t.pass();
		}
	},
});

test.serial(dexWithRawInstructionsMacro, 'bafkreibb4gsprc3fvmnyqx6obswvm7e7wngnfj64gz65ey72r7xgyzymt4', true);
test.serial(dexWithRawInstructionsMacro, 'bafybeiebe27ylo53trgitu6fqfbmba43c4ivxj3nt4kumsilkucpbdxtqq', false);
test.serial(dexWithRawInstructionsMacro, 'bafybeibbupm7uzhuq4pa674rb2amxsenbdaoijigmaf4onaodaql4mh7yy', false);
test.serial(dexWithRawInstructionsMacro, 'bafybeicb3qajmwy6li7hche2nkucvytaxcyxhwhphmi73tgydjzmyoqoda', false);

type ObjectPath = Array<string | symbol | number>;

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

const dexWithParsedInstructionsMacro = test.macro({
	title: (providedTitle, dexCid: string) => providedTitle ?? `dex (with parsed instructions) ${dexCid}`,
	async exec(t, dexCid: string, shouldSnapshot: boolean) {
		const dexStream = await fetchCid(dexCid);

		const actual = await runParser(dalvikExecutableParser, dexStream, uint8ArrayParserInputCompanion, {
			errorJoinMode: 'all',
		});

		objectWalk(actual, path => {
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
			// Console.dir(actual, { depth: null });
			t.pass();
		}
	},
});

test.serial(dexWithParsedInstructionsMacro, 'bafkreibb4gsprc3fvmnyqx6obswvm7e7wngnfj64gz65ey72r7xgyzymt4', true);
test.serial(dexWithParsedInstructionsMacro, 'bafybeiebe27ylo53trgitu6fqfbmba43c4ivxj3nt4kumsilkucpbdxtqq', false);
test.serial.skip(dexWithParsedInstructionsMacro, 'bafybeibbupm7uzhuq4pa674rb2amxsenbdaoijigmaf4onaodaql4mh7yy', false);
test.serial.skip(dexWithParsedInstructionsMacro, 'bafybeicb3qajmwy6li7hche2nkucvytaxcyxhwhphmi73tgydjzmyoqoda', false);
