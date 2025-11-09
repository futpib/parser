import test from 'ava';
import fs from 'node:fs/promises';
import { runParser } from './parser.js';
import { stringParserInputCompanion } from './parserInputCompanion.js';
import { smaliParser } from './smaliParser.js';

test.serial('parse full a0/n smali file', async t => {
const smaliContent = await fs.readFile('/tmp/a0_n.smali', 'utf-8');

const smali = (
smaliContent
.replaceAll(/^\s+\.line \d+\s*$/gm, '')
.replaceAll(/\n{3,}/g, '\n\n')
);

console.log('Smali length:', smali.length);

try {
const result = await runParser(smaliParser, smali, stringParserInputCompanion, {
errorJoinMode: 'all',
});
console.log('SUCCESS: Parsed a0/n');
console.log('Class:', result.class);
console.log('Direct methods:', result.classData?.directMethods.length);
console.log('Virtual methods:', result.classData?.virtualMethods.length);
t.pass();
} catch (error: any) {
console.log('FAILED:', error.message);
t.fail(error.message);
}
});
