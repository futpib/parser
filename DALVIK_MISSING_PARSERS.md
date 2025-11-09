# Missing Dalvik Bytecode Format Parsers

This document lists the Dalvik bytecode instruction format parsers that are not yet implemented in this repository.

Reference: [Android Dalvik Bytecode Specification](https://source.android.com/docs/core/runtime/dalvik-bytecode)

## Implementation Status

**Total formats:** 32  
**Implemented:** 24  
**Missing:** 8

## Missing Format Parsers Checklist

### High Priority Formats

- [x] **Format 11n** (const/4) - ✅ IMPLEMENTED
  - **Description:** vA, #+B - Immediate constant with 4-bit register and 4-bit signed immediate value
  - **Size:** 2 bytes (1 unit)
  - **Syntax:** `AA|op BBBB`
  - **Use case:** Small constant values (e.g., `const/4`)

- [x] **Format 51l** (const-wide) - ✅ IMPLEMENTED
  - **Description:** vAA, #+BBBBBBBBBBBBBBBB - 64-bit immediate constant
  - **Size:** 10 bytes (5 units)
  - **Syntax:** `AA|op BBBBlo BBBBhi`
  - **Use case:** Wide (64-bit) constant values

- [x] **Format 31c** (const-string/jumbo) - ✅ IMPLEMENTED
  - **Description:** vAA, thing@BBBBBBBB - Constant pool index with 8-bit register and 32-bit index
  - **Size:** 6 bytes (3 units)
  - **Syntax:** `AA|op BBBBlo BBBBhi`
  - **Use case:** Large constant pool references (> 65535 items)
  - **Opcode:** 0x1b
  - **Implementation:** `createDalvikBytecodeFormat31cParser` in `src/dalvikBytecodeParser/formatParsers.ts`

### Method Invocation Formats (Deprecated/Optimized)

- [ ] **Format 35mi** (invoke-*/inline)
  - **Description:** Inline method invocation (deprecated in recent Android versions)
  - **Size:** 6 bytes (3 units)
  - **Syntax:** `[A=5] op {vC, vD, vE, vF, vG}, inline@BBBB`
  - **Use case:** Optimized inline method calls (historical)

- [ ] **Format 35ms** (invoke-*/quick)
  - **Description:** Quick method invocation (deprecated)
  - **Size:** 6 bytes (3 units)
  - **Syntax:** `[A=5] op {vC, vD, vE, vF, vG}, vtaboff@BBBB`
  - **Use case:** Optimized vtable method calls (historical)

- [ ] **Format 3rmi** (invoke-*/inline/range)
  - **Description:** Range inline method invocation (deprecated)
  - **Size:** 6 bytes (3 units)
  - **Syntax:** `AA|op BBBB CCCC`
  - **Use case:** Range version of inline invocation (historical)

- [ ] **Format 3rms** (invoke-*/quick/range)
  - **Description:** Range quick method invocation (deprecated)
  - **Size:** 6 bytes (3 units)
  - **Syntax:** `AA|op BBBB CCCC`
  - **Use case:** Range version of quick invocation (historical)

### Field Access Formats (Deprecated/Optimized)

- [ ] **Format 22cs** (field access quick)
  - **Description:** Quick field access (deprecated)
  - **Size:** 4 bytes (2 units)
  - **Syntax:** `B|A|op CCCC`
  - **Use case:** Optimized field access operations (historical)

### Exception Handling and Advanced Features

- [ ] **Format 20bc** (throw-verification-error)
  - **Description:** AA|op BBBB - Verification error throwing
  - **Size:** 4 bytes (2 units)
  - **Syntax:** `AA|op BBBB`
  - **Use case:** Throw verification errors during DEX verification

### Method Handle and Call Site Formats (Android 8.0+)

- [ ] **Format 45cc** (invoke-polymorphic)
  - **Description:** Method handle invocation with proto reference
  - **Size:** 8 bytes (4 units)
  - **Syntax:** `[A=4] op {vC, vD, vE, vF, vG}, meth@BBBB, proto@HHHH`
  - **Use case:** Dynamic invocation using method handles (Java 7+ features)

- [ ] **Format 4rcc** (invoke-polymorphic/range)
  - **Description:** Range method handle invocation
  - **Size:** 8 bytes (4 units)
  - **Syntax:** `AA|op BBBB CCCC HHHH`
  - **Use case:** Range version of polymorphic invocation

## Implementation Notes

### Priority Recommendations

1. **Immediate Priority:**
   - Format 31c - Needed for large DEX files with many string/type references

2. **Medium Priority:**
   - Format 45cc and 4rcc - Required for Android 8.0+ features (method handles)
   - Format 20bc - Needed for complete verification error handling

3. **Low Priority (Deprecated):**
   - Formats 35mi, 35ms, 3rmi, 3rms, 22cs - These are deprecated optimization formats
   - Only implement if parsing legacy/optimized DEX files is required

### Implementation Guidelines

For each format parser, the following should be implemented:

1. **Type Definition:** TypeScript type for the parsed result
2. **Parser Function:** Async parser following the existing pattern
3. **Parser Registration:** Add to the union parser in `dalvikBytecodeOperationParser`
4. **Unit Tests:** Add test cases in corresponding `.test.ts` file
5. **Documentation:** Add JSDoc comments explaining the format

### Example Implementation Pattern

```typescript
type DalvikBytecodeFormat11n = {
    value: number;
    registers: number[];
};

export const dalvikBytecodeFormat11nParser: Parser<DalvikBytecodeFormat11n, Uint8Array> = promiseCompose(
    nibblesParser,
    ([value, register0]) => ({
        value: value << 28 >> 28, // Sign extend 4-bit value
        registers: [register0],
    }),
);
```

## References

- [Android Dalvik Bytecode Format](https://source.android.com/docs/core/runtime/dalvik-bytecode)
- [Dalvik Instruction Formats](https://source.android.com/docs/core/runtime/instruction-formats)
- [DEX File Format Specification](https://source.android.com/docs/core/runtime/dex-format)

## Current Implementation Status

### Implemented Formats (24/32)

- ✓ Format 10t
- ✓ Format 10x
- ✓ Format 11n
- ✓ Format 11x
- ✓ Format 12x
- ✓ Format 20t
- ✓ Format 21c
- ✓ Format 21h
- ✓ Format 21s
- ✓ Format 21t
- ✓ Format 22b
- ✓ Format 22c
- ✓ Format 22s
- ✓ Format 22t
- ✓ Format 22x
- ✓ Format 23x
- ✓ Format 30t
- ✓ Format 31c
- ✓ Format 31i
- ✓ Format 31t
- ✓ Format 32x
- ✓ Format 35c
- ✓ Format 3rc
- ✓ Format 51l

### Not Implemented Formats (8/32)
- ✗ Format 20bc
- ✗ Format 22cs
- ✗ Format 35mi
- ✗ Format 35ms
- ✗ Format 3rmi
- ✗ Format 3rms
- ✗ Format 45cc
- ✗ Format 4rcc

---

*Last updated: 2025-11-09*
