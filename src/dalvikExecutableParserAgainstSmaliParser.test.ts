import test, { TryResult } from 'ava';
import { runParser } from './parser.js';
import { stringParserInputCompanion, uint8ArrayParserInputCompanion } from './parserInputCompanion.js';
import { dalvikExecutableParser } from './dalvikExecutableParser.js';
import { fetchCid } from './fetchCid.js';
import { hasExecutable } from './hasExecutable.js';
import { backsmaliSmaliIsolateClass, baksmaliClass, baksmaliListClasses } from './backsmali.js';
import { smaliParser } from './smaliParser.js';
import { smaliClass } from './smali.js';

const hasBaksmaliPromise = hasExecutable('baksmali');
const hasSmaliPromise = hasExecutable('smali');

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

function normalizeSmaliFilePath(smaliFilePath: string | {
	smaliFilePath: string;
	isolate?: boolean;
}): {
		smaliFilePath: string;
		isolate: boolean;
	} {
	if (typeof smaliFilePath === 'string') {
		return {
			smaliFilePath,
			isolate: false,
		};
	}

	return {
		smaliFilePath: smaliFilePath.smaliFilePath,
		isolate: smaliFilePath.isolate ?? false,
	};
}

const parseDexAgainstSmaliMacro = test.macro({
	title(providedTitle, dexCid: string, smaliFilePathInput: string | { smaliFilePath: string; isolate?: boolean }) {
		const { smaliFilePath, isolate } = normalizeSmaliFilePath(smaliFilePathInput);
		return providedTitle ?? `parse(dex) against parse(smali(dex)) ${dexCid} ${smaliFilePath}${isolate ? ' isolated' : ''}`;
	},
	async exec(t, dexCid: string, smaliFilePathInput: string | { smaliFilePath: string; isolate?: boolean }) {
		const { smaliFilePath, isolate } = normalizeSmaliFilePath(smaliFilePathInput);
		const hasBaksmali = await hasBaksmaliPromise;

		if (!hasBaksmali) {
			t.pass('skipping test because baksmali is not available');
			return;
		}

		const dexStream: Uint8Array | AsyncIterable<Uint8Array> = await fetchCid(dexCid);

		const smali_ = await baksmaliClass(dexStream, smaliFilePath);

		const smali = (
			smali_
				.replaceAll(/^\s+\.line \d+\s*$/gm, '')
				.replaceAll(/\n{3,}/g, '\n\n')
		);

		// Console.log(smali);

		const classDefinitionFromSmali = await runParser(smaliParser, smali, stringParserInputCompanion, {
			errorJoinMode: 'all',
		});

		let dexStream2: Uint8Array | AsyncIterable<Uint8Array> = await fetchCid(dexCid);

		if (isolate) {
			dexStream2 = await backsmaliSmaliIsolateClass(dexStream2, smaliFilePath);
		}

		const executableFromDex = await runParser(dalvikExecutableParser, dexStream2, uint8ArrayParserInputCompanion, {
			errorJoinMode: 'all',
		});

		const classDefinitionFromDex = executableFromDex.classDefinitions.find(classDefinition => classDefinition.class === classDefinitionFromSmali.class);

		objectWalk(classDefinitionFromDex, (_path, value) => {
			if (
				value
				&& typeof value === 'object'
				&& 'debugInfo' in value
			) {
				value.debugInfo = undefined;
			}
		});

		// Console.dir({
		// 	classDefinitionFromSmali,
		// 	classDefinitionFromDex,
		// }, {
		// 	depth: null,
		// });

		t.deepEqual(
			classDefinitionFromDex,
			classDefinitionFromSmali,
		);
	},
});

const parseAllClassesInDexAgainstSmaliMacro = test.macro({
	title(providedTitle, dexCid: string) {
		return providedTitle ?? `parse all classes from dex ${dexCid} against smali`;
	},
	async exec(t, dexCid: string) {
		const hasBaksmali = await hasBaksmaliPromise;

		if (!hasBaksmali) {
			t.pass('skipping test because baksmali is not available');
			return;
		}

		const dexStream: Uint8Array | AsyncIterable<Uint8Array> = await fetchCid(dexCid);

		const classes = await baksmaliListClasses(dexStream);

		const failures: TryResult[] = [];

		for (const smaliFilePath of classes) {
			const result = await t.try(parseDexAgainstSmaliMacro, dexCid, {
				smaliFilePath,
				isolate: true,
			});

			if (result.passed) {
				result.commit();
				continue;
			}

			console.log(smaliFilePath);

			failures.push(result);

			if (failures.length >= 4) {
				for (const failure of failures) {
					console.log(failure.errors.at(0));
				}

				for (const failure of failures) {
					failure.commit();
				}
			}
		}
	},
});

const testCasesByCid: Record<string, Array<string | { smaliFilePath: string; isolate?: boolean }>> = {
	'bafkreibb4gsprc3fvmnyqx6obswvm7e7wngnfj64gz65ey72r7xgyzymt4': [
		'pl/czak/minimal/MainActivity',
	],
	'bafybeibbupm7uzhuq4pa674rb2amxsenbdaoijigmaf4onaodaql4mh7yy': [
		{ smaliFilePath: 'com/journeyapps/barcodescanner/CaptureActivity', isolate: true },
	],
	'bafybeiebe27ylo53trgitu6fqfbmba43c4ivxj3nt4kumsilkucpbdxtqq': [
		{ smaliFilePath: 'androidx/viewpager2/adapter/FragmentStateAdapter$5', isolate: true },
		{ smaliFilePath: 'androidx/lifecycle/b0', isolate: true },
		{ smaliFilePath: 'androidx/activity/b', isolate: true },
		{ smaliFilePath: 'l4/a', isolate: true },
		{ smaliFilePath: 'a', isolate: true },
		{ smaliFilePath: 'a/b', isolate: true },
		{ smaliFilePath: 'android/app/AppComponentFactory', isolate: true },
		{ smaliFilePath: 'android/app/job/JobInfo$TriggerContentUri', isolate: true },
		{ smaliFilePath: 'android/graphics/BlendModeColorFilter', isolate: true },
		{ smaliFilePath: 'android/graphics/fonts/Font$Builder', isolate: true },
		{ smaliFilePath: 'a0/i', isolate: true },
		{ smaliFilePath: 'a0/l', isolate: true },
		{ smaliFilePath: 'a0/n', isolate: true },
		{ smaliFilePath: 'a0/p', isolate: true },
		{ smaliFilePath: 'a0/v', isolate: true },
		{ smaliFilePath: 'a0/v$a', isolate: true },
		{ smaliFilePath: 'a3/a', isolate: true },
		{ smaliFilePath: 'a3/b', isolate: true },
		{ smaliFilePath: 'a3/d', isolate: true },
		{ smaliFilePath: 'a4/b', isolate: true },
	],
};

for (const [dexCid, smaliFilePaths] of Object.entries(testCasesByCid)) {
	for (const smaliFilePath of smaliFilePaths) {
		test.serial(parseDexAgainstSmaliMacro, dexCid, smaliFilePath);
	}
}

test.serial.skip(parseDexAgainstSmaliMacro, 'bafybeicb3qajmwy6li7hche2nkucvytaxcyxhwhphmi73tgydjzmyoqoda', '');

test.serial.skip(parseAllClassesInDexAgainstSmaliMacro, 'bafybeiebe27ylo53trgitu6fqfbmba43c4ivxj3nt4kumsilkucpbdxtqq');

const smali = `
.class public final La0/l;
.super Ljava/lang/Object;
.source "SourceFile"

# direct methods
.method public static final a(Lh1/p;ZJ)F
    .registers 6

    return v0
.end method
`;

test.serial(
	'parse(dex(smali)) againts parse(smali)',
	async t => {
		const hasSmali = await hasSmaliPromise;

		if (!hasSmali) {
			t.pass('skipping test because smali is not available');

			return;
		}

		const dexBuffer = await smaliClass(smali);

		const classDefinitionFromSmali = await runParser(smaliParser, smali, stringParserInputCompanion, {
			errorJoinMode: 'all',
		});

		const executableFromDex = await runParser(dalvikExecutableParser, dexBuffer, uint8ArrayParserInputCompanion, {
			errorJoinMode: 'all',
		});

		const classDefinitionFromDex = executableFromDex.classDefinitions.find(classDefinition => classDefinition.class === classDefinitionFromSmali.class);

		// Console.dir({
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
