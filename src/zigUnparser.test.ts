import { testProp } from '@fast-check/ava';
import { arbitraryZigRoot } from './arbitraryZig.js';
import { zigSourceFileUnparser } from './zigUnparser.js';
import { zigSourceFileParser } from './zigParser.js';
import { runParser } from './parser.js';
import { runUnparser } from './unparser.js';
import { stringParserInputCompanion } from './parserInputCompanion.js';
import { stringUnparserOutputCompanion } from './unparserOutputCompanion.js';

const seed = process.env.SEED ? Number(process.env.SEED) : undefined;

async function collectString(asyncIterable: AsyncIterable<string>): Promise<string> {
	let result = '';
	for await (const chunk of asyncIterable) {
		result += chunk;
	}

	return result;
}

testProp(
	'zigUnparser roundtrip',
	[arbitraryZigRoot],
	async (t, root) => {
		const source = await collectString(runUnparser(
			zigSourceFileUnparser, root, stringUnparserOutputCompanion));

		const reparsed = await runParser(
			zigSourceFileParser, source, stringParserInputCompanion);

		t.deepEqual(reparsed, root);
	},
	{
		verbose: true,
		seed,
	},
);
