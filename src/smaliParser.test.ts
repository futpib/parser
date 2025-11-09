import test from 'ava';
import { stringParserInputCompanion } from './parserInputCompanion.js';
import { getParserName, Parser, runParser } from './parser.js';
import { fetchCid } from './fetchCid.js';
import { smaliAnnotationParser, smaliCodeOperationParser, smaliCodeParameterParser, smaliCommentParser, smaliFieldParser, smaliMethodParser, smaliParser } from './smaliParser.js';
import { hasExecutable } from './hasExecutable.js';
import { baksmaliClass } from './backsmali.js';

const hasBaksmaliPromise = hasExecutable('baksmali');

const stringParserTestSnapshot = Symbol('stringParserTestSnapshot');
const stringParserTestIgnore = Symbol('stringParserTestIgnore');

function stringParserTest<Output>(
	parser: Parser<Output, string>,
	examples: [
		string,
		Output
			| typeof stringParserTestSnapshot
			| typeof stringParserTestIgnore
	][],
) {
	const parserName = getParserName(parser);

	for (const [ input, expected ] of examples) {
		test(parserName + ' ' + JSON.stringify(input), async t => {
			const actual = await runParser(parser, input, stringParserInputCompanion, {
				errorJoinMode: 'all',
			});

			if (expected === stringParserTestIgnore) {
				t.pass('skipping test because expected is stringParserTestIgnore');

				return;
			} else if (expected === stringParserTestSnapshot) {
				t.snapshot(actual);
			} else {
				t.deepEqual(actual, expected as any);
			}
		});
	}
}

stringParserTest(smaliCommentParser, [
	[
		'# this is a comment \n',
		' this is a comment ',
	],
]);

stringParserTest(smaliCodeParameterParser, [
	[
		'    .param p1\n',
		{
			register: {
				index: 1,
				prefix: 'p',
			},
			annotation: undefined,
		},
	],
	[
		'    .param p1, "savedInstanceState"    # Landroid/os/Bundle;\n',
		{
			register: {
				index: 1,
				prefix: 'p',
			},
			annotation: undefined,
		},
	],
	[
		`    .param p1    # Ljava/lang/ClassLoader;
        .annotation build Landroid/annotation/NonNull;
        .end annotation
    .end param\n`,
		{
			register: {
				index: 1,
				prefix: 'p',
			},
			annotation: {
				visibility: 'build',
				type: 'Landroid/annotation/NonNull;',
				elements: [],
			},
		},
	],
]);

stringParserTest(smaliFieldParser, [
	[
		'.field private barcodeScannerView:Lcom/journeyapps/barcodescanner/DecoratedBarcodeView;\n',
		{
			field: {
				accessFlags: {
					abstract: false,
					annotation: false,
					bridge: false,
					constructor: false,
					declaredSynchronized: false,
					enum: false,
					final: false,
					interface: false,
					native: false,
					private: true,
					protected: false,
					public: false,
					static: false,
					strict: false,
					synchronized: false,
					synthetic: false,
					transient: false,
					varargs: false,
					volatile: false,
				},
				field: {
					class: 'FILLED_LATER',
					name: 'barcodeScannerView',
					type: 'Lcom/journeyapps/barcodescanner/DecoratedBarcodeView;',
				},
			},
			annotation: undefined,
		},
	],
	[
		`.field public final g:Lo/b;
    .annotation system Ldalvik/annotation/Signature;
        value = {
            "Lo/b<",
            "Ljava/lang/Float;",
            "Lo/i;",
            ">;"
        }
    .end annotation
.end field
`,
		{
			field: {
				accessFlags: {
					abstract: false,
					annotation: false,
					bridge: false,
					constructor: false,
					declaredSynchronized: false,
					enum: false,
					final: true,
					interface: false,
					native: false,
					private: false,
					protected: false,
					public: true,
					static: false,
					strict: false,
					synchronized: false,
					synthetic: false,
					transient: false,
					varargs: false,
					volatile: false,
				},
				field: {
					class: 'FILLED_LATER',
					name: 'g',
					type: 'Lo/b;',
				},
			},
			annotation: {
				visibility: 'system',
				type: 'Ldalvik/annotation/Signature;',
				elements: [
					{
						name: 'value',
						value: [
							'Lo/b<',
							'Ljava/lang/Float;',
							'Lo/i;',
							'>;',
						],
					},
				],
			},
		},
	],
]);

stringParserTest(smaliAnnotationParser, [
	[
		`    .annotation system Ldalvik/annotation/Signature;
                value = {
                    "<T:",
                    "Landroid/view/View;",
                    ">(I)TT;"
                }
            .end annotation
`,
		{
			visibility: 'system',
			type: 'Ldalvik/annotation/Signature;',
			elements: [
				{
					name: 'value',
					value: [
						'<T:',
						'Landroid/view/View;',
						'>(I)TT;',
					],
				},
			],
		},
	],
	[
		`        .annotation build Landroid/annotation/NonNull;
        .end annotation
`,
		{
			visibility: 'build',
			type: 'Landroid/annotation/NonNull;',
			elements: [],
		},
	],
	[
		`    .annotation system Ldalvik/annotation/Signature;
        value = {
            "Lo/b<",
            "Ljava/lang/Float;",
            "Lo/i;",
            ">;"
        }
    .end annotation
`,
		{
			visibility: 'system',
			type: 'Ldalvik/annotation/Signature;',
			elements: [
				{
					name: 'value',
					value: [
						'Lo/b<',
						'Ljava/lang/Float;',
						'Lo/i;',
						'>;',
					],
				},
			],
		},
	],
]);

stringParserTest(smaliMethodParser, [
	[
		`.method public native synthetic instantiateActivity(Ljava/lang/ClassLoader;Ljava/lang/String;Landroid/content/Intent;)Landroid/app/Activity;
    .param p1    # Ljava/lang/ClassLoader;
        .annotation build Landroid/annotation/NonNull;
        .end annotation
    .end param
.end method
`,
		stringParserTestSnapshot,
	],
	[
		`.method public native synthetic instantiateActivity(Ljava/lang/ClassLoader;Ljava/lang/String;Landroid/content/Intent;)Landroid/app/Activity;
    .param p1    # Ljava/lang/ClassLoader;
        .annotation build Landroid/annotation/NonNull;
        .end annotation
    .end param
    .param p2    # Ljava/lang/String;
        .annotation build Landroid/annotation/NonNull;
        .end annotation
    .end param
    .annotation build Landroid/annotation/NonNull;
    .end annotation

    .annotation system Ldalvik/annotation/Throws;
        value = {
            Ljava/lang/ClassNotFoundException;,
            Ljava/lang/IllegalAccessException;,
            Ljava/lang/InstantiationException;
        }
    .end annotation
.end method
`,
		stringParserTestSnapshot,
	],
]);

stringParserTest(smaliCodeOperationParser, [
	[
		`    invoke-static {}, Le4/k;->c()Le4/k;
`,
		{
			operation: 'invoke-static',
			registers: [],
			method: {
				class: 'Le4/k;',
				name: 'c',
				prototype: {
					parameters: [],
					returnType: 'Le4/k;',
					shorty: 'L',
				},
			},
		},
	],
	[
		`    .packed-switch 0x0
        :pswitch_5
    .end packed-switch
`,
		stringParserTestSnapshot,
	],
]);

stringParserTest(smaliCodeOperationParser, [
	[
		`    .sparse-switch
        -0x7073f927 -> :sswitch_47
        -0x3465cce -> :sswitch_3e
        0x388694fe -> :sswitch_33
        0x3cbf870b -> :sswitch_28
    .end sparse-switch
`,
		stringParserTestSnapshot,
	],
]);

stringParserTest(smaliCodeOperationParser, [
	[
		`    .array-data 4
        0x10100a7
        0x101009e
    .end array-data
`,
		stringParserTestSnapshot,
	],
]);

stringParserTest(smaliMethodParser, [
	[
		`.method public final a()Landroid/os/Bundle;
    .registers 2

    iget v0, p0, Landroidx/lifecycle/b0;->a:I

    packed-switch v0, :pswitch_data_c

    :pswitch_5
    iget-object v0, p0, Landroidx/lifecycle/b0;->b:Landroidx/lifecycle/c0;

    invoke-static {v0}, Landroidx/lifecycle/c0;->a(Landroidx/lifecycle/c0;)Landroid/os/Bundle;

    move-result-object v0

    return-object v0

    :pswitch_data_c
    .packed-switch 0x0
        :pswitch_5
    .end packed-switch
.end method
`,
		stringParserTestSnapshot,
	],
]);

const smaliFromDexMacro = test.macro({
	title: (providedTitle, dexCid: string, smaliFilePath: string) =>
		providedTitle ?? `smali from dex ${dexCid} ${smaliFilePath}`,
	async exec(t, dexCid: string, smaliFilePath: string, shouldSnapshot: boolean) {
		const hasBaksmali = await hasBaksmaliPromise;

		if (!hasBaksmali) {
			t.pass('skipping test because baksmali is not available');
			return;
		}

		const dexStream = await fetchCid(dexCid);

		const smali = await baksmaliClass(dexStream, smaliFilePath);

		const actual = await runParser(smaliParser, smali, stringParserInputCompanion, {
			errorJoinMode: 'all',
		});

		// console.dir(actual, { depth: null });

		if (shouldSnapshot) {
			t.snapshot(actual);
		} else {
			//console.dir(actual, { depth: null });
			t.pass();
		}
	},
});

test.serial(smaliFromDexMacro, 'bafkreibb4gsprc3fvmnyqx6obswvm7e7wngnfj64gz65ey72r7xgyzymt4', 'pl/czak/minimal/MainActivity', true);
test.serial(smaliFromDexMacro, 'bafybeiebe27ylo53trgitu6fqfbmba43c4ivxj3nt4kumsilkucpbdxtqq', 'd/m', true);
test.serial(smaliFromDexMacro, 'bafybeibbupm7uzhuq4pa674rb2amxsenbdaoijigmaf4onaodaql4mh7yy', 'com/journeyapps/barcodescanner/CaptureActivity', true);
test.serial.skip(smaliFromDexMacro, 'bafybeicb3qajmwy6li7hche2nkucvytaxcyxhwhphmi73tgydjzmyoqoda', '', false);

// Minimal failing test case reproducing the a0/n parsing issue
test('parse smali with virtual method after direct methods (a0/n issue)', async t => {
	const smali = `.class public final La0/n;
.super Landroid/view/View;
.source "SourceFile"

# direct methods
.method public static constructor <clinit>()V
    .registers 1

    return-void
.end method

# virtual methods
.method public final b(Lr/o;ZJIJFLa0/a;)V
    .registers 21

    move-object v7, p0

    move-object v8, p1

    move v9, p2

    move-object/from16 v0, p9

    const-string v1, "interaction"

    invoke-static {p1, v1}, Lv6/h;->e(Ljava/lang/Object;Ljava/lang/String;)V

    const-string v1, "onInvalidateRipple"

    invoke-static {v0, v1}, Lv6/h;->e(Ljava/lang/Object;Ljava/lang/String;)V

    iget-object v1, v7, La0/n;->j:La0/v;

    if-eqz v1, :cond_1f

    invoke-static {p2}, Ljava/lang/Boolean;->valueOf(Z)Ljava/lang/Boolean;

    move-result-object v1

    iget-object v2, v7, La0/n;->k:Ljava/lang/Boolean;

    invoke-static {v1, v2}, Lv6/h;->a(Ljava/lang/Object;Ljava/lang/Object;)Z

    move-result v1

    if-nez v1, :cond_2f

    :cond_1f
    new-instance v1, La0/v;

    invoke-direct {v1, p2}, La0/v;-><init>(Z)V

    invoke-virtual {p0, v1}, Landroid/view/View;->setBackground(Landroid/graphics/drawable/Drawable;)V

    iput-object v1, v7, La0/n;->j:La0/v;

    invoke-static {p2}, Ljava/lang/Boolean;->valueOf(Z)Ljava/lang/Boolean;

    move-result-object v1

    iput-object v1, v7, La0/n;->k:Ljava/lang/Boolean;

    :cond_2f
    iget-object v10, v7, La0/n;->j:La0/v;

    invoke-static {v10}, Lv6/h;->b(Ljava/lang/Object;)V

    iput-object v0, v7, La0/n;->n:Lu6/a;

    move-object v0, p0

    move-wide v1, p3

    move/from16 v3, p5

    move-wide/from16 v4, p6

    move/from16 v6, p8

    invoke-virtual/range {v0 .. v6}, La0/n;->e(JIJF)V

    if-eqz v9, :cond_50

    iget-wide v0, v8, Lr/o;->a:J

    invoke-static {v0, v1}, Lq0/c;->b(J)F

    move-result v0

    iget-wide v1, v8, Lr/o;->a:J

    invoke-static {v1, v2}, Lq0/c;->c(J)F

    move-result v1

    goto :goto_62

    :cond_50
    invoke-virtual {v10}, Landroid/graphics/drawable/Drawable;->getBounds()Landroid/graphics/Rect;

    move-result-object v0

    invoke-virtual {v0}, Landroid/graphics/Rect;->centerX()I

    move-result v0

    int-to-float v0, v0

    invoke-virtual {v10}, Landroid/graphics/drawable/Drawable;->getBounds()Landroid/graphics/Rect;

    move-result-object v1

    invoke-virtual {v1}, Landroid/graphics/Rect;->centerY()I

    move-result v1

    int-to-float v1, v1

    :goto_62
    invoke-virtual {v10, v0, v1}, Landroid/graphics/drawable/Drawable;->setHotspot(FF)V

    const/4 v0, 0x1

    invoke-direct {p0, v0}, La0/n;->setRippleState(Z)V

    return-void

.end method
`;

	const actual = await runParser(smaliParser, smali, stringParserInputCompanion, {
		errorJoinMode: 'all',
	});

	t.truthy(actual);
	t.is(actual.classData?.virtualMethods.length, 1);
});
