import { runParser } from './build/parser.js';
import { uint8ArrayParserInputCompanion } from './build/parserInputCompanion.js';
import { createDalvikBytecodeParser } from './build/dalvikBytecodeParser.js';

// Create a simple test with just 4 bytes (2-byte nop instruction twice)
const testData = new Uint8Array([0x00, 0x00, 0x00, 0x00]);

async function* testStream() {
  yield testData;
}

console.log('Testing bytecode parser with simple data');
const startTime = Date.now();

const progressInterval = setInterval(() => {
  console.log('Still parsing... elapsed time:', (Date.now() - startTime) / 1000, 'seconds');
}, 1000);

try {
  const result = await runParser(createDalvikBytecodeParser(4), testStream(), uint8ArrayParserInputCompanion, {
    errorJoinMode: 'all',
  });
  
  clearInterval(progressInterval);
  console.log('Parsing completed in', (Date.now() - startTime) / 1000, 'seconds');
  console.log('Result:', result);
} catch (error) {
  clearInterval(progressInterval);
  console.error('Error:', error.message);
}
