import { testProp } from '@fast-check/ava';
import * as fc from 'fast-check';
import { createArbitraryDalvikExecutable } from './arbitraryDalvikExecutable.js';
import { dalvikExecutableUnparser } from './dalvikExecutableUnparser.js';
import { dalvikExecutableParser } from './dalvikExecutableParser.js';
import { runParser } from './parser.js';
import { runUnparser } from './unparser.js';
import { uint8ArrayParserInputCompanion } from './parserInputCompanion.js';
import { uint8ArrayUnparserOutputCompanion } from './unparserOutputCompanion.js';
import { uint8ArrayAsyncIterableToUint8Array } from './uint8Array.js';
import { type DalvikBytecodeOperation } from './dalvikBytecodeParser.js';

const seed = 1665272134;

// Use minimal bytecode for testing - simple nop and return-void instructions
const arbitraryMinimalBytecode = fc.array(
fc.oneof(
fc.constant<DalvikBytecodeOperation>({
operation: 'nop',
}),
fc.constant<DalvikBytecodeOperation>({
operation: 'return-void',
}),
),
{ maxLength: 10 },
);

testProp(
'dalvikExecutableUnparser roundtrip DEBUG',
[createArbitraryDalvikExecutable(arbitraryMinimalBytecode)],
async (t, dalvikExecutable) => {
// Unparse to bytes
const unparsedIterable = runUnparser(
dalvikExecutableUnparser,
dalvikExecutable,
uint8ArrayUnparserOutputCompanion,
);
const bytes = await uint8ArrayAsyncIterableToUint8Array(unparsedIterable);

console.log('\n=== DEBUG INFO ===');
console.log('Total bytes:', bytes.length);

// Parse header
const header = bytes.slice(0, 112);
const fileSize = new DataView(header.buffer, header.byteOffset + 32, 4).getUint32(0, true);
const linkSize = new DataView(header.buffer, header.byteOffset + 44, 4).getUint32(0, true);
const linkOff = new DataView(header.buffer, header.byteOffset + 48, 4).getUint32(0, true);
const stringIdsSize = new DataView(header.buffer, header.byteOffset + 56, 4).getUint32(0, true);
const stringIdsOff = new DataView(header.buffer, header.byteOffset + 60, 4).getUint32(0, true);
const typeIdsSize = new DataView(header.buffer, header.byteOffset + 64, 4).getUint32(0, true);
const typeIdsOff = new DataView(header.buffer, header.byteOffset + 68, 4).getUint32(0, true);
const protoIdsSize = new DataView(header.buffer, header.byteOffset + 72, 4).getUint32(0, true);
const protoIdsOff = new DataView(header.buffer, header.byteOffset + 76, 4).getUint32(0, true);
const fieldIdsSize = new DataView(header.buffer, header.byteOffset + 80, 4).getUint32(0, true);
const fieldIdsOff = new DataView(header.buffer, header.byteOffset + 84, 4).getUint32(0, true);
const methodIdsSize = new DataView(header.buffer, header.byteOffset + 88, 4).getUint32(0, true);
const methodIdsOff = new DataView(header.buffer, header.byteOffset + 92, 4).getUint32(0, true);
const classDefsSize = new DataView(header.buffer, header.byteOffset + 96, 4).getUint32(0, true);
const classDefsOff = new DataView(header.buffer, header.byteOffset + 100, 4).getUint32(0, true);
const dataSize = new DataView(header.buffer, header.byteOffset + 104, 4).getUint32(0, true);
const dataOff = new DataView(header.buffer, header.byteOffset + 108, 4).getUint32(0, true);

console.log('String IDs: size', stringIdsSize, 'offset', stringIdsOff);
console.log('Type IDs: size', typeIdsSize, 'offset', typeIdsOff);
console.log('Proto IDs: size', protoIdsSize, 'offset', protoIdsOff);
console.log('Field IDs: size', fieldIdsSize, 'offset', fieldIdsOff);
console.log('Method IDs: size', methodIdsSize, 'offset', methodIdsOff);
console.log('Class defs: size', classDefsSize, 'offset', classDefsOff);
console.log('Data: size', dataSize, 'offset', dataOff);
console.log('Link: size', linkSize, 'offset', linkOff);

const expectedClassDefsEnd = classDefsOff + classDefsSize * 32;
console.log('Expected class defs end:', expectedClassDefsEnd);
console.log('Data offset - class defs end:', dataOff - expectedClassDefsEnd);

// Re-parse
try {
const reparsed = await runParser(
dalvikExecutableParser,
bytes,
uint8ArrayParserInputCompanion,
{
errorStack: true,
},
);

// Assert equality
t.deepEqual(reparsed, dalvikExecutable);
} catch (error) {
console.log('Parse error:', error);
throw error;
}
},
{
verbose: true,
seed,
numRuns: 1,
},
);
