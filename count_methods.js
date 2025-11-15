import { runParser } from './build/parser.js';
import { uint8ArrayParserInputCompanion } from './build/parserInputCompanion.js';
import { dalvikExecutableWithRawInstructionsParser } from './build/dalvikExecutableParser.js';
import { fetchCid } from './build/fetchCid.js';

const dexCid = 'bafybeiebe27ylo53trgitu6fqfbmba43c4ivxj3nt4kumsilkucpbdxtqq';

console.log('Parsing DEX with raw instructions to count methods...');
const dexStream = await fetchCid(dexCid);
const result = await runParser(dalvikExecutableWithRawInstructionsParser, dexStream, uint8ArrayParserInputCompanion, {
  errorJoinMode: 'all',
});

let totalMethods = 0;
let methodsWithCode = 0;
let totalBytecodeSize = 0;
let maxBytecodeSize = 0;

for (const classDef of result.classDefinitions) {
  if (!classDef.classData) continue;
  
  for (const method of [...classDef.classData.directMethods, ...classDef.classData.virtualMethods]) {
    totalMethods++;
    if (method.code) {
      methodsWithCode++;
      const size = method.code.instructions.length;
      totalBytecodeSize += size;
      if (size > maxBytecodeSize) {
        maxBytecodeSize = size;
      }
    }
  }
}

console.log('Total methods:', totalMethods);
console.log('Methods with code:', methodsWithCode);
console.log('Total bytecode size:', totalBytecodeSize, 'bytes');
console.log('Max bytecode size:', maxBytecodeSize, 'bytes');
console.log('Average bytecode size:', (totalBytecodeSize / methodsWithCode).toFixed(2), 'bytes');
