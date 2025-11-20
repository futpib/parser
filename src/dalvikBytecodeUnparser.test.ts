import { testProp } from '@fast-check/ava';
import { runUnparser } from './unparser.js';
import { dalvikBytecodeUnparser } from './dalvikBytecodeUnparser.js';
import { uint8ArrayUnparserOutputCompanion } from './unparserOutputCompanion.js';
import { runParser } from './parser.js';
import { createDalvikBytecodeParser } from './dalvikBytecodeParser.js';
import { uint8ArrayParserInputCompanion } from './parserInputCompanion.js';
import { arbitraryDalvikBytecode } from './arbitraryDalvikBytecode.js';
import { uint8ArrayAsyncIterableToUint8Array } from './uint8Array.js';

const seed = process.env.SEED ? Number(process.env.SEED) : undefined;

testProp(
	'dalvik bytecode roundtrip',
	[arbitraryDalvikBytecode],
	async (t, bytecode) => {
		// Unparse the bytecode to bytes
		const unparsedStreamIterable = runUnparser(
			dalvikBytecodeUnparser,
			bytecode,
			uint8ArrayUnparserOutputCompanion
		);

		// Collect all chunks into a single Uint8Array
		const unparsedStream = await uint8ArrayAsyncIterableToUint8Array(unparsedStreamIterable);

		// Create parser with the correct size
		const dalvikBytecodeParser = createDalvikBytecodeParser(unparsedStream.length);

		// Re-parse the unparsed bytes
		const actual = await runParser(
			dalvikBytecodeParser,
			unparsedStream,
			uint8ArrayParserInputCompanion
		);

		// Assert deep equality
		t.deepEqual(actual, bytecode);
	},
	{
		verbose: true,
		seed,
	}
);
