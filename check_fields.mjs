import { fetchCid } from './build/fetchCid.js';
import { baksmaliClass } from './build/backsmali.js';

const dexStream = await fetchCid('bafybeibbupm7uzhuq4pa674rb2amxsenbdaoijigmaf4onaodaql4mh7yy');
const smali = await baksmaliClass(dexStream, 'androidx/recyclerview/widget/LinearSmoothScroller');

const lines = smali.split('\n');
let inStaticFields = false;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('# static fields')) {
    inStaticFields = true;
    console.log(lines[i]);
    continue;
  }
  if (lines[i].includes('# instance fields')) {
    break;
  }
  if (inStaticFields && lines[i].includes('.field')) {
    console.log(lines[i]);
  }
}
