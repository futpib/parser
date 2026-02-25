import { testProp } from '@fast-check/ava';
import { arbitraryBashCommandList } from './arbitraryBash.js';
import { bashScriptUnparser } from './bashUnparser.js';
import { bashScriptParser } from './bashParser.js';
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
	'bash roundtrip',
	[arbitraryBashCommandList],
	async (t, command) => {
		const source = await collectString(runUnparser(
			bashScriptUnparser, command, stringUnparserOutputCompanion));

		const reparsed = await runParser(
			bashScriptParser, source, stringParserInputCompanion);

		t.deepEqual(reparsed, command);
	},
	{
		verbose: true,
		seed,
	},
);
