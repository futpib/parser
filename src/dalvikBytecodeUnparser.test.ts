import { testProp } from '@fast-check/ava';
import { runUnparser } from './unparser.js';
import { dalvikBytecodeUnparser } from './dalvikBytecodeUnparser.js';
import { uint8ArrayUnparserOutputCompanion } from './unparserOutputCompanion.js';
import { runParser } from './parser.js';
import { createDalvikBytecodeParser } from './dalvikBytecodeParser.js';
import { uint8ArrayParserInputCompanion } from './parserInputCompanion.js';
import { arbitraryDalvikBytecode } from './arbitraryDalvikBytecode.js';

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
		const chunks: Uint8Array[] = [];
		for await (const chunk of unparsedStreamIterable) {
			chunks.push(chunk);
		}

		// Concatenate all chunks
		const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
		const unparsedStream = new Uint8Array(totalLength);
		let offset = 0;
		for (const chunk of chunks) {
			unparsedStream.set(chunk, offset);
			offset += chunk.length;
		}

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
