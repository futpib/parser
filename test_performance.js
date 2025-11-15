import { runParser } from './build/parser.js';
import { uint8ArrayParserInputCompanion } from './build/parserInputCompanion.js';
import { dalvikExecutableParser } from './build/dalvikExecutableParser.js';
import { fetchCid } from './build/fetchCid.js';

const dexCid = 'bafybeiebe27ylo53trgitu6fqfbmba43c4ivxj3nt4kumsilkucpbdxtqq';

console.log('Starting dalvikExecutableParser test');
const dexStream = await fetchCid(dexCid);
const startTime = Date.now();

const progressInterval = setInterval(() => {
  console.log(`Parsing... elapsed: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
}, 5000);

try {
  const result = await runParser(dalvikExecutableParser, dexStream, uint8ArrayParserInputCompanion, {
    errorJoinMode: 'all',
  });
  
  clearInterval(progressInterval);
  const elapsed = (Date.now() - startTime) / 1000;
  console.log(`✓ Parsing completed in ${elapsed.toFixed(1)}s`);
  console.log(`  Class definitions: ${result.classDefinitions.length}`);
} catch (error) {
  clearInterval(progressInterval);
  console.error(`✗ Error after ${((Date.now() - startTime) / 1000).toFixed(1)}s:`, error.message);
  process.exit(1);
}
