import test from 'ava';
import { uint8ArrayParserInputCompanion } from './parserInputCompanion.js';
import { runParser } from './parser.js';
import { dexParser, sleb128Parser, uleb128p1Parser, uleb128Parser } from './dexParser.js';
import { fetchCid } from './fetchCid.js';

test('sleb128, uleb128, uleb128p1', async t => {
	for (const [
		input, expectedSleb128, expectedUleb128, expectedUleb128p1,
	] of [
		[ Buffer.from('00', 'hex'), 0, 0, -1 ],
		[ Buffer.from('01', 'hex'), 1, 1, 0 ],
		[ Buffer.from('7f', 'hex'), -1, 127, 126 ],
		[ Buffer.from('807f', 'hex'), -128, 16256, 16255 ],
	] as const) {
		const actualSleb128 = await runParser(sleb128Parser, input, uint8ArrayParserInputCompanion);
		const actualUleb128 = await runParser(uleb128Parser, input, uint8ArrayParserInputCompanion);
		const actualUleb128p1 = await runParser(uleb128p1Parser, input, uint8ArrayParserInputCompanion);

		t.is(actualSleb128, expectedSleb128, 'sleb128');
		t.is(actualUleb128, expectedUleb128, 'uleb128');
		t.is(actualUleb128p1, expectedUleb128p1, 'uleb128p1');
	}
});

for (const dexCid of [
	'bafkreibb4gsprc3fvmnyqx6obswvm7e7wngnfj64gz65ey72r7xgyzymt4',
]) {
	test(
		'dex ' + dexCid,
		async t => {
			const dexStream = await fetchCid(dexCid);

			const label = 'dex ' + dexCid;
			console.profile(label);

			const actual = await runParser(dexParser, dexStream, uint8ArrayParserInputCompanion, {
				errorJoinMode: 'all',
			});

			console.profileEnd(label);

			t.snapshot(actual);
		},
	);
}
