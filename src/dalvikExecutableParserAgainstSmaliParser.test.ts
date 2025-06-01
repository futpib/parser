import test from 'ava';
import { runParser } from './parser.js';
import { stringParserInputCompanion, uint8ArrayParserInputCompanion } from './parserInputCompanion.js';
import { dalvikExecutableParser } from './dalvikExecutableParser.js';
import { fetchCid } from './fetchCid.js';
import { hasExecutable } from './hasExecutable.js';
import { backsmaliSmaliIsolateClass, baksmaliClass } from './backsmali.js';
import { smaliParser } from './smaliParser.js';
import { smaliClass } from './smali.js';

const hasBaksmaliPromise = hasExecutable('baksmali');
const hasSmaliPromise = hasExecutable('smali');

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

for (const [ dexCid, smaliFilePaths ] of [
	[
		'bafkreibb4gsprc3fvmnyqx6obswvm7e7wngnfj64gz65ey72r7xgyzymt4',
		[
			'pl/czak/minimal/MainActivity',
		],
	],

	// [
	// 	'bafybeiebe27ylo53trgitu6fqfbmba43c4ivxj3nt4kumsilkucpbdxtqq',
	// 	[
	// 		'',
	// 	],
	// ],

	[
		'bafybeibbupm7uzhuq4pa674rb2amxsenbdaoijigmaf4onaodaql4mh7yy',
		[
			{
				smaliFilePath: 'com/journeyapps/barcodescanner/CaptureActivity',
				isolate: true,
			},
		],
	],

	// [
	// 	'bafybeicb3qajmwy6li7hche2nkucvytaxcyxhwhphmi73tgydjzmyoqoda',
	// 	[
	// 		'',
	// 	],
	// ],
] as const) {
	function normalizeSmaliFilePath(
		smaliFilePath: string | {
			smaliFilePath: string;
			isolate?: boolean;
		},
	): {
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

	for (const { smaliFilePath, isolate } of smaliFilePaths.map(normalizeSmaliFilePath)) {
		test.serial(
			'parse(dex) against parse(smali(dex)) ' + dexCid + ' ' + smaliFilePath + (isolate ? ' isolated' : ''),
			async t => {
				const hasBaksmali = await hasBaksmaliPromise;

				if (!hasBaksmali) {
					t.pass('skipping test because baksmali is not available');

					return;
				}

				const dexStream: Uint8Array | AsyncIterable<Uint8Array> = await fetchCid(dexCid);

				const smali = await baksmaliClass(dexStream, smaliFilePath);

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
}

const smali = `
.class public Lcom/journeyapps/barcodescanner/CaptureActivity;
.super Landroid/app/Activity;
.source "CaptureActivity.java"


# instance fields
.field private barcodeScannerView:Lcom/journeyapps/barcodescanner/DecoratedBarcodeView;

.field private capture:Lcom/journeyapps/barcodescanner/CaptureManager;


# direct methods
.method public constructor <init>()V
    .registers 1

    .line 13
    invoke-direct {p0}, Landroid/app/Activity;-><init>()V

    return-void
.end method


# virtual methods
.method protected initializeContent()Lcom/journeyapps/barcodescanner/DecoratedBarcodeView;
    .registers 2

    sget v0, Lcom/google/zxing/client/android/R$layout;->zxing_capture:I

    .line 34
    invoke-virtual {p0, v0}, Landroid/app/Activity;->setContentView(I)V

    sget v0, Lcom/google/zxing/client/android/R$id;->zxing_barcode_scanner:I

    .line 35
    invoke-virtual {p0, v0}, Landroid/app/Activity;->findViewById(I)Landroid/view/View;

    move-result-object v0

    check-cast v0, Lcom/journeyapps/barcodescanner/DecoratedBarcodeView;

    return-object v0
.end method

.method protected onCreate(Landroid/os/Bundle;)V
    .registers 4

    .line 19
    invoke-super {p0, p1}, Landroid/app/Activity;->onCreate(Landroid/os/Bundle;)V

    .line 21
    invoke-virtual {p0}, Lcom/journeyapps/barcodescanner/CaptureActivity;->initializeContent()Lcom/journeyapps/barcodescanner/DecoratedBarcodeView;

    move-result-object v0

    iput-object v0, p0, Lcom/journeyapps/barcodescanner/CaptureActivity;->barcodeScannerView:Lcom/journeyapps/barcodescanner/DecoratedBarcodeView;

    .line 23
    new-instance v0, Lcom/journeyapps/barcodescanner/CaptureManager;

    iget-object v1, p0, Lcom/journeyapps/barcodescanner/CaptureActivity;->barcodeScannerView:Lcom/journeyapps/barcodescanner/DecoratedBarcodeView;

    invoke-direct {v0, p0, v1}, Lcom/journeyapps/barcodescanner/CaptureManager;-><init>(Landroid/app/Activity;Lcom/journeyapps/barcodescanner/DecoratedBarcodeView;)V

    iput-object v0, p0, Lcom/journeyapps/barcodescanner/CaptureActivity;->capture:Lcom/journeyapps/barcodescanner/CaptureManager;

    .line 24
    invoke-virtual {p0}, Landroid/app/Activity;->getIntent()Landroid/content/Intent;

    move-result-object v1

    invoke-virtual {v0, v1, p1}, Lcom/journeyapps/barcodescanner/CaptureManager;->initializeFromIntent(Landroid/content/Intent;Landroid/os/Bundle;)V

    iget-object p1, p0, Lcom/journeyapps/barcodescanner/CaptureActivity;->capture:Lcom/journeyapps/barcodescanner/CaptureManager;

    .line 25
    invoke-virtual {p1}, Lcom/journeyapps/barcodescanner/CaptureManager;->decode()V

    return-void
.end method

.method protected onDestroy()V
    .registers 2

    .line 52
    invoke-super {p0}, Landroid/app/Activity;->onDestroy()V

    iget-object v0, p0, Lcom/journeyapps/barcodescanner/CaptureActivity;->capture:Lcom/journeyapps/barcodescanner/CaptureManager;

    .line 53
    invoke-virtual {v0}, Lcom/journeyapps/barcodescanner/CaptureManager;->onDestroy()V

    return-void
.end method

.method public onKeyDown(ILandroid/view/KeyEvent;)Z
    .registers 4

    iget-object v0, p0, Lcom/journeyapps/barcodescanner/CaptureActivity;->barcodeScannerView:Lcom/journeyapps/barcodescanner/DecoratedBarcodeView;

    .line 69
    invoke-virtual {v0, p1, p2}, Lcom/journeyapps/barcodescanner/DecoratedBarcodeView;->onKeyDown(ILandroid/view/KeyEvent;)Z

    move-result v0

    if-nez v0, :cond_11

    invoke-super {p0, p1, p2}, Landroid/app/Activity;->onKeyDown(ILandroid/view/KeyEvent;)Z

    move-result p1

    if-eqz p1, :cond_f

    goto :goto_11

    :cond_f
    const/4 p1, 0x0

    goto :goto_12

    :cond_11
    :goto_11
    const/4 p1, 0x1

    :goto_12
    return p1
.end method

.method protected onPause()V
    .registers 2

    .line 46
    invoke-super {p0}, Landroid/app/Activity;->onPause()V

    iget-object v0, p0, Lcom/journeyapps/barcodescanner/CaptureActivity;->capture:Lcom/journeyapps/barcodescanner/CaptureManager;

    .line 47
    invoke-virtual {v0}, Lcom/journeyapps/barcodescanner/CaptureManager;->onPause()V

    return-void
.end method

.method public onRequestPermissionsResult(I[Ljava/lang/String;[I)V
    .registers 5

    iget-object v0, p0, Lcom/journeyapps/barcodescanner/CaptureActivity;->capture:Lcom/journeyapps/barcodescanner/CaptureManager;

    .line 64
    invoke-virtual {v0, p1, p2, p3}, Lcom/journeyapps/barcodescanner/CaptureManager;->onRequestPermissionsResult(I[Ljava/lang/String;[I)V

    return-void
.end method

.method protected onResume()V
    .registers 2

    .line 40
    invoke-super {p0}, Landroid/app/Activity;->onResume()V

    iget-object v0, p0, Lcom/journeyapps/barcodescanner/CaptureActivity;->capture:Lcom/journeyapps/barcodescanner/CaptureManager;

    .line 41
    invoke-virtual {v0}, Lcom/journeyapps/barcodescanner/CaptureManager;->onResume()V

    return-void
.end method

.method protected onSaveInstanceState(Landroid/os/Bundle;)V
    .registers 3

    .line 58
    invoke-super {p0, p1}, Landroid/app/Activity;->onSaveInstanceState(Landroid/os/Bundle;)V

    iget-object v0, p0, Lcom/journeyapps/barcodescanner/CaptureActivity;->capture:Lcom/journeyapps/barcodescanner/CaptureManager;

    .line 59
    invoke-virtual {v0, p1}, Lcom/journeyapps/barcodescanner/CaptureManager;->onSaveInstanceState(Landroid/os/Bundle;)V

    return-void
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
