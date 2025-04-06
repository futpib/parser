import test from 'ava';
import { stringParserInputCompanion } from './parserInputCompanion.js';
import { getParserName, Parser, runParser } from './parser.js';
import { fetchCid } from './fetchCid.js';
import { smaliAnnotationParser, smaliCodeParameterParser, smaliFieldParser, smaliParser } from './smaliParser.js';
import { hasExecutable } from './hasExecutable.js';
import { baksmaliClass } from './backsmali.js';

const hasBaksmaliPromise = hasExecutable('baksmali');

function stringParserTest<Output>(parser: Parser<Output, string>, examples: [ string, Output ][]) {
	const parserName = getParserName(parser);

	for (const [ input, expected ] of examples) {
		test(parserName + ' ' + JSON.stringify(input), async t => {
			const actual = await runParser(parser, input, stringParserInputCompanion, {
				errorJoinMode: 'all',
			});

			t.deepEqual(actual, expected as any);
		});
	}
}

stringParserTest(smaliCodeParameterParser, [
	[
		'    .param p1\n',
		{
			index: 1,
			prefix: 'p',
		},
	],
	[
		'    .param p1, "savedInstanceState"    # Landroid/os/Bundle;\n',
		{
			index: 1,
			prefix: 'p',
		},
	],
]);

stringParserTest(smaliFieldParser, [
	[
		'.field private barcodeScannerView:Lcom/journeyapps/barcodescanner/DecoratedBarcodeView;\n',
		{
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
			type: 'Ldalvik/annotation/Signature;',
			value: [
				'<T:',
				'Landroid/view/View;',
				'>(I)TT;',
			],
		},
	],
]);

for (const [ dexCid, smaliFilePath, shouldSnapshot ] of [
	[ 'bafkreibb4gsprc3fvmnyqx6obswvm7e7wngnfj64gz65ey72r7xgyzymt4', 'pl/czak/minimal/MainActivity', true ],
	[ 'bafybeiebe27ylo53trgitu6fqfbmba43c4ivxj3nt4kumsilkucpbdxtqq', 'd/m', true ],
	// [ 'bafybeibbupm7uzhuq4pa674rb2amxsenbdaoijigmaf4onaodaql4mh7yy', 'com/journeyapps/barcodescanner/CaptureActivity', true ],
	// [ 'bafybeicb3qajmwy6li7hche2nkucvytaxcyxhwhphmi73tgydjzmyoqoda', false ],
] as const) {
	test.serial(
		'smali from dex ' + dexCid + ' ' + smaliFilePath,
		async t => {
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
	);
}
