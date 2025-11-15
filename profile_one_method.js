import { runParser } from './build/parser.js';
import { uint8ArrayParserInputCompanion } from './build/parserInputCompanion.js';
import { dalvikExecutableWithRawInstructionsParser } from './build/dalvikExecutableParser.js';
import { createDalvikBytecodeParser } from './build/dalvikBytecodeParser.js';
import { fetchCid } from './build/fetchCid.js';

const dexCid = 'bafybeiebe27ylo53trgitu6fqfbmba43c4ivxj3nt4kumsilkucpbdxtqq';

console.log('Parsing DEX...');
const dexStream = await fetchCid(dexCid);
const result = await runParser(dalvikExecutableWithRawInstructionsParser, dexStream, uint8ArrayParserInputCompanion, {
  errorJoinMode: 'all',
});

// Find the largest method
let largestMethod = null;
let largestSize = 0;

for (const classDef of result.classDefinitions) {
  if (!classDef.classData) continue;
  
  for (const method of [...classDef.classData.directMethods, ...classDef.classData.virtualMethods]) {
    if (method.code && method.code.instructions instanceof Uint8Array) {
      const size = method.code.instructions.length;
      if (size > largestSize) {
        largestSize = size;
        largestMethod = method;
      }
    }
  }
}

console.log(`Largest method has ${largestSize} bytes of instructions`);
console.log(`Parsing it 10 times to measure performance...`);

const trials = 10;
const times = [];

for (let i = 0; i < trials; i++) {
  async function* instructionsStream() {
    yield largestMethod.code.instructions;
  }
  
  const start = Date.now();
  await runParser(
    createDalvikBytecodeParser(largestMethod.code.instructions.length),
    instructionsStream(),
    uint8ArrayParserInputCompanion,
    { errorJoinMode: 'all' }
  );
  const elapsed = Date.now() - start;
  times.push(elapsed);
  console.log(`  Trial ${i+1}: ${elapsed}ms`);
}

const avg = times.reduce((a, b) => a + b, 0) / times.length;
console.log(`Average: ${avg.toFixed(1)}ms for ${largestSize} bytes`);
