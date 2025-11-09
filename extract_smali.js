import { fetchCid } from './build/fetchCid.js';
import { baksmaliClass } from './build/backsmali.js';
import fs from 'node:fs/promises';

const dexStream = await fetchCid('bafybeiebe27ylo53trgitu6fqfbmba43c4ivxj3nt4kumsilkucpbdxtqq');
const smali = await baksmaliClass(dexStream, 'a0/n');

await fs.writeFile('/tmp/a0_n.smali', smali, 'utf8');
console.log('Smali content written to /tmp/a0_n.smali');
console.log('Length:', smali.length);
