import test from 'ava';
import { stringParserInputCompanion } from './parserInputCompanion.js';
import { getParserName, type Parser, runParser } from './parser.js';
import { fetchCid } from './fetchCid.js';
import {
	smaliAnnotationParser, smaliCodeOperationParser, smaliCodeParameterParser, smaliCommentParser, smaliFieldParser, smaliMethodParser, smaliParser,
} from './smaliParser.js';
import { hasExecutable } from './hasExecutable.js';
import { baksmaliClass } from './backsmali.js';

const hasBaksmaliPromise = hasExecutable('baksmali');

const stringParserTestSnapshot = Symbol('stringParserTestSnapshot');
const stringParserTestIgnore = Symbol('stringParserTestIgnore');

function stringParserTest<Output>(
	parser: Parser<Output, string>,
	examples: Array<[
		string,
		Output
		| typeof stringParserTestSnapshot
		| typeof stringParserTestIgnore,
	]>,
) {
	const parserName = getParserName(parser);

	for (const [ input, expected ] of examples) {
		test(parserName + ' ' + JSON.stringify(input), async t => {
			const actual = await runParser(parser, input, stringParserInputCompanion, {
				errorJoinMode: 'all',
			});

			if (expected === stringParserTestIgnore) {
				t.pass('skipping test because expected is stringParserTestIgnore');
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
			name: undefined,
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
			name: 'savedInstanceState',
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
			name: undefined,
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
		annotations: [],
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
		annotations: [
				{
					visibility: 'system',
					type: 'Ldalvik/annotation/Signature;',
					elements: [
						{
							name: 'value',
							value: {
								kind: 'string',
								value: [
									'Lo/b<',
									'Ljava/lang/Float;',
									'Lo/i;',
									'>;',
								],
							},
						},
					],
				},
			],
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
					value: {
						kind: 'string',
						value: [
							'<T:',
							'Landroid/view/View;',
							'>(I)TT;',
						],
					},
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
					value: {
						kind: 'string',
						value: [
							'Lo/b<',
							'Ljava/lang/Float;',
							'Lo/i;',
							'>;',
						],
					},
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

		// Console.dir(actual, { depth: null });

		if (shouldSnapshot) {
			t.snapshot(actual);
		} else {
			// Console.dir(actual, { depth: null });
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

    invoke-virtual/range {v0 .. v6}, La0/n;->e(JIJF)V

    return-void
.end method
`;

	const actual = await runParser(smaliParser, smali, stringParserInputCompanion, {
		errorJoinMode: 'all',
	});

	t.truthy(actual);
	t.is(actual.classData?.virtualMethods.length, 1);
});

// Minimal failing test case for .end local directive
test('parse smali with .end local directive', async t => {
	const smali = `.class public Lpl/czak/minimal/MainActivity;
.super Landroid/app/Activity;

# direct methods
.method private sumToN(I)I
    .registers 4
    .param p1, "n"    # I

    const/4 v0, 0x0

    .local v0, "sum":I
    const/4 v1, 0x1

    .local v1, "i":I
    :goto_2
    if-gt v1, p1, :cond_8

    add-int/2addr v0, v1

    add-int/lit8 v1, v1, 0x1

    goto :goto_2

    .end local v1    # "i":I
    :cond_8
    return v0
.end method
`;

	const actual = await runParser(smaliParser, smali, stringParserInputCompanion, {
		errorJoinMode: 'all',
	});

	t.truthy(actual);
	t.is(actual.classData?.directMethods.length, 1);
});

// Minimal test case for .local with generic type signature
test('parse smali with .local directive with generic type signature', async t => {
	const smali = `.class public Lpl/czak/minimal/MainActivity;
.super Landroid/app/Activity;

# direct methods
.method private useLambda()Ljava/lang/String;
    .registers 3

    new-instance v0, Lpl/czak/minimal/MainActivity$$ExternalSyntheticLambda0;

    .local v0, "supplier":Ljava/util/function/Supplier;, "Ljava/util/function/Supplier<Ljava/lang/String;>;"

    return-object v0
.end method
`;

	const actual = await runParser(smaliParser, smali, stringParserInputCompanion, {
		errorJoinMode: 'all',
	});

	t.truthy(actual);
	t.is(actual.classData?.directMethods.length, 1);
});
