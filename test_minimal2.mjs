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
  
  // The map is at the end, let's find it
  // Map offset is at position 112 (file header)
  const mapOffset = bytes.readUInt32LE(112);
  console.log('Map offset:', mapOffset);
  
  // Read the map
  let pos = mapOffset;
  const mapSize = bytes.readUInt32LE(pos);
  pos += 4;
  
  console.log('Map size:', mapSize);
  console.log('\nMap items:');
  for (let i = 0; i < mapSize; i++) {
    const type = bytes.readUInt16LE(pos);
    pos += 2;
    pos += 2; // unused
    const size = bytes.readUInt32LE(pos);
    pos += 4;
    const offset = bytes.readUInt32LE(pos);
    pos += 4;
    
    const typeName = {
      0x0000: 'HEADER',
      0x0001: 'STRING_ID',
      0x0002: 'TYPE_ID',
      0x0003: 'PROTO_ID',
      0x0004: 'FIELD_ID',
      0x0005: 'METHOD_ID',
      0x0006: 'CLASS_DEF',
      0x1000: 'MAP_LIST',
      0x1001: 'TYPE_LIST',
      0x1002: 'ANNOTATION_SET_REF_LIST',
      0x1003: 'ANNOTATION_SET',
      0x2001: 'CLASS_DATA',
      0x2002: 'CODE',
      0x2003: 'STRING_DATA',
      0x2004: 'ANNOTATION',
      0x2005: 'ENCODED_ARRAY',
      0x2006: 'ANNOTATIONS_DIRECTORY',
    }[type] || `0x${type.toString(16)}`;
    
    console.log(`  ${typeName}: size=${size}, offset=${offset}`);
  }
})();
