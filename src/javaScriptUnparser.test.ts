import { testProp } from '@fast-check/ava';
import { arbitraryJavaScriptProgram } from './arbitraryJavaScript.js';
import { javaScriptProgramUnparser } from './javaScriptUnparser.js';
import { javaScriptProgramParser } from './javaScriptParser.js';
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
	'javaScript roundtrip',
	[arbitraryJavaScriptProgram],
	async (t, program) => {
		const source = await collectString(runUnparser(
			javaScriptProgramUnparser, program, stringUnparserOutputCompanion));

		const reparsed = await runParser(
			javaScriptProgramParser, source, stringParserInputCompanion);

		t.deepEqual(reparsed, program);
	},
	{
		verbose: true,
		seed,
	},
);
