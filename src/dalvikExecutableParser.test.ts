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

		debugger;

		const actual = await runParser(dalvikExecutableParser, dexStream, uint8ArrayParserInputCompanion, {
			errorJoinMode: 'all',
		});

		debugger;

		objectWalk(actual, path => {
			const key = path.at(-1);

			if (typeof key !== 'string') {
				return;
			}

			t.false(key.endsWith('Offset'), 'All offsets should be resolved: ' + path.join('.'));
			// InstructionIndex fields are expected in Tier 3
			const allowedIndexFields = ['targetInstructionIndex', 'targetInstructionIndices', 'startInstructionIndex', 'handlerInstructionIndex', 'catchAllInstructionIndex'];
			t.false(key.endsWith('Index') && !allowedIndexFields.includes(key) && key !== 'targetInstructionIndices', 'All indexes should be resolved: ' + path.join('.'));
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
test.serial.skip(dexWithParsedInstructionsMacro, 'bafybeiebe27ylo53trgitu6fqfbmba43c4ivxj3nt4kumsilkucpbdxtqq', false);
test.serial.skip(dexWithParsedInstructionsMacro, 'bafybeibbupm7uzhuq4pa674rb2amxsenbdaoijigmaf4onaodaql4mh7yy', false);
test.serial.skip(dexWithParsedInstructionsMacro, 'bafybeicb3qajmwy6li7hche2nkucvytaxcyxhwhphmi73tgydjzmyoqoda', false);

const methodMacro = test.macro({
	title: (providedTitle, dexCid: string, className: string, methodName: string) =>
		providedTitle ?? `method ${className}.${methodName} from ${dexCid}`,
	async exec(t, dexCid: string, className: string, methodName: string) {
		const dexStream = await fetchCid(dexCid);

		const dex = await runParser(dalvikExecutableParser, dexStream, uint8ArrayParserInputCompanion, {
			errorJoinMode: 'all',
		});

		const classDef = dex.classDefinitions.find(c => c.class === className);
		t.truthy(classDef, `Class ${className} not found`);

		const allMethods = [
			...(classDef!.classData?.directMethods ?? []),
			...(classDef!.classData?.virtualMethods ?? []),
		];

		const method = allMethods.find(m => m.method.name === methodName);
		t.truthy(method, `Method ${methodName} not found in ${className}`);

		t.snapshot(method);
	},
});

test.serial(
	methodMacro,
	'bafkreifycfnx4xf3nlml4qavlyxr6bes66nxsow3iaqjghewfsozoj2h3q',
	'Lpl/czak/minimal/MainActivity;',
	'getPackedSwitchResult',
);
