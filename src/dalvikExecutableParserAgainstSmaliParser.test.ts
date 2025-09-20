import test from 'ava';
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

const parseDexAgainstSmaliMacro = test.macro({
	title: (providedTitle, dexCid: string, smaliFilePathInput: string | { smaliFilePath: string; isolate?: boolean }) => {
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

		const smali = await baksmaliClass(dexStream, smaliFilePath);

		// console.log(smali);

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

		// console.dir({
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
	title: (providedTitle, dexCid: string) => {
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

		for (const smaliFilePath of classes) {
			console.log(smaliFilePath);
			console.log('='.repeat(smaliFilePath.length));

			const result = await t.try(parseDexAgainstSmaliMacro, dexCid, {
				smaliFilePath,
				isolate: true,
			});

			result.commit();
		}
	},
});

test.serial(parseDexAgainstSmaliMacro, 'bafkreibb4gsprc3fvmnyqx6obswvm7e7wngnfj64gz65ey72r7xgyzymt4', 'pl/czak/minimal/MainActivity');

test.serial(parseDexAgainstSmaliMacro, 'bafybeibbupm7uzhuq4pa674rb2amxsenbdaoijigmaf4onaodaql4mh7yy', {
	smaliFilePath: 'com/journeyapps/barcodescanner/CaptureActivity',
	isolate: true,
});

test.serial(parseDexAgainstSmaliMacro, 'bafybeiebe27ylo53trgitu6fqfbmba43c4ivxj3nt4kumsilkucpbdxtqq', {
	smaliFilePath: 'androidx/viewpager2/adapter/FragmentStateAdapter$5',
	isolate: true,
});

test.serial(parseDexAgainstSmaliMacro, 'bafybeiebe27ylo53trgitu6fqfbmba43c4ivxj3nt4kumsilkucpbdxtqq', {
	smaliFilePath: 'androidx/lifecycle/b0',
	isolate: true,
});

test.serial(parseDexAgainstSmaliMacro, 'bafybeiebe27ylo53trgitu6fqfbmba43c4ivxj3nt4kumsilkucpbdxtqq', {
	smaliFilePath: 'l4/a',
	isolate: true,
});

test.serial(parseDexAgainstSmaliMacro, 'bafybeiebe27ylo53trgitu6fqfbmba43c4ivxj3nt4kumsilkucpbdxtqq', {
	smaliFilePath: 'a/b',
	isolate: true,
});

test.serial(parseDexAgainstSmaliMacro, 'bafybeiebe27ylo53trgitu6fqfbmba43c4ivxj3nt4kumsilkucpbdxtqq', {
	smaliFilePath: 'android/app/AppComponentFactory',
	isolate: true,
});

test.serial.skip(parseDexAgainstSmaliMacro, 'bafybeiebe27ylo53trgitu6fqfbmba43c4ivxj3nt4kumsilkucpbdxtqq', {
	smaliFilePath: 'a0/i',
	isolate: true,
});

test.serial.skip(parseDexAgainstSmaliMacro, 'bafybeicb3qajmwy6li7hche2nkucvytaxcyxhwhphmi73tgydjzmyoqoda', '');

test.serial.skip(parseAllClassesInDexAgainstSmaliMacro, 'bafybeiebe27ylo53trgitu6fqfbmba43c4ivxj3nt4kumsilkucpbdxtqq');

const smali = `
.class public final Ll4/a;
.super Ll4/c;
.source "SourceFile"


# annotations
.annotation system Ldalvik/annotation/Signature;
    value = {
        "Ll4/c<",
        "Ljava/lang/Boolean;",
        ">;"
    }
.end annotation


# static fields
.field public static final i:Ljava/lang/String;


# direct methods
.method public static constructor <clinit>()V
    .registers 1

    const-string v0, "BatteryChrgTracker"

    invoke-static {v0}, Le4/k;->e(Ljava/lang/String;)Ljava/lang/String;

    move-result-object v0

    sput-object v0, Ll4/a;->i:Ljava/lang/String;

    return-void
.end method

.method public constructor <init>(Landroid/content/Context;Lq4/a;)V
    .registers 3

    invoke-direct {p0, p1, p2}, Ll4/c;-><init>(Landroid/content/Context;Lq4/a;)V

    return-void
.end method


# virtual methods
.method public final a()Ljava/lang/Object;
    .registers 6

    .line 1
    new-instance v0, Landroid/content/IntentFilter;

    .line 2
    .line 3
    const-string v1, "android.intent.action.BATTERY_CHANGED"

    .line 4
    .line 5
    invoke-direct {v0, v1}, Landroid/content/IntentFilter;-><init>(Ljava/lang/String;)V

    .line 6
    .line 7
    .line 8
    iget-object v1, p0, Ll4/d;->b:Landroid/content/Context;

    .line 9
    .line 10
    const/4 v2, 0x0

    .line 11
    invoke-virtual {v1, v2, v0}, Landroid/content/Context;->registerReceiver(Landroid/content/BroadcastReceiver;Landroid/content/IntentFilter;)Landroid/content/Intent;

    .line 12
    .line 13
    .line 14
    move-result-object v0

    .line 15
    const/4 v1, 0x0

    .line 16
    if-nez v0, :cond_1f

    .line 17
    .line 18
    invoke-static {}, Le4/k;->c()Le4/k;

    .line 19
    .line 20
    .line 21
    move-result-object v0

    .line 22
    sget-object v3, Ll4/a;->i:Ljava/lang/String;

    .line 23
    .line 24
    new-array v1, v1, [Ljava/lang/Throwable;

    .line 25
    .line 26
    const-string v4, "getInitialState - null intent received"

    .line 27
    .line 28
    invoke-virtual {v0, v3, v4, v1}, Le4/k;->b(Ljava/lang/String;Ljava/lang/String;[Ljava/lang/Throwable;)V

    .line 29
    .line 30
    .line 31
    goto :goto_31

    .line 32
    :cond_1f
    const/4 v2, -0x1

    .line 33
    const-string v3, "status"

    .line 34
    .line 35
    invoke-virtual {v0, v3, v2}, Landroid/content/Intent;->getIntExtra(Ljava/lang/String;I)I

    .line 36
    .line 37
    .line 38
    move-result v0

    .line 39
    const/4 v2, 0x2

    .line 40
    if-eq v0, v2, :cond_2c

    .line 41
    .line 42
    const/4 v2, 0x5

    .line 43
    if-ne v0, v2, :cond_2d

    .line 44
    .line 45
    :cond_2c
    const/4 v1, 0x1

    .line 46
    :cond_2d
    invoke-static {v1}, Ljava/lang/Boolean;->valueOf(Z)Ljava/lang/Boolean;

    .line 47
    .line 48
    .line 49
    move-result-object v2

    .line 50
    :goto_31
    return-object v2
    .line 51
    .line 52
    .line 53
    .line 54
    .line 55
    .line 56
    .line 57
    .line 58
    .line 59
    .line 60
    .line 61
    .line 62
    .line 63
    .line 64
    .line 65
    .line 66
    .line 67
    .line 68
    .line 69
    .line 70
    .line 71
    .line 72
    .line 73
    .line 74
    .line 75
    .line 76
    .line 77
    .line 78
    .line 79
    .line 80
    .line 81
    .line 82
    .line 83
    .line 84
    .line 85
    .line 86
    .line 87
    .line 88
    .line 89
    .line 90
    .line 91
    .line 92
    .line 93
    .line 94
    .line 95
    .line 96
    .line 97
    .line 98
    .line 99
    .line 100
    .line 101
    .line 102
    .line 103
    .line 104
    .line 105
    .line 106
    .line 107
    .line 108
    .line 109
    .line 110
    .line 111
    .line 112
    .line 113
    .line 114
    .line 115
    .line 116
    .line 117
    .line 118
    .line 119
    .line 120
    .line 121
    .line 122
.end method

.method public final e()Landroid/content/IntentFilter;
    .registers 3

    new-instance v0, Landroid/content/IntentFilter;

    invoke-direct {v0}, Landroid/content/IntentFilter;-><init>()V

    const-string v1, "android.os.action.CHARGING"

    invoke-virtual {v0, v1}, Landroid/content/IntentFilter;->addAction(Ljava/lang/String;)V

    const-string v1, "android.os.action.DISCHARGING"

    invoke-virtual {v0, v1}, Landroid/content/IntentFilter;->addAction(Ljava/lang/String;)V

    return-object v0
.end method

.method public final f(Landroid/content/Intent;)V
    .registers 8

    invoke-virtual {p1}, Landroid/content/Intent;->getAction()Ljava/lang/String;

    move-result-object p1

    if-nez p1, :cond_7

    return-void

    :cond_7
    invoke-static {}, Le4/k;->c()Le4/k;

    move-result-object v0

    sget-object v1, Ll4/a;->i:Ljava/lang/String;

    const/4 v2, 0x1

    new-array v3, v2, [Ljava/lang/Object;

    const/4 v4, 0x0

    aput-object p1, v3, v4

    const-string v5, "Received %s"

    invoke-static {v5, v3}, Ljava/lang/String;->format(Ljava/lang/String;[Ljava/lang/Object;)Ljava/lang/String;

    move-result-object v3

    new-array v5, v4, [Ljava/lang/Throwable;

    invoke-virtual {v0, v1, v3, v5}, Le4/k;->a(Ljava/lang/String;Ljava/lang/String;[Ljava/lang/Throwable;)V

    const/4 v0, -0x1

    invoke-virtual {p1}, Ljava/lang/String;->hashCode()I

    move-result v1

    sparse-switch v1, :sswitch_data_5e

    :goto_26
    move v2, v0

    goto :goto_51

    :sswitch_28
    const-string v1, "android.intent.action.ACTION_POWER_CONNECTED"

    invoke-virtual {p1, v1}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z

    move-result p1

    if-nez p1, :cond_31

    goto :goto_26

    :cond_31
    const/4 v2, 0x3

    goto :goto_51

    :sswitch_33
    const-string v1, "android.os.action.CHARGING"

    invoke-virtual {p1, v1}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z

    move-result p1

    if-nez p1, :cond_3c

    goto :goto_26

    :cond_3c
    const/4 v2, 0x2

    goto :goto_51

    :sswitch_3e
    const-string v1, "android.os.action.DISCHARGING"

    invoke-virtual {p1, v1}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z

    move-result p1

    if-nez p1, :cond_51

    goto :goto_26

    :sswitch_47
    const-string v1, "android.intent.action.ACTION_POWER_DISCONNECTED"

    invoke-virtual {p1, v1}, Ljava/lang/String;->equals(Ljava/lang/Object;)Z

    move-result p1

    if-nez p1, :cond_50

    goto :goto_26

    :cond_50
    move v2, v4

    :cond_51
    :goto_51
    packed-switch v2, :pswitch_data_70

    goto :goto_5d

    :pswitch_55
    sget-object p1, Ljava/lang/Boolean;->TRUE:Ljava/lang/Boolean;

    goto :goto_5a

    :pswitch_58
    sget-object p1, Ljava/lang/Boolean;->FALSE:Ljava/lang/Boolean;

    :goto_5a
    invoke-virtual {p0, p1}, Ll4/d;->b(Ljava/lang/Object;)V

    :goto_5d
    return-void

    :sswitch_data_5e
    .sparse-switch
        -0x7073f927 -> :sswitch_47
        -0x3465cce -> :sswitch_3e
        0x388694fe -> :sswitch_33
        0x3cbf870b -> :sswitch_28
    .end sparse-switch

    :pswitch_data_70
    .packed-switch 0x0
        :pswitch_58
        :pswitch_58
        :pswitch_55
        :pswitch_55
    .end packed-switch
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
