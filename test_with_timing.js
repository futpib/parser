import { runParser } from './build/parser.js';
import { uint8ArrayParserInputCompanion } from './build/parserInputCompanion.js';
import { dalvikExecutableParser } from './build/dalvikExecutableParser.js';
import { fetchCid } from './build/fetchCid.js';

const dexCid = 'bafybeiebe27ylo53trgitu6fqfbmba43c4ivxj3nt4kumsilkucpbdxtqq';

console.log('[0s] Fetching DEX file...');
let t0 = Date.now();
const dexStream = await fetchCid(dexCid);
console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] Starting parser...`);

const progressInterval = setInterval(() => {
  console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] Still parsing...`);
}, 30000);  // Every 30 seconds

try {
  const result = await runParser(dalvikExecutableParser, dexStream, uint8ArrayParserInputCompanion, {
    errorJoinMode: 'all',
  });
  
  clearInterval(progressInterval);
  console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ✓ Parsing completed`);
  console.log(`Classes: ${result.classDefinitions.length}`);
  
  // Check that offsets and indexes are resolved
  let hasUnresolvedOffsets = false;
  let hasUnresolvedIndexes = false;
  
  function checkObject(obj, path = '') {
    if (!obj || typeof obj !== 'object') return;
    
    for (const [key, value] of Object.entries(obj)) {
      if (typeof key === 'string') {
        if (key.endsWith('Offset')) {
          console.log(`Found unresolved offset at ${path}.${key}`);
          hasUnresolvedOffsets = true;
        }
        if (key.endsWith('Index')) {
          console.log(`Found unresolved index at ${path}.${key}`);
          hasUnresolvedIndexes = true;
        }
      }
      if (Array.isArray(value)) {
        value.slice(0, 1).forEach((item, i) => checkObject(item, `${path}.${key}[${i}]`));
      } else if (typeof value === 'object') {
        checkObject(value, `${path}.${key}`);
      }
    }
  }
  
  console.log(`Checking first class for unresolved offsets/indexes...`);
  checkObject(result.classDefinitions[0], 'classDefinitions[0]');
  
  if (!hasUnresolvedOffsets && !hasUnresolvedIndexes) {
    console.log('✓ No unresolved offsets or indexes found');
  }
} catch (error) {
  clearInterval(progressInterval);
  console.error(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ✗ Error:`, error.message.substring(0, 200));
  process.exit(1);
}
