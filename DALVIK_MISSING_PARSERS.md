# Missing Dalvik Bytecode Format Parsers

This document lists the Dalvik bytecode instruction format parsers that are not yet implemented in this repository.

Reference: [Android Dalvik Bytecode Specification](https://source.android.com/docs/core/runtime/dalvik-bytecode)

## Implementation Status

**Total formats:** 32  
**Implemented:** 24  
**Missing:** 8

## Missing Format Parsers

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

## Priority Recommendations

1. **Medium Priority:**
   - Format 45cc and 4rcc - Required for Android 8.0+ features (method handles)
   - Format 20bc - Needed for complete verification error handling

2. **Low Priority (Deprecated):**
   - Formats 35mi, 35ms, 3rmi, 3rms, 22cs - These are deprecated optimization formats
   - Only implement if parsing legacy/optimized DEX files is required

## Implementation Guidelines

For each format parser, the following should be implemented:

1. **Type Definition:** TypeScript type for the parsed result
2. **Parser Function:** Async parser following the existing pattern
3. **Parser Registration:** Add to the union parser in `dalvikBytecodeOperationParser`
4. **Unit Tests:** Add test cases in corresponding `.test.ts` file
5. **Documentation:** Add JSDoc comments explaining the format

### Example Implementation Pattern

See existing parsers in `src/dalvikBytecodeParser/formatParsers.ts` for reference.

## References

- [Android Dalvik Bytecode Format](https://source.android.com/docs/core/runtime/dalvik-bytecode)
- [Dalvik Instruction Formats](https://source.android.com/docs/core/runtime/instruction-formats)
- [DEX File Format Specification](https://source.android.com/docs/core/runtime/dex-format)

---

*Last updated: 2025-11-09*
