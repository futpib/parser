import { runParser } from './build/parser.js';
import { uint8ArrayParserInputCompanion } from './build/parserInputCompanion.js';
import { dalvikExecutableWithRawInstructionsParser } from './build/dalvikExecutableParser.js';
import { fetchCid } from './build/fetchCid.js';

const dexCid = 'bafybeiebe27ylo53trgitu6fqfbmba43c4ivxj3nt4kumsilkucpbdxtqq';

console.log('Parsing DEX...');
const dexStream = await fetchCid(dexCid);
const result = await runParser(dalvikExecutableWithRawInstructionsParser, dexStream, uint8ArrayParserInputCompanion, {
  errorJoinMode: 'all',
});

const opcodeCounts = new Map();
let totalOpcodes = 0;

for (const classDef of result.classDefinitions) {
  if (!classDef.classData) continue;
  
  for (const method of [...classDef.classData.directMethods, ...classDef.classData.virtualMethods]) {
    if (method.code && method.code.instructions instanceof Uint8Array) {
      const instructions = method.code.instructions;
      for (let i = 0; i < instructions.length; i += 2) {  // Instructions are 16-bit aligned
        const opcode = instructions[i];
        opcodeCounts.set(opcode, (opcodeCounts.get(opcode) || 0) + 1);
        totalOpcodes++;
      }
    }
  }
}

console.log(`\nTotal opcodes: ${totalOpcodes}`);
console.log(`Unique opcodes: ${opcodeCounts.size}`);
console.log(`\nTop 20 most common opcodes:`);

const sorted = Array.from(opcodeCounts.entries())
  .sort((a, b) => b[1] - a[1])
  .slice(0, 20);

for (const [opcode, count] of sorted) {
  const pct = ((count / totalOpcodes) * 100).toFixed(2);
  console.log(`  0x${opcode.toString(16).padStart(2, '0')}: ${count.toLocaleString()} (${pct}%)`);
}
