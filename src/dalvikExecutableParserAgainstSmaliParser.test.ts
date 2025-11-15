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



function normalizeClassDefinition(classDefinition: any) {
	objectWalk(classDefinition, (_path, value) => {
		if (
			value
			&& typeof value === 'object'
			&& 'debugInfo' in value
		) {
			value.debugInfo = undefined;
		}
	});
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
				.replaceAll(/^\s+# getter for:.*$/gm, '')
				.replaceAll(/^\s+# setter for:.*$/gm, '')
				.replaceAll(/^\s+# invokes:.*$/gm, '')
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

		// Normalize both DEX and Smali by removing nop instructions and debug info
		normalizeClassDefinition(classDefinitionFromDex);
		normalizeClassDefinition(classDefinitionFromSmali);

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
	title(providedTitle, dexCid: string, options?: { skipUntilClassPath?: string }) {
		return providedTitle ?? `parse all classes from dex ${dexCid} against smali${options?.skipUntilClassPath ? ` (skip until ${options.skipUntilClassPath})` : ''}`;
	},
	async exec(t, dexCid: string, options?: { skipUntilClassPath?: string }) {
		const hasBaksmali = await hasBaksmaliPromise;

		if (!hasBaksmali) {
			t.pass('skipping test because baksmali is not available');
			return;
		}

		const dexStream: Uint8Array | AsyncIterable<Uint8Array> = await fetchCid(dexCid);

		const classes = (
			(await baksmaliListClasses(dexStream))
				.map(smaliFilePath => ({ smaliFilePath, sort: Math.random() }))
				.sort((a, b) => a.sort - b.sort)
				.map(({ smaliFilePath }) => smaliFilePath)
		);

		const failures: TryResult[] = [];

		let shouldProcess = options?.skipUntilClassPath === undefined;
		let processedCount = 0;

		for (const smaliFilePath of classes) {
			if (options?.skipUntilClassPath && smaliFilePath === options.skipUntilClassPath) {
				shouldProcess = true;
			}

			if (!shouldProcess) {
				continue;
			}

			processedCount++;

			const result = await t.try(parseDexAgainstSmaliMacro, dexCid, {
				smaliFilePath,
				isolate: true,
			});

			if (result.passed) {
				result.commit();

				console.log(`ok ${processedCount}/${classes.length}`, smaliFilePath);

				continue;
			}

			function consoleLogFailure(failure: TryResult) {
				const [ error ] = failure.errors;

				console.log((error as any).formattedDetails.at(0).formatted ?? error);
			}

			console.log(smaliFilePath);
			consoleLogFailure(result);

			failures.push(result);

			if (failures.length >= 2) {
				for (const failure of failures) {
					consoleLogFailure(failure);
				}

				for (const failure of failures) {
					failure.commit();
				}
			}
		}

		for (const failure of failures) {
			failure.commit();
		}

		t.pass('completed all classes');
	},
});

const testCasesByCid: Record<string, Array<string | { smaliFilePath: string; isolate?: boolean }>> = {
	bafybeicb3qajmwy6li7hche2nkucvytaxcyxhwhphmi73tgydjzmyoqoda: [
		{ smaliFilePath: 'androidx/activity/ComponentActivity$1', isolate: true },
		{ smaliFilePath: 'androidx/activity/R$id', isolate: true },
		{ smaliFilePath: 'androidx/activity/ComponentActivity$NonConfigurationInstances', isolate: true },
		{ smaliFilePath: 'androidx/appcompat/R$styleable', isolate: true },
		{ smaliFilePath: 'androidx/core/content/FileProvider', isolate: true },
		{ smaliFilePath: 'androidx/core/view/KeyEventDispatcher', isolate: true },
		{ smaliFilePath: 'com/google/android/exoplayer2/audio/Sonic', isolate: true },
		{ smaliFilePath: 'com/google/android/exoplayer2/ext/opus/OpusDecoder', isolate: true },
		{ smaliFilePath: 'com/google/android/gms/internal/common/zzg', isolate: true },
		{ smaliFilePath: 'com/google/android/gms/internal/mlkit_vision_label/zzcm', isolate: true },
		{ smaliFilePath: 'com/google/android/play/core/integrity/model/StandardIntegrityErrorCode', isolate: true },
		{ smaliFilePath: 'com/google/common/math/IntMath', isolate: true },
		{ smaliFilePath: 'com/google/gson/internal/bind/CollectionTypeAdapterFactory', isolate: true },
	],
	bafkreibb4gsprc3fvmnyqx6obswvm7e7wngnfj64gz65ey72r7xgyzymt4: [
		'pl/czak/minimal/MainActivity',
		'pl/czak/minimal/R',
	],
	bafybeibbupm7uzhuq4pa674rb2amxsenbdaoijigmaf4onaodaql4mh7yy: [
		{ smaliFilePath: 'com/journeyapps/barcodescanner/CaptureActivity', isolate: true },
		{ smaliFilePath: '_COROUTINE/ArtificialStackFrames', isolate: true },
		{ smaliFilePath: 'androidx/appcompat/widget/AppCompatTextHelper', isolate: true },
		{ smaliFilePath: '_COROUTINE/CoroutineDebuggingKt', isolate: true },
		{ smaliFilePath: 'androidx/compose/ui/text/android/style/LineHeightSpan', isolate: true },
		{ smaliFilePath: 'androidx/compose/ui/layout/LayoutIdElement', isolate: true },
		{ smaliFilePath: 'androidx/compose/ui/text/EmojiSupportMatch', isolate: true },
		{ smaliFilePath: 'androidx/compose/ui/focus/FocusTransactionsKt', isolate: true },
		{ smaliFilePath: 'androidx/compose/animation/core/SpringSimulationKt', isolate: true },
		{ smaliFilePath: 'androidx/constraintlayout/core/widgets/ConstraintWidget', isolate: true },
		{ smaliFilePath: 'ch/qos/logback/core/CoreConstants', isolate: true },
		{ smaliFilePath: 'ch/qos/logback/classic/spi/ClassPackagingData', isolate: true },
		{ smaliFilePath: 'kotlin/coroutines/jvm/internal/DebugMetadata', isolate: true },
	],
	bafybeiebe27ylo53trgitu6fqfbmba43c4ivxj3nt4kumsilkucpbdxtqq: [
		{ smaliFilePath: 'androidx/viewpager2/adapter/FragmentStateAdapter$5', isolate: true },
		{ smaliFilePath: 'androidx/lifecycle/b0', isolate: true },
		{ smaliFilePath: 'androidx/activity/b', isolate: true },
		{ smaliFilePath: 'androidx/activity/result/a$a', isolate: true },
		{ smaliFilePath: 'androidx/annotation/Keep', isolate: true },
		{ smaliFilePath: 'androidx/activity/result/e', isolate: true },
		{ smaliFilePath: 'androidx/appcompat/widget/ActionBarContextView$a', isolate: true },
		{ smaliFilePath: 'androidx/appcompat/widget/b0', isolate: true },
		{ smaliFilePath: 'androidx/appcompat/widget/b1', isolate: true },
		{ smaliFilePath: 'androidx/appcompat/widget/e', isolate: true },
		{ smaliFilePath: 'androidx/appcompat/widget/m0', isolate: true },
		{ smaliFilePath: 'androidx/appcompat/widget/r1', isolate: true },
		{ smaliFilePath: 'androidx/recyclerview/widget/RecyclerView$a0', isolate: true },
		{ smaliFilePath: 'androidx/constraintlayout/widget/ConstraintLayout$a', isolate: true },
		{ smaliFilePath: 'l4/a', isolate: true },
		{ smaliFilePath: 'n4/o', isolate: true },
		{ smaliFilePath: 'o6/f', isolate: true },
		{ smaliFilePath: 'a', isolate: true },
		{ smaliFilePath: 'a/b', isolate: true },
		{ smaliFilePath: 'f/b', isolate: true },
		{ smaliFilePath: 'h1/j', isolate: true },
		{ smaliFilePath: 'android/app/AppComponentFactory', isolate: true },
		{ smaliFilePath: 'android/app/job/JobInfo$TriggerContentUri', isolate: true },
		{ smaliFilePath: 'android/graphics/BlendModeColorFilter', isolate: true },
		{ smaliFilePath: 'android/graphics/fonts/Font$Builder', isolate: true },
		{ smaliFilePath: 'android/os/LocaleList', isolate: true },
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
		{ smaliFilePath: 'b4/v', isolate: true },
		{ smaliFilePath: 'd6/a', isolate: true },
		{ smaliFilePath: 'q2/d$a', isolate: true },
		{ smaliFilePath: 'y4/t1', isolate: true },
		{ smaliFilePath: 'com/google/android/material/textfield/b', isolate: true },
		{ smaliFilePath: 'm/g', isolate: true },
	],
};

for (const [ dexCid, smaliFilePaths ] of Object.entries(testCasesByCid)) {
	for (const smaliFilePath of smaliFilePaths) {
		test.serial(parseDexAgainstSmaliMacro, dexCid, smaliFilePath);
	}
}

for (const dexCid of Object.keys(testCasesByCid)) {
	test.serial.skip(parseAllClassesInDexAgainstSmaliMacro, dexCid);
}

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

		// Normalize both DEX and Smali by removing nop instructions and debug info
		normalizeClassDefinition(classDefinitionFromDex);
		normalizeClassDefinition(classDefinitionFromSmali);

		t.deepEqual(
			classDefinitionFromDex,
			classDefinitionFromSmali,
		);
	},
);
