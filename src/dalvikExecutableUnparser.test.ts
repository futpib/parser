import { testProp } from '@fast-check/ava';
import * as fc from 'fast-check';
import { createArbitraryDalvikExecutable } from './arbitraryDalvikExecutable.js';
import { dalvikExecutableUnparser } from './dalvikExecutableUnparser.js';
import { dalvikExecutableParser } from './dalvikExecutableParser.js';
import { runParser } from './parser.js';
import { runUnparser } from './unparser.js';
import { uint8ArrayParserInputCompanion } from './parserInputCompanion.js';
import { uint8ArrayUnparserOutputCompanion } from './unparserOutputCompanion.js';
import { uint8ArrayAsyncIterableToUint8Array } from './uint8Array.js';
import { type DalvikBytecodeOperation } from './dalvikBytecodeParser.js';

const seed = process.env.SEED ? Number(process.env.SEED) : undefined;

// Use minimal bytecode for testing - simple nop and return-void instructions
const arbitraryMinimalBytecode = fc.array(
	fc.oneof(
		fc.constant<DalvikBytecodeOperation>({
			operation: 'nop',
		}),
		fc.constant<DalvikBytecodeOperation>({
			operation: 'return-void',
		}),
	),
	{ maxLength: 10 },
);

testProp(
	'dalvikExecutableUnparser roundtrip',
	[createArbitraryDalvikExecutable(arbitraryMinimalBytecode)],
	async (t, dalvikExecutable) => {
		// Log structure
		if (seed !== undefined) {
			console.log('Classes:', dalvikExecutable.classDefinitions.length);
			for (const classDef of dalvikExecutable.classDefinitions) {
				if (classDef.classData) {
					console.log(`  ${classDef.class}:`);
					console.log(`    directMethods: ${classDef.classData.directMethods.length}`);
					console.log(`    virtualMethods: ${classDef.classData.virtualMethods.length}`);
					for (const m of classDef.classData.directMethods) {
						console.log(`      direct ${m.method.name}: code=${!!m.code}`);
					}
					for (const m of classDef.classData.virtualMethods) {
						console.log(`      virtual ${m.method.name}: code=${!!m.code}`);
					}
				}
			}
		}

		// Unparse to bytes
		const unparsedIterable = runUnparser(
			dalvikExecutableUnparser,
			dalvikExecutable,
			uint8ArrayUnparserOutputCompanion,
		);
		const bytes = await uint8ArrayAsyncIterableToUint8Array(unparsedIterable);

		// Re-parse
		const reparsed = await runParser(
			dalvikExecutableParser,
			bytes,
			uint8ArrayParserInputCompanion,
			{
				errorStack: true,
			},
		);

		// Assert equality
		t.deepEqual(reparsed, dalvikExecutable);
	},
	{
		verbose: true,
		seed,
	},
);
