import { runParser } from './build/parser.js';
import { uint8ArrayParserInputCompanion } from './build/parserInputCompanion.js';
import { dalvikExecutableParser } from './build/dalvikExecutableParser.js';
import { fetchCid } from './build/fetchCid.js';

const dexCid = 'bafybeiebe27ylo53trgitu6fqfbmba43c4ivxj3nt4kumsilkucpbdxtqq';

console.log('Starting full parse with dalvikExecutableParser');
const dexStream = await fetchCid(dexCid);
const startTime = Date.now();

let lastProgress = startTime;
const progressInterval = setInterval(() => {
  const now = Date.now();
  const elapsed = (now - startTime) / 1000;
  const delta = (now - lastProgress) / 1000;
  console.log(`Still parsing... elapsed: ${elapsed.toFixed(1)}s (last: ${delta.toFixed(1)}s)`);
  lastProgress = now;
}, 5000);

try {
  const result = await runParser(dalvikExecutableParser, dexStream, uint8ArrayParserInputCompanion, {
    errorJoinMode: 'all',
  });
  
  clearInterval(progressInterval);
  console.log('Parsing completed in', (Date.now() - startTime) / 1000, 'seconds');
  console.log('Number of class definitions:', result.classDefinitions.length);
} catch (error) {
  clearInterval(progressInterval);
  console.error('Error:', error.message);
  if (error.stack) console.error(error.stack.split('\n').slice(0, 20).join('\n'));
}
