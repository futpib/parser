# Copilot Instructions for @futpib/parser

## Project Overview

This is a TypeScript library for parsing binary data formats, including:
- Android packages (APK files)
- Dalvik Executable (DEX) files
- Java KeyStore files
- ZIP archives
- BSON documents
- Smali bytecode

The library provides a functional, composable parser combinator framework built on top of async iterables for streaming binary data parsing.

## Technology Stack

- **Language**: TypeScript (ES2022 target, NodeNext modules)
- **Build Tool**: TypeScript compiler (`tsc`)
- **Package Manager**: Yarn 4.9.4 (with Plug'n'Play)
- **Test Framework**: AVA with `@ava/typescript`
- **Test Coverage**: c8
- **Linter**: xo with TypeScript support
- **Key Dependencies**: fp-ts, monocle-ts, newtype-ts (functional programming libraries)

## Project Structure

```
src/
├── parser.ts                 # Core parser types and runner
├── parserContext.ts          # Parser execution context
├── unparser.ts              # Core unparser (serializer) types
├── *Parser.ts               # Individual parser implementations
├── *Unparser.ts             # Individual unparser implementations
├── *.test.ts                # Test files (AVA)
build/                       # Compiled output (generated)
```

## Build and Test Commands

```bash
# Install dependencies
yarn install

# Build the project
yarn build

# Run tests with coverage
yarn test

# Watch mode for development
yarn dev

# Lint code
yarn xo
```

## Coding Conventions

### Style Guidelines

- **Indentation**: Use tabs for indentation (configured in `.editorconfig`)
- **Line Endings**: LF (Unix-style)
- **Imports**: Always use `.js` extension in imports (ES module requirement)
- **Strict Mode**: TypeScript strict mode is enabled
- **Module System**: ES modules (type: "module" in package.json)

### TypeScript Patterns

- Use functional programming patterns from `fp-ts` library
- Leverage TypeScript's type system extensively
- Prefer type inference where possible
- Use generics for parser combinators
- Follow existing naming patterns:
  - Parser types: `Parser<Output, Sequence, Element>`
  - Parser creators: `create*Parser()`
  - Parser runners: `runParser()`

### Parser Architecture

The library uses a parser combinator approach:
- Parsers are functions that take a `ParserContext` and return parsed output
- Parsers work with async iterables for streaming
- Use `InputReader` for lookahead and backtracking
- Compose parsers using combinator functions like:
  - `createArrayParser()` - Parse arrays
  - `createTupleParser()` - Parse tuples
  - `createUnionParser()` - Try multiple parsers
  - `createOptionalParser()` - Parse optional values
  - `createExactSequenceParser()` - Parse exact byte sequences

## Testing Approach

- Tests are co-located with source files (`.test.ts` suffix)
- Use AVA test framework with TypeScript support
- Tests run against the compiled `build/` directory
- Property-based testing with `fast-check` for parsers
- Snapshot testing for complex data structures
- Some tests use external binary files (referenced by CID hashes)
- Test files may have corresponding `.md` and `.snap` files

### Running Tests

```bash
# Run all tests
yarn test

# Tests are verbose by default (configured in package.json)
# Coverage is collected automatically with c8
```

## Key Architectural Decisions

1. **Async Iterables**: All parsers work with async iterables to support streaming large files
2. **Functional Style**: Heavy use of fp-ts for functional composition
3. **Type Safety**: Extensive use of TypeScript generics to ensure type safety
4. **Parser Combinators**: Build complex parsers from simple building blocks
5. **Unparsers**: Support bidirectional serialization/deserialization

## Dependencies to Know

- `fp-ts`: Functional programming library for TypeScript
- `monocle-ts`: Optics library for working with immutable data
- `newtype-ts`: Newtype pattern for type-safe wrappers
- `p-mutex`: Promise-based mutex for concurrency control
- `mutf-8`: Modified UTF-8 encoding (peer dependency, optional)

## Common Tasks

### Adding a New Parser

1. Create `src/myParser.ts` with parser implementation
2. Export `createMyParser()` function
3. Add corresponding test file `src/myParser.test.ts`
4. Export from `src/index.ts` if part of public API
5. Run tests and build to verify

### Debugging Tests

- Tests output verbose information by default
- Check `.snap` files for expected outputs
- Some tests may be skipped (e.g., tests requiring large binary files)
- Pre-existing test failures are acceptable if unrelated to your changes

## Notes

- The project uses Yarn Plug'n'Play (no `node_modules` directory)
- License: GPL-3.0-only
- Some tests download or reference external binary files via IPFS CID hashes
- Coverage reports are sent to Coveralls in CI
