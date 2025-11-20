import { dalvikExecutableUnparser } from './build/dalvikExecutableUnparser.js';
import { dalvikExecutableParser } from './build/dalvikExecutableParser.js';
import { runParser } from './build/parser.js';
import { runUnparser } from './build/unparser.js';
import { uint8ArrayParserInputCompanion } from './build/parserInputCompanion.js';
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
  try {
    const unparsedIterable = runUnparser(dalvikExecutableUnparser, dalvikExecutable, uint8ArrayUnparserOutputCompanion);
    const bytes = await uint8ArrayAsyncIterableToUint8Array(unparsedIterable);
    
    console.log('Unparsed bytes length:', bytes.length);
    
    const reparsed = await runParser(dalvikExecutableParser, bytes, uint8ArrayParserInputCompanion, { errorStack: true });
    console.log('Success!');
  } catch (err) {
    console.error('Error:', err.message);
    console.error('Position:', err.position);
    console.error('Stack:', err.stack);
  }
})();
