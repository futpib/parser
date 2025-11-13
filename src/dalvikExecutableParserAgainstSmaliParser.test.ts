import test, { TryResult } from 'ava';
import { runParser } from './parser.js';
import { stringParserInputCompanion, uint8ArrayParserInputCompanion } from './parserInputCompanion.js';
import { dalvikExecutableParser } from './dalvikExecutableParser.js';
import { fetchCid } from './fetchCid.js';
import { hasExecutable } from './hasExecutable.js';
import { backsmaliSmaliIsolateClass, baksmaliClass, baksmaliListClasses } from './backsmali.js';
import { smaliParser } from './smaliParser.js';
import { smaliClass } from './smali.js';
import { operationFormats } from './dalvikBytecodeParser/operationFormats.js';
import { formatSizes } from './dalvikBytecodeParser/formatSizes.js';

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

function sortParameterAnnotations(classDefinition: any) {
	if (
		classDefinition
		&& typeof classDefinition === 'object'
		&& 'annotations' in classDefinition
		&& classDefinition.annotations
		&& typeof classDefinition.annotations === 'object'
		&& 'parameterAnnotations' in classDefinition.annotations
		&& Array.isArray(classDefinition.annotations.parameterAnnotations)
	) {
		classDefinition.annotations.parameterAnnotations.sort((a: any, b: any) => {
			// Sort by class name first
			if (a.method.class !== b.method.class) {
				return a.method.class.localeCompare(b.method.class);
			}
			// Then by method name
			if (a.method.name !== b.method.name) {
				return a.method.name.localeCompare(b.method.name);
			}
			// Then by shorty (prototype signature)
			return a.method.prototype.shorty.localeCompare(b.method.prototype.shorty);
		});
	}
}

function sortFieldAnnotations(classDefinition: any) {
	if (
		classDefinition
		&& typeof classDefinition === 'object'
		&& 'annotations' in classDefinition
		&& classDefinition.annotations
		&& typeof classDefinition.annotations === 'object'
		&& 'fieldAnnotations' in classDefinition.annotations
		&& Array.isArray(classDefinition.annotations.fieldAnnotations)
	) {
		classDefinition.annotations.fieldAnnotations.sort((a: any, b: any) => {
			// Sort by class name first
			if (a.field.class !== b.field.class) {
				return a.field.class.localeCompare(b.field.class);
			}
			// Then by field name
			if (a.field.name !== b.field.name) {
				return a.field.name.localeCompare(b.field.name);
			}
			// Then by field type
			return a.field.type.localeCompare(b.field.type);
		});
	}
}

// Calculate operation size in code units (bytes / 2)
function getOperationSize(operation: any): number {
	if (operation.operation === 'packed-switch-payload') {
		return (operation.branchOffsetIndices?.length || 0) * 2 + 4;
	}

	if (operation.operation === 'sparse-switch-payload') {
		return (operation.branchOffsetIndices?.length || 0) * 4 + 2;
	}

	if (operation.operation === 'fill-array-data-payload') {
		const dataSize = operation.data?.length || 0;
		const paddingSize = dataSize % 2; // 1 if odd, 0 if even
		return dataSize + paddingSize + 8; // 8 bytes for header
	}

	const operationFormat = operationFormats[operation.operation as keyof typeof operationFormats];
	if (!operationFormat) {
		return 2; // Default size
	}

	const operationSize = formatSizes[operationFormat];
	return operationSize || 2;
}

// Normalize branchOffsets to be relative instruction indices instead of byte offsets
// This makes comparison resilient to nop removal and instruction reordering
function normalizeBranchOffsetsToIndices(instructions: any[]) {
	// Build offset map
	const offsetByIndex = new Map<number, number>();
	const indexByOffset = new Map<number, number>();
	let currentOffset = 0;
	
	for (let i = 0; i < instructions.length; i++) {
		offsetByIndex.set(i, currentOffset);
		indexByOffset.set(currentOffset, i);
		currentOffset += getOperationSize(instructions[i]);
	}
	
	// Convert branchOffset to relative index and remove the offset field
	for (let i = 0; i < instructions.length; i++) {
		const instr = instructions[i];
		const sourceOffset = offsetByIndex.get(i);
		
		if (instr && typeof instr === 'object' && 'branchOffset' in instr && sourceOffset !== undefined) {
			const targetOffset = sourceOffset + instr.branchOffset;
			// Find the closest instruction index for this offset
			let targetIndex = i;
			for (let j = 0; j < instructions.length; j++) {
				const jOffset = offsetByIndex.get(j);
				if (jOffset === targetOffset) {
					targetIndex = j;
					break;
				}
			}
			// Store as relative index for comparison
			(instr as any).branchOffsetIndex = targetIndex - i;
			// Remove the byte offset for comparison
			delete (instr as any).branchOffset;
		}
		
		if (instr && typeof instr === 'object' && 'branchOffsets' in instr && Array.isArray(instr.branchOffsets) && sourceOffset !== undefined) {
			const indices = instr.branchOffsets.map((offset: number) => {
				const targetOffset = sourceOffset + offset;
				for (let j = 0; j < instructions.length; j++) {
					const jOffset = offsetByIndex.get(j);
					if (jOffset === targetOffset) {
						return j - i;
					}
				}
				return 0;
			});
			(instr as any).branchOffsetIndices = indices;
			// Remove the byte offsets for comparison
			delete (instr as any).branchOffsets;
		}
	}
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

		// Filter out nop instructions as they may differ between DEX and reassembled smali
		if (
			value
			&& typeof value === 'object'
			&& 'instructions' in value
			&& Array.isArray(value.instructions)
		) {
			const filteredInstructions = value.instructions.filter(
				(instruction: any) => !(instruction && typeof instruction === 'object' && instruction.operation === 'nop'),
			);
			value.instructions = filteredInstructions;
			
			// Normalize branchOffsets to relative indices for comparison
			normalizeBranchOffsetsToIndices(filteredInstructions);
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

		// Sort parameter annotations to ensure consistent ordering between DEX and Smali
		sortParameterAnnotations(classDefinitionFromDex);
		sortParameterAnnotations(classDefinitionFromSmali);

		// Sort field annotations to ensure consistent ordering between DEX and Smali
		sortFieldAnnotations(classDefinitionFromDex);
		sortFieldAnnotations(classDefinitionFromSmali);

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

		const classes = (await baksmaliListClasses(dexStream)).sort(() => Math.random() - 0.5);

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

			console.log(smaliFilePath);

			failures.push(result);

			if (failures.length >= 2) {
				for (const failure of failures) {
					const [ error ] = failure.errors;

					console.log((error as any).formattedDetails.at(0).formatted ?? error);
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
		{ smaliFilePath: 'com/google/android/exoplayer2/audio/Sonic', isolate: true },
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
		{ smaliFilePath: 'l4/a', isolate: true },
		{ smaliFilePath: 'n4/o', isolate: true },
		{ smaliFilePath: 'a', isolate: true },
		{ smaliFilePath: 'a/b', isolate: true },
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
		{ smaliFilePath: 'q2/d$a', isolate: true },
		{ smaliFilePath: 'y4/t1', isolate: true },
		{ smaliFilePath: 'com/google/android/material/textfield/b', isolate: true },
	],
};

for (const [ dexCid, smaliFilePaths ] of Object.entries(testCasesByCid)) {
	for (const smaliFilePath of smaliFilePaths) {
		test.serial(parseDexAgainstSmaliMacro, dexCid, smaliFilePath);
	}
}

test.serial.skip(parseDexAgainstSmaliMacro, 'bafybeicb3qajmwy6li7hche2nkucvytaxcyxhwhphmi73tgydjzmyoqoda', '');

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

		// Sort parameter annotations to ensure consistent ordering between DEX and Smali
		sortParameterAnnotations(classDefinitionFromDex);
		sortParameterAnnotations(classDefinitionFromSmali);

		// Sort field annotations to ensure consistent ordering between DEX and Smali
		sortFieldAnnotations(classDefinitionFromDex);
		sortFieldAnnotations(classDefinitionFromSmali);

		t.deepEqual(
			classDefinitionFromDex,
			classDefinitionFromSmali,
		);
	},
);
