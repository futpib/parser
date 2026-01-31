import { testProp } from '@fast-check/ava';
import { arbitraryJavaCompilationUnit } from './arbitraryJava.js';
import { javaCompilationUnitUnparser } from './javaUnparser.js';
import { javaCompilationUnitParser } from './javaParser.js';
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
	'javaUnparser roundtrip',
	[arbitraryJavaCompilationUnit],
	async (t, compilationUnit) => {
		const source = await collectString(runUnparser(
			javaCompilationUnitUnparser, compilationUnit, stringUnparserOutputCompanion));

		const reparsed = await runParser(
			javaCompilationUnitParser, source, stringParserInputCompanion);

		t.deepEqual(reparsed, compilationUnit);
	},
	{
		verbose: true,
		seed,
	},
);
