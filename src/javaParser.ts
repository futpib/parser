import { type Parser, setParserName } from './parser.js';
import { createUnionParser } from './unionParser.js';
import { createExactSequenceParser } from './exactSequenceParser.js';
import { promiseCompose } from './promiseCompose.js';
import { createTupleParser } from './tupleParser.js';
import { createDisjunctionParser } from './disjunctionParser.js';
import { createArrayParser } from './arrayParser.js';
import { createOptionalParser } from './optionalParser.js';
import { createRegExpParser } from './regexpParser.js';
import { createSeparatedNonEmptyArrayParser } from './separatedNonEmptyArrayParser.js';
import { createObjectParser } from './objectParser.js';
import {
	type JavaAnnotation,
	type JavaClassDeclaration,
	type JavaCompilationUnit,
	type JavaEnumDeclaration,
	type JavaIdentifier,
	type JavaImportDeclaration,
	type JavaInterfaceDeclaration,
	type JavaModifier,
	type JavaPackageDeclaration,
	type JavaQualifiedName,
	type JavaRecordDeclaration,
	type JavaAnnotationDeclaration,
	type JavaTypeDeclaration,
} from './java.js';

// Whitespace (spaces, tabs, newlines)
const javaWhitespaceParser: Parser<string, string> = promiseCompose(
	createRegExpParser(/\s+/),
	match => match[0],
);

const javaOptionalWhitespaceParser: Parser<string, string> = promiseCompose(
	createRegExpParser(/\s*/),
	match => match[0],
);

// Line comment: // ...
const javaLineCommentParser: Parser<string, string> = promiseCompose(
	createRegExpParser(/\/\/[^\n]*/),
	match => match[0],
);

// Block comment: /* ... */
// TODO: proper nested comment handling if needed
const javaBlockCommentParser: Parser<string, string> = promiseCompose(
	createRegExpParser(/\/\*[\s\S]*?\*\//),
	match => match[0],
);

// Comment (line or block)
const javaCommentParser: Parser<string, string> = createUnionParser([
	javaLineCommentParser,
	javaBlockCommentParser,
]);

// Whitespace or comment
const javaWhitespaceOrCommentParser: Parser<string, string> = createUnionParser([
	javaWhitespaceParser,
	javaCommentParser,
]);

// Optional whitespace/comments (skippable)
const javaSkippableParser: Parser<unknown, string> = createArrayParser(javaWhitespaceOrCommentParser);

// Identifier: valid Java identifier
const javaIdentifierParser: Parser<JavaIdentifier, string> = promiseCompose(
	createRegExpParser(/[a-zA-Z_$][a-zA-Z0-9_$]*/),
	match => match[0],
);

setParserName(javaIdentifierParser, 'javaIdentifierParser');

// Qualified name: com.example.Foo
const javaQualifiedNameParser: Parser<JavaQualifiedName, string> = promiseCompose(
	createSeparatedNonEmptyArrayParser(
		javaIdentifierParser,
		promiseCompose(
			createTupleParser([
				javaOptionalWhitespaceParser,
				createExactSequenceParser('.'),
				javaOptionalWhitespaceParser,
			]),
			() => '.',
		),
	),
	parts => ({ parts }),
);

setParserName(javaQualifiedNameParser, 'javaQualifiedNameParser');

// Annotation: @Name
// TODO: annotation arguments like @Name(value = "foo")
const javaAnnotationParser: Parser<JavaAnnotation, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('@'),
		javaQualifiedNameParser,
	]),
	([, name]) => ({ name }),
);

setParserName(javaAnnotationParser, 'javaAnnotationParser');

// Annotations with trailing whitespace
const javaAnnotationsParser: Parser<JavaAnnotation[], string> = createArrayParser(
	promiseCompose(
		createTupleParser([
			javaAnnotationParser,
			javaSkippableParser,
		]),
		([annotation]) => annotation,
	),
);

// Package declaration: package com.example;
const javaPackageDeclarationParser: Parser<JavaPackageDeclaration, string> = promiseCompose(
	createTupleParser([
		javaAnnotationsParser,
		createExactSequenceParser('package'),
		javaWhitespaceParser,
		javaQualifiedNameParser,
		javaOptionalWhitespaceParser,
		createExactSequenceParser(';'),
	]),
	([annotations, , , name]) => ({ annotations, name }),
);

setParserName(javaPackageDeclarationParser, 'javaPackageDeclarationParser');

// Import declaration: import [static] com.example.Foo[.*];
const javaImportDeclarationParser: Parser<JavaImportDeclaration, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('import'),
		javaWhitespaceParser,
		createOptionalParser(
			promiseCompose(
				createTupleParser([
					createExactSequenceParser('static'),
					javaWhitespaceParser,
				]),
				() => true as const,
			),
		),
		javaQualifiedNameParser,
		createOptionalParser(
			promiseCompose(
				createTupleParser([
					javaOptionalWhitespaceParser,
					createExactSequenceParser('.'),
					javaOptionalWhitespaceParser,
					createExactSequenceParser('*'),
				]),
				() => true as const,
			),
		),
		javaOptionalWhitespaceParser,
		createExactSequenceParser(';'),
	]),
	([, , isStatic, name, isWildcard]) => ({
		isStatic: isStatic ?? false,
		name,
		isWildcard: isWildcard ?? false,
	}),
);

setParserName(javaImportDeclarationParser, 'javaImportDeclarationParser');

// Modifier keywords
const javaModifierParser: Parser<JavaModifier, string> = createDisjunctionParser([
	promiseCompose(createExactSequenceParser('public'), () => 'public' as const),
	promiseCompose(createExactSequenceParser('protected'), () => 'protected' as const),
	promiseCompose(createExactSequenceParser('private'), () => 'private' as const),
	promiseCompose(createExactSequenceParser('static'), () => 'static' as const),
	promiseCompose(createExactSequenceParser('final'), () => 'final' as const),
	promiseCompose(createExactSequenceParser('abstract'), () => 'abstract' as const),
	promiseCompose(createExactSequenceParser('synchronized'), () => 'synchronized' as const),
	promiseCompose(createExactSequenceParser('native'), () => 'native' as const),
	promiseCompose(createExactSequenceParser('transient'), () => 'transient' as const),
	promiseCompose(createExactSequenceParser('volatile'), () => 'volatile' as const),
	promiseCompose(createExactSequenceParser('strictfp'), () => 'strictfp' as const),
	promiseCompose(createExactSequenceParser('default'), () => 'default' as const),
	promiseCompose(createExactSequenceParser('sealed'), () => 'sealed' as const),
	promiseCompose(createExactSequenceParser('non-sealed'), () => 'non-sealed' as const),
]);

setParserName(javaModifierParser, 'javaModifierParser');

// Modifiers with trailing whitespace
const javaModifiersParser: Parser<JavaModifier[], string> = createArrayParser(
	promiseCompose(
		createTupleParser([
			javaModifierParser,
			javaSkippableParser,
		]),
		([modifier]) => modifier,
	),
);

// Skip balanced braces (for skipping type bodies)
// TODO: this is a simplified version that doesn't handle strings/comments containing braces
const javaSkipBalancedBracesParser: Parser<string, string> = promiseCompose(
	createRegExpParser(/\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\}/),
	match => match[0],
);

// Class declaration
const javaClassDeclarationParser: Parser<JavaClassDeclaration, string> = promiseCompose(
	createTupleParser([
		javaAnnotationsParser,
		javaModifiersParser,
		createExactSequenceParser('class'),
		javaSkippableParser,
		javaIdentifierParser,
		javaSkippableParser,
		// TODO: type parameters
		// TODO: extends clause
		// TODO: implements clause
		// TODO: permits clause
		javaSkipBalancedBracesParser, // Skip body for now
	]),
	([annotations, modifiers, , , name]) => ({
		type: 'class' as const,
		annotations,
		modifiers,
		name,
	}),
);

setParserName(javaClassDeclarationParser, 'javaClassDeclarationParser');

// Interface declaration
const javaInterfaceDeclarationParser: Parser<JavaInterfaceDeclaration, string> = promiseCompose(
	createTupleParser([
		javaAnnotationsParser,
		javaModifiersParser,
		createExactSequenceParser('interface'),
		javaSkippableParser,
		javaIdentifierParser,
		javaSkippableParser,
		// TODO: type parameters
		// TODO: extends clause
		// TODO: permits clause
		javaSkipBalancedBracesParser, // Skip body for now
	]),
	([annotations, modifiers, , , name]) => ({
		type: 'interface' as const,
		annotations,
		modifiers,
		name,
	}),
);

setParserName(javaInterfaceDeclarationParser, 'javaInterfaceDeclarationParser');

// Enum declaration
const javaEnumDeclarationParser: Parser<JavaEnumDeclaration, string> = promiseCompose(
	createTupleParser([
		javaAnnotationsParser,
		javaModifiersParser,
		createExactSequenceParser('enum'),
		javaSkippableParser,
		javaIdentifierParser,
		javaSkippableParser,
		// TODO: implements clause
		javaSkipBalancedBracesParser, // Skip body for now
	]),
	([annotations, modifiers, , , name]) => ({
		type: 'enum' as const,
		annotations,
		modifiers,
		name,
	}),
);

setParserName(javaEnumDeclarationParser, 'javaEnumDeclarationParser');

// Record declaration
const javaRecordDeclarationParser: Parser<JavaRecordDeclaration, string> = promiseCompose(
	createTupleParser([
		javaAnnotationsParser,
		javaModifiersParser,
		createExactSequenceParser('record'),
		javaSkippableParser,
		javaIdentifierParser,
		javaSkippableParser,
		// TODO: type parameters
		// TODO: record components (required)
		// TODO: implements clause
		javaSkipBalancedBracesParser, // Skip body for now
	]),
	([annotations, modifiers, , , name]) => ({
		type: 'record' as const,
		annotations,
		modifiers,
		name,
	}),
);

setParserName(javaRecordDeclarationParser, 'javaRecordDeclarationParser');

// Annotation type declaration
const javaAnnotationDeclarationParser: Parser<JavaAnnotationDeclaration, string> = promiseCompose(
	createTupleParser([
		javaAnnotationsParser,
		javaModifiersParser,
		createExactSequenceParser('@'),
		javaOptionalWhitespaceParser,
		createExactSequenceParser('interface'),
		javaSkippableParser,
		javaIdentifierParser,
		javaSkippableParser,
		javaSkipBalancedBracesParser, // Skip body for now
	]),
	([annotations, modifiers, , , , , name]) => ({
		type: 'annotation' as const,
		annotations,
		modifiers,
		name,
	}),
);

setParserName(javaAnnotationDeclarationParser, 'javaAnnotationDeclarationParser');

// Type declaration (any kind)
const javaTypeDeclarationParser: Parser<JavaTypeDeclaration, string> = createDisjunctionParser([
	javaAnnotationDeclarationParser, // Must come before class (both start with annotations/modifiers)
	javaClassDeclarationParser,
	javaInterfaceDeclarationParser,
	javaEnumDeclarationParser,
	javaRecordDeclarationParser,
]);

setParserName(javaTypeDeclarationParser, 'javaTypeDeclarationParser');

// Compilation unit (top-level)
export const javaCompilationUnitParser: Parser<JavaCompilationUnit, string> = createObjectParser({
	_ws1: javaSkippableParser,
	package: createOptionalParser(
		promiseCompose(
			createTupleParser([
				javaPackageDeclarationParser,
				javaSkippableParser,
			]),
			([pkg]) => pkg,
		),
	),
	imports: createArrayParser(
		promiseCompose(
			createTupleParser([
				javaImportDeclarationParser,
				javaSkippableParser,
			]),
			([imp]) => imp,
		),
	),
	types: createArrayParser(
		promiseCompose(
			createTupleParser([
				javaTypeDeclarationParser,
				javaSkippableParser,
			]),
			([type]) => type,
		),
	),
	_ws2: javaSkippableParser,
});

setParserName(javaCompilationUnitParser, 'javaCompilationUnitParser');
