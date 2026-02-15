# @futpib/parser

> A functional TypeScript library for parsing and serializing binary data formats using composable parser combinators

[![Coverage Status](https://coveralls.io/repos/github/futpib/parser/badge.svg?branch=master)](https://coveralls.io/github/futpib/parser?branch=master)

## Overview

`@futpib/parser` is a powerful parser combinator library built on async iterables for streaming binary data parsing. It provides a functional, type-safe approach to parsing complex binary formats including APK files, DEX files, ZIP archives, BSON documents, Java KeyStore files, and more.

### Key Features

- 🔄 **Bidirectional**: Both parsing (deserialization) and unparsing (serialization) support
- 🌊 **Streaming**: Built on async iterables for memory-efficient parsing of large files
- 🧩 **Composable**: Build complex parsers from simple, reusable building blocks
- 🔒 **Type-safe**: Full TypeScript support with extensive generics
- 🎯 **Functional**: Uses fp-ts for functional programming patterns
- ⚡ **Fast**: Optimized for performance with lookahead and backtracking support

### Supported Formats

- **Android Packages (APK)** - Parse and unparse Android application packages
- **Dalvik Executable (DEX)** - Parse Dalvik bytecode and executable files
- **ZIP Archives** - Full ZIP file parsing and creation
- **BSON** - Binary JSON documents
- **Java KeyStore** - Java keystore files
- **Smali** - Smali bytecode assembly language
- **JSON** - Standard JSON parsing
- **Regular Expressions** - Pattern-based parsing
- **Bash Scripts** - Parse bash scripts
- **Java Source** - Parse Java source code
- **JavaScript** - Parse JavaScript source code
- **Zig** - Parse Zig source code
- **S-expressions** - Symbolic expressions

## Install

```bash
# Using yarn
yarn add @futpib/parser

# Using npm
npm install @futpib/parser
```

**Optional peer dependency**: For parsing modified UTF-8 (used in DEX files):
```bash
yarn add mutf-8
```

## Quick Start

### Basic Parsing Example

```typescript
import {
  createTupleParser,
  createExactSequenceParser,
  createFixedLengthSequenceParser,
  runParser,
  uint8ArrayParserInputCompanion,
} from '@futpib/parser';

// Parse a simple binary format: magic bytes + 4-byte length
const myFormatParser = createTupleParser([
  createExactSequenceParser(new Uint8Array([0x4D, 0x59, 0x46, 0x4D])), // "MYFM" magic
  createFixedLengthSequenceParser(4), // 4-byte length field
]);

const data = new Uint8Array([0x4D, 0x59, 0x46, 0x4D, 0x00, 0x00, 0x00, 0x10]);
const result = await runParser(
  myFormatParser,
  data,
  uint8ArrayParserInputCompanion
);

console.log(result); // [Uint8Array([0x4D, 0x59, 0x46, 0x4D]), Uint8Array([0x00, 0x00, 0x00, 0x10])]
```

### String Parsing Example

```typescript
import {
  createObjectParser,
  createExactSequenceParser,
  createRegExpParser,
  runParser,
  stringParserInputCompanion,
} from '@futpib/parser';

// Parse a simple key-value format
// Note: RegExpParser returns a RegExpExecArray (match array), not just the string
// Note: Underscore-prefixed keys like _separator are omitted from output
const keyValueParser = createObjectParser({
  key: createRegExpParser(/[a-z]+/),
  _separator: createExactSequenceParser('='),
  value: createRegExpParser(/[0-9]+/),
});

const result = await runParser(
  keyValueParser,
  'name=123',
  stringParserInputCompanion
);

console.log(result.key[0]);   // 'name' - the [0] element contains the matched string
console.log(result.value[0]); // '123'
```

### Array Parsing Example

```typescript
import {
  createTerminatedArrayParser,
  createUnionParser,
  createExactElementParser,
  runParser,
  uint8ArrayParserInputCompanion,
} from '@futpib/parser';

// Parse an array of specific bytes (1 or 2) until we hit a zero byte
const byteArrayParser = createTerminatedArrayParser(
  createUnionParser([
    createExactElementParser(1),
    createExactElementParser(2),
  ]),
  createExactElementParser(0)
);

const data = new Uint8Array([1, 2, 1, 2, 1, 0]);
const result = await runParser(
  byteArrayParser,
  data,
  uint8ArrayParserInputCompanion
);

console.log(result); // [[1, 2, 1, 2, 1], 0]
```

### Real-world Example: Parsing ZIP Files

```typescript
import { runParser, uint8ArrayParserInputCompanion } from '@futpib/parser';
import { zipParser } from '@futpib/parser/build/zipParser.js';
import { readFile } from 'fs/promises';

const zipData = await readFile('archive.zip');
const zip = await runParser(
  zipParser,
  zipData,
  uint8ArrayParserInputCompanion
);

for (const entry of zip.entries) {
  console.log(`File: ${entry.path}`);
  console.log(`Size: ${entry.uncompressedSize} bytes`);
  console.log(`Compressed: ${entry.compressedSize} bytes`);
}
```

### Unparsing (Serialization) Example

```typescript
import {
  createArrayUnparser,
  runUnparser,
  uint8ArrayUnparserOutputCompanion,
} from '@futpib/parser';

// Create an unparser for arrays of bytes
const byteArrayUnparser = createArrayUnparser(async function* (byte) {
  yield byte;
});

const bytes = [0x48, 0x65, 0x6C, 0x6C, 0x6F]; // "Hello"
const result = await runUnparser(
  bytes,
  byteArrayUnparser,
  uint8ArrayUnparserOutputCompanion
);

console.log(result); // Uint8Array([0x48, 0x65, 0x6C, 0x6C, 0x6F])
```

## Core Concepts

### Parser

A `Parser<Output, Sequence, Element>` is a function that takes a `ParserContext` and returns parsed output:

```typescript
type Parser<Output, Sequence, Element> = (
  parserContext: ParserContext<Sequence, Element>
) => Output | Promise<Output>;
```

### Parser Combinators

Build complex parsers from simple ones:

- **`createTupleParser(parsers)`** - Parse a tuple of values in sequence
- **`createObjectParser(parsers)`** - Parse an object with named fields
- **`createArrayParser(parser)`** - Parse an array of values
- **`createUnionParser(parsers)`** - Try multiple parsers (first success wins)
- **`createOptionalParser(parser)`** - Parse optional values
- **`createExactSequenceParser(sequence)`** - Match exact byte/string sequences
- **`createFixedLengthSequenceParser(length)`** - Parse fixed-length sequences
- **`createTerminatedArrayParser(elementParser, terminatorParser)`** - Parse until terminator
- **`createSeparatedArrayParser(elementParser, separatorParser)`** - Parse separated values
- **`createRegExpParser(regexp)`** - Parse using regular expressions (strings only)
- **`createElementParser()`** - Parse a single element
- **`createLookaheadParser(parser)`** - Parse without consuming input
- **`createSkipParser(length)`** - Skip a fixed number of elements

### Unparser (Serializer)

An `Unparser<Input, Sequence, Element>` converts data back into binary/string format:

```typescript
type Unparser<Input, Sequence, Element> = (
  input: Input,
  unparserContext: UnparserContext<Sequence, Element>
) => AsyncIterable<Sequence | Element>;
```

### Input/Output Companions

Companions provide type-specific operations:

- **`uint8ArrayParserInputCompanion`** - For binary data (Uint8Array)
- **`stringParserInputCompanion`** - For text data (string)
- **`uint8ArrayUnparserOutputCompanion`** - For binary serialization
- **`stringUnparserOutputCompanion`** - For text serialization

## API Reference

### Running Parsers

```typescript
// Parse input completely
runParser<Output, Sequence, Element>(
  parser: Parser<Output, Sequence, Element>,
  input: Sequence,
  inputCompanion: ParserInputCompanion<Sequence, Element>,
  options?: RunParserOptions
): Promise<Output>

// Parse with remaining input
runParserWithRemainingInput<Output, Sequence, Element>(
  parser: Parser<Output, Sequence, Element>,
  input: Sequence,
  inputCompanion: ParserInputCompanion<Sequence, Element>,
  options?: RunParserOptions
): Promise<{ output: Output; remainingInput: Sequence }>
```

### Running Unparsers

```typescript
runUnparser<Input, Sequence, Element>(
  input: Input,
  unparser: Unparser<Input, Sequence, Element>,
  outputCompanion: UnparserOutputCompanion<Sequence, Element>
): Promise<Sequence>
```

### Error Handling

Parsers throw `ParserError` when parsing fails:

```typescript
try {
  const result = await runParser(parser, input, inputCompanion);
} catch (error) {
  if (isParserError(error)) {
    console.error('Parse failed:', error.message);
  }
}
```

Options for error handling:
- `errorJoinMode: 'first'` - Return first error (default, faster)
- `errorJoinMode: 'all'` - Collect all errors (more detailed, slower)

## Advanced Usage

### Custom Parsers

Create custom parsers by implementing the `Parser` type:

```typescript
import { setParserName, type Parser } from '@futpib/parser';

const customParser: Parser<number, Uint8Array> = async (parserContext) => {
  const byte1 = await parserContext.read(0); // Read and consume 1 byte
  const byte2 = await parserContext.read(0); // Read and consume another byte
  
  // Combine into a 16-bit big-endian integer
  return (byte1 << 8) | byte2;
};

setParserName(customParser, 'uint16BEParser');
```

### Lookahead and Backtracking

```typescript
import { createLookaheadParser, createUnionParser } from '@futpib/parser';

// Try to peek ahead without consuming input
const peekParser = createLookaheadParser(someParser);

// Union parser automatically backtracks on failure
const eitherParser = createUnionParser([
  parserA, // Try this first
  parserB, // If parserA fails, try this
  parserC, // If parserB fails, try this
]);
```

### Conditional Parsing

```typescript
import { createObjectParser, createParserAccessorParser } from '@futpib/parser';

const conditionalParser = createObjectParser({
  type: createElementParser(),
  value: createParserAccessorParser((ctx) => 
    // Choose parser based on previously parsed 'type'
    ctx.type === 1 ? int32Parser : stringParser
  ),
});
```

## Development

```bash
# Install dependencies
yarn install

# Build the project
yarn build

# Run tests
yarn test

# Run tests in watch mode
yarn dev

# Lint code
yarn xo

# Type check
yarn tsd
```

## Architecture

The library uses:
- **Async Iterables** - For streaming large files without loading everything into memory
- **Parser Combinators** - Composable building blocks for complex parsers
- **fp-ts** - Functional programming utilities
- **TypeScript Generics** - Type-safe parser composition

## Contributing

Contributions are welcome! This project uses:
- TypeScript with strict mode
- AVA for testing
- xo for linting
- Yarn 4 with Plug'n'Play

## License

GPL-3.0-only

## Links

- [GitHub Repository](https://github.com/futpib/parser)
- [npm Package](https://www.npmjs.com/package/@futpib/parser)
- [Issue Tracker](https://github.com/futpib/parser/issues)
