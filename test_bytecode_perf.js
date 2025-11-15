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

console.log('Testing bytecode parser performance...');
let count = 0;
const startTime = Date.now();

for (const classDef of result.classDefinitions.slice(0, 100)) {  // Test first 100 classes
  if (!classDef.classData) continue;
  
  for (const method of [...classDef.classData.directMethods, ...classDef.classData.virtualMethods]) {
    if (method.code && method.code.instructions instanceof Uint8Array) {
      async function* instructionsStream() {
        yield method.code.instructions;
      }
      
      await runParser(
        createDalvikBytecodeParser(method.code.instructions.length),
        instructionsStream(),
        uint8ArrayParserInputCompanion,
        { errorJoinMode: 'all' }
      );
      count++;
    }
  }
}

const elapsed = (Date.now() - startTime) / 1000;
console.log(`Parsed ${count} methods in ${elapsed.toFixed(2)}s (${(count / elapsed).toFixed(1)} methods/s)`);
