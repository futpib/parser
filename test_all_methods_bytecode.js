import { runParser } from './build/parser.js';
import { uint8ArrayParserInputCompanion } from './build/parserInputCompanion.js';
import { dalvikExecutableWithRawInstructionsParser } from './build/dalvikExecutableParser.js';
import { createDalvikBytecodeParser } from './build/dalvikBytecodeParser.js';
import { fetchCid } from './build/fetchCid.js';

const dexCid = 'bafybeiebe27ylo53trgitu6fqfbmba43c4ivxj3nt4kumsilkucpbdxtqq';

console.log('Parsing DEX with raw instructions...');
const dexStream = await fetchCid(dexCid);
const result = await runParser(dalvikExecutableWithRawInstructionsParser, dexStream, uint8ArrayParserInputCompanion, {
  errorJoinMode: 'all',
});

console.log('Parsing bytecode for all methods...');
let count = 0;
let failed = 0;
const startTime = Date.now();
let lastReport = startTime;

for (const classDef of result.classDefinitions) {
  if (!classDef.classData) continue;
  
  for (const method of [...classDef.classData.directMethods, ...classDef.classData.virtualMethods]) {
    if (method.code && method.code.instructions instanceof Uint8Array) {
      async function* instructionsStream() {
        yield method.code.instructions;
      }
      
      try {
        await runParser(
          createDalvikBytecodeParser(method.code.instructions.length),
          instructionsStream(),
          uint8ArrayParserInputCompanion,
          { errorJoinMode: 'all' }
        );
        count++;
      } catch (error) {
        failed++;
        console.error(`Failed to parse method ${count + failed}:`, error.message.substring(0, 100));
      }
      
      if (Date.now() - lastReport > 1000) {
        console.log(`Parsed ${count} methods, ${failed} failed (${((Date.now() - startTime) / 1000).toFixed(1)}s)`);
        lastReport = Date.now();
      }
    }
  }
}

console.log(`Finished! Parsed ${count} methods, ${failed} failed in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
