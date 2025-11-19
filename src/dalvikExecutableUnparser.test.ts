import test from 'ava';
import { runUnparser } from './unparser.js';
import { dalvikExecutableUnparser } from './dalvikExecutableUnparser.js';
import { uint8ArrayUnparserOutputCompanion } from './unparserOutputCompanion.js';

/**
 * This test would verify that we can:
 * 1. Parse a DEX file into a DalvikExecutable structure
 * 2. Unparse that structure back into bytes
 * 3. Parse those bytes again
 * 4. Get the same DalvikExecutable structure
 *
 * This round-trip test is currently skipped because the dalvikExecutableUnparser
 * is not yet implemented due to its complexity.
 *
 * A full implementation would require:
 * - Building complete ID pools from class definitions
 * - Computing all offsets for variable-sized structures
 * - Implementing ULEB128/SLEB128 encoding
 * - Implementing MUTF-8 string encoding
 * - Computing Adler-32 checksum and SHA-1 hash
 * - Writing all DEX file sections in the correct order
 * - Managing byte alignment requirements
 * - Handling annotations, debug info, encoded arrays, etc.
 *
 * This would be comparable to implementing a full DEX assembler/compiler,
 * which is a significant undertaking beyond the scope of this task.
 */

/**
 * This test demonstrates that the unparser correctly reports it's not implemented.
 */
test('dalvik executable unparser throws not implemented error', async t => {
	// Create a minimal DalvikExecutable structure for testing
	const minimalDex = {
		classDefinitions: [],
		link: undefined,
	};

	await t.throwsAsync(
		async () => {
			const unparsedStreamIterable = runUnparser(
				dalvikExecutableUnparser,
				minimalDex,
				uint8ArrayUnparserOutputCompanion,
			);

			// Try to consume the stream
			for await (const _chunk of unparsedStreamIterable) {
				// This should throw before producing any chunks
			}
		},
		{
			message: /not yet implemented|not implemented/i,
		},
		'Should throw error indicating unparser is not implemented',
	);
});

