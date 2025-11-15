import { runParser } from './build/parser.js';
import { uint8ArrayParserInputCompanion } from './build/parserInputCompanion.js';
import { dalvikExecutableParser } from './build/dalvikExecutableParser.js';
import { fetchCid } from './build/fetchCid.js';

const dexCid = 'bafybeiebe27ylo53trgitu6fqfbmba43c4ivxj3nt4kumsilkucpbdxtqq';

console.log('Fetching CID:', dexCid);
const dexStream = await fetchCid(dexCid);

console.log('Starting to parse...');
const startTime = Date.now();

// Set a timer to log progress
const progressInterval = setInterval(() => {
  console.log('Still parsing... elapsed time:', (Date.now() - startTime) / 1000, 'seconds');
}, 5000);

try {
  const actual = await runParser(dalvikExecutableParser, dexStream, uint8ArrayParserInputCompanion, {
    errorJoinMode: 'all',
  });
  
  clearInterval(progressInterval);
  console.log('Parsing completed in', (Date.now() - startTime) / 1000, 'seconds');
  console.log('Result:', typeof actual);
} catch (error) {
  clearInterval(progressInterval);
  console.error('Error:', error);
}
