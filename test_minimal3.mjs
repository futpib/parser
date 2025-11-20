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
  console.log('\nAnnotation set ref list at offset 288:');
  console.log('  Bytes:', bytes.slice(288, 300).toString('hex'));
  console.log('\nAnnotation set items should be at offset 300:');
  console.log('  Bytes:', bytes.slice(300, 320).toString('hex'));
  console.log('\nAnnotation items should be at offset 308:');
  console.log('  Bytes:', bytes.slice(308, 330).toString('hex'));
  console.log('\nMap at offset 324:');
  console.log('  Bytes:', bytes.slice(324, 400).toString('hex'));
})();
