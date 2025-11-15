import { runParser } from './build/parser.js';
import { uint8ArrayParserInputCompanion } from './build/parserInputCompanion.js';
import { dalvikExecutableWithRawInstructionsParser } from './build/dalvikExecutableParser.js';
import { createDalvikBytecodeParser } from './build/dalvikBytecodeParser.js';
import { fetchCid } from './build/fetchCid.js';

const dexCid = 'bafybeiebe27ylo53trgitu6fqfbmba43c4ivxj3nt4kumsilkucpbdxtqq';

console.log('Parsing DEX with raw instructions');
const dexStream = await fetchCid(dexCid);
const result = await runParser(dalvikExecutableWithRawInstructionsParser, dexStream, uint8ArrayParserInputCompanion, {
  errorJoinMode: 'all',
});

console.log('Finding first method with code');
let foundMethod = false;
for (const classDef of result.classDefinitions) {
  if (!classDef.classData) continue;
  
  for (const method of [...classDef.classData.directMethods, ...classDef.classData.virtualMethods]) {
    if (method.code && method.code.instructions instanceof Uint8Array) {
      console.log('Found method with', method.code.instructions.length, 'bytes of instructions');
      
      // Try to parse just this one method's bytecode
      async function* instructionsStream() {
        yield method.code.instructions;
      }
      
      const startTime = Date.now();
      const progressInterval = setInterval(() => {
        console.log('Still parsing bytecode... elapsed time:', (Date.now() - startTime) / 1000, 'seconds');
      }, 1000);
      
      try {
        console.log('Parsing bytecode for method...');
        const bytecode = await runParser(
          createDalvikBytecodeParser(method.code.instructions.length),
          instructionsStream(),
          uint8ArrayParserInputCompanion,
          { errorJoinMode: 'all' }
        );
        
        clearInterval(progressInterval);
        console.log('Bytecode parsed successfully in', (Date.now() - startTime) / 1000, 'seconds');
        console.log('Number of operations:', bytecode.length);
        console.log('First 3 operations:', bytecode.slice(0, 3));
      } catch (error) {
        clearInterval(progressInterval);
        console.error('Error parsing bytecode:', error.message);
      }
      
      foundMethod = true;
      break;
    }
  }
  if (foundMethod) break;
}
