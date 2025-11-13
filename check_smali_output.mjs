import { runParser } from './build/parser.js';
import { stringParserInputCompanion } from './build/parserInputCompanion.js';
import { smaliParser } from './build/smaliParser.js';
import { fetchCid } from './build/fetchCid.js';
import { baksmaliClass } from './build/backsmali.js';

const dexStream = await fetchCid('bafybeibbupm7uzhuq4pa674rb2amxsenbdaoijigmaf4onaodaql4mh7yy');
const smali_ = await baksmaliClass(dexStream, 'androidx/recyclerview/widget/LinearSmoothScroller');
const smali = smali_.replaceAll(/^\s+\.line \d+\s*$/gm, '').replaceAll(/\n{3,}/g, '\n\n');

const result = await runParser(smaliParser, smali, stringParserInputCompanion, {
  errorJoinMode: 'all',
});

console.log('Smali parser staticValues:', result.staticValues);
console.log('Static fields:', result.classData.staticFields.slice(0, 7).map((f, i) => `${i}: ${f.name}:${f.type}`));
