import { testProp } from '@fast-check/ava';
import { runUnparser } from './unparser.js';
import { rawDalvikBytecodeUnparser } from './dalvikBytecodeUnparser.js';
import { uint8ArrayUnparserOutputCompanion } from './unparserOutputCompanion.js';
import { runParser } from './parser.js';
import { createRawDalvikBytecodeParser } from './dalvikBytecodeParser.js';
import { uint8ArrayParserInputCompanion } from './parserInputCompanion.js';
import { arbitraryRawDalvikBytecode } from './arbitraryDalvikBytecode.js';
import { uint8ArrayAsyncIterableToUint8Array } from './uint8Array.js';

const seed = process.env.SEED ? Number(process.env.SEED) : undefined;

testProp(
	'dalvik bytecode roundtrip',
	[arbitraryRawDalvikBytecode],
	async (t, bytecode) => {
		// Unparse the bytecode to bytes
		const unparsedStreamIterable = runUnparser(
			rawDalvikBytecodeUnparser,
			bytecode,
			uint8ArrayUnparserOutputCompanion
		);

		// Collect all chunks into a single Uint8Array
		const unparsedStream = await uint8ArrayAsyncIterableToUint8Array(unparsedStreamIterable);

		// Create parser with the correct size
		const rawDalvikBytecodeParser = createRawDalvikBytecodeParser(unparsedStream.length);

		// Re-parse the unparsed bytes
		const actual = await runParser(
			rawDalvikBytecodeParser,
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
