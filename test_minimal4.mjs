import { dalvikExecutableUnparser } from './build/dalvikExecutableUnparser.js';
import { runUnparser } from './build/unparser.js';
import { uint8ArrayUnparserOutputCompanion } from './build/unparserOutputCompanion.js';
import { uint8ArrayAsyncIterableToUint8Array } from './build/uint8Array.js';

const dalvikExecutable = {
  classDefinitions: [{
    class: "La/a;",
    accessFlags: {
      public: false, private: false, protected: false, static: false, final: false,
      synchronized: false, volatile: false, bridge: false, transient: false, varargs: false,
      native: false, interface: false, abstract: false, strict: false, synthetic: false,
      annotation: false, enum: false, constructor: false, declaredSynchronized: false
    },
    superclass: "L_/_;",
    interfaces: [],
    sourceFile: undefined,
    annotations: {
      classAnnotations: [],
      fieldAnnotations: [],
      methodAnnotations: [],
      parameterAnnotations: [{
        method: { class: "L_/A;", prototype: { shorty: "J", returnType: "J", parameters: [] }, name: "<init>" },
        annotations: [
          [{ visibility: "system", type: "LA/a;", elements: [] }],
          [{ visibility: "runtime", type: "LA/_;", elements: [] }]
        ]
      }]
    },
    staticValues: [],
    classData: undefined
  }],
  link: undefined
};

(async () => {
  const unparsedIterable = runUnparser(dalvikExecutableUnparser, dalvikExecutable, uint8ArrayUnparserOutputCompanion);
  const bytes = await uint8ArrayAsyncIterableToUint8Array(unparsedIterable);
  
  console.log('Total bytes:', bytes.length);
  console.log('\nOffset 300 (1st annotation set):',bytes.slice(300, 308).toString('hex'));
  console.log('Offset 308 (1st annotation item):', bytes.slice(308, 315).toString('hex'));
  console.log('Offset 312 (should be 2nd annotation set):', bytes.slice(312, 320).toString('hex'));
  console.log('Offset 320 (should be 2nd annotation item):', bytes.slice(320, 328).toString('hex'));
  console.log('Offset 324 (map):', bytes.slice(324, 360).toString('hex'));
  
  console.log('\nDetailed decode:');
  console.log('Annotation set ref list at 288:');
  console.log('  Count:', bytes.readUInt32LE(288));
  console.log('  Offset 1:', bytes.readUInt32LE(292));
  console.log('  Offset 2:', bytes.readUInt32LE(296));
})();
