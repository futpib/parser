import { fetchCid } from './build/fetchCid.js';

const dexCid = 'bafybeiebe27ylo53trgitu6fqfbmba43c4ivxj3nt4kumsilkucpbdxtqq';

console.log('Fetching CID:', dexCid);
const dexStream = await fetchCid(dexCid);

let totalSize = 0;
for await (const chunk of dexStream) {
  totalSize += chunk.length;
}

console.log('File size:', totalSize, 'bytes');
