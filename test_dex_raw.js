import { runParser } from './build/parser.js';
import { uint8ArrayParserInputCompanion } from './build/parserInputCompanion.js';
import { dalvikExecutableWithRawInstructionsParser } from './build/dalvikExecutableParser.js';
import { fetchCid } from './build/fetchCid.js';

const dexCid = 'bafybeiebe27ylo53trgitu6fqfbmba43c4ivxj3nt4kumsilkucpbdxtqq';

console.log('Testing dalvikExecutableWithRawInstructionsParser');
const dexStream = await fetchCid(dexCid);
const startTime = Date.now();

const progressInterval = setInterval(() => {
  console.log('Still parsing... elapsed time:', (Date.now() - startTime) / 1000, 'seconds');
}, 1000);

try {
  const result = await runParser(dalvikExecutableWithRawInstructionsParser, dexStream, uint8ArrayParserInputCompanion, {
    errorJoinMode: 'all',
  });
  
  clearInterval(progressInterval);
  console.log('Parsing completed in', (Date.now() - startTime) / 1000, 'seconds');
  console.log('Number of class definitions:', result.classDefinitions.length);
  
  // Check first class code
  const firstClass = result.classDefinitions[0];
  if (firstClass && firstClass.classData) {
    console.log('First class has direct methods:', firstClass.classData.directMethods.length);
    if (firstClass.classData.directMethods[0]?.code) {
      const firstCode = firstClass.classData.directMethods[0].code;
      console.log('First method code instructions size:', firstCode.instructions.length);
      console.log('First method code instructions type:', firstCode.instructions instanceof Uint8Array ? 'Uint8Array' : typeof firstCode.instructions);
    }
  }
} catch (error) {
  clearInterval(progressInterval);
  console.error('Error:', error.message);
  console.error(error.stack);
}
