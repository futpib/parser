import test from 'ava';
import fs from 'node:fs/promises';
import { runParser } from './parser.js';
import { stringParserInputCompanion } from './parserInputCompanion.js';
import { smaliParser } from './smaliParser.js';

test.serial('MINIMAL FAILING TEST', async t => {
const smali = await fs.readFile('/tmp/minimal_failing.smali', 'utf-8');

console.log('===== MINIMAL FAILING SMALI FILE =====');
console.log('File: /tmp/minimal_failing.smali');
console.log('Length:', smali.length, 'characters');
console.log('=====================================\n');

try {
const result = await runParser(smaliParser, smali, stringParserInputCompanion, {
errorJoinMode: 'all',
});
console.log('UNEXPECTED SUCCESS');
t.fail('Expected this to fail but it passed');
} catch (error: any) {
console.log('FAILED AS EXPECTED:', error.message);
t.pass();
}
});
