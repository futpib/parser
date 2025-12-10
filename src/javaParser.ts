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
	type JavaModifier,
	type JavaModifierKeyword,
	type JavaName,
	type JavaSimpleName,
	type JavaImportDeclaration,
} from './java.js';

// Temporary local types while migrating to javaparser format
type JavaIdentifier = string;
type JavaQualifiedName = { parts: JavaIdentifier[] };
type JavaAnnotation = { name: JavaName };
type JavaPackageDeclaration = { annotations: JavaAnnotation[]; name: JavaQualifiedName };
type JavaEnumDeclarationOutput = {
	type: 'EnumDeclaration';
	modifiers: JavaModifier[];
	annotations: JavaAnnotation[];
	name: JavaSimpleName;
	implementedTypes: unknown[];
	entries: unknown[];
	members: unknown[];
};
type JavaRecordDeclaration = { type: 'record'; annotations: JavaAnnotation[]; modifiers: JavaModifier[]; name: JavaIdentifier };
type JavaAnnotationTypeDeclaration = { type: 'annotation'; annotations: JavaAnnotation[]; modifiers: JavaModifier[]; name: JavaIdentifier };
// Note: JavaTypeDeclaration is now more permissive to allow the new declaration formats
type JavaTypeDeclaration = JavaEnumDeclarationOutput | JavaRecordDeclaration | JavaAnnotationTypeDeclaration | {
	type: 'ClassOrInterfaceDeclaration';
	modifiers: JavaModifier[];
	annotations: unknown[];
	name: JavaSimpleName;
	isInterface: boolean;
	typeParameters: unknown[];
	extendedTypes: unknown[];
	implementedTypes: unknown[];
	permittedTypes: unknown[];
	members: unknown[];
};
type JavaCompilationUnit = { package?: JavaPackageDeclaration; imports: JavaImportDeclaration[]; types: JavaTypeDeclaration[] };

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

// SimpleName: single identifier wrapped in SimpleName node
const javaSimpleNameParser: Parser<JavaSimpleName, string> = promiseCompose(
	javaIdentifierParser,
	identifier => ({ type: 'SimpleName' as const, identifier }),
);

setParserName(javaSimpleNameParser, 'javaSimpleNameParser');

// Name: qualified name as nested structure (e.g., com.example.Foo)
// Result is { type: 'Name', identifier: 'Foo', qualifier: { type: 'Name', identifier: 'example', qualifier: { type: 'Name', identifier: 'com' } } }
const javaNameParser: Parser<JavaName, string> = promiseCompose(
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
	parts => {
		// Build nested Name structure from left to right
		// parts = ['com', 'example', 'Foo'] -> nested with 'Foo' at top
		let result: JavaName = { type: 'Name', identifier: parts[0]! };
		for (let i = 1; i < parts.length; i++) {
			result = { type: 'Name', identifier: parts[i]!, qualifier: result };
		}
		return result;
	},
);

setParserName(javaNameParser, 'javaNameParser');

// Qualified name: com.example.Foo (legacy format with flat parts array)
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
		javaNameParser,
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
type JavaPackageDeclarationNew = { type: 'PackageDeclaration'; annotations: JavaAnnotation[]; name: JavaName };
const javaPackageDeclarationParserNew: Parser<JavaPackageDeclarationNew, string> = promiseCompose(
	createTupleParser([
		javaAnnotationsParser,
		createExactSequenceParser('package'),
		javaWhitespaceParser,
		javaNameParser,
		javaOptionalWhitespaceParser,
		createExactSequenceParser(';'),
	]),
	([annotations, , , name]) => ({ type: 'PackageDeclaration' as const, annotations, name }),
);

// Legacy package declaration parser (still using old annotation format)
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
		javaNameParser,
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
	([, , isStatic, name, isAsterisk]) => ({
		type: 'ImportDeclaration' as const,
		isStatic: isStatic ?? false,
		isAsterisk: isAsterisk ?? false,
		name,
	}),
);

setParserName(javaImportDeclarationParser, 'javaImportDeclarationParser');

// Modifier keywords
const javaModifierKeywordParser: Parser<JavaModifierKeyword, string> = createDisjunctionParser([
	promiseCompose(createExactSequenceParser('public'), () => 'PUBLIC' as const),
	promiseCompose(createExactSequenceParser('protected'), () => 'PROTECTED' as const),
	promiseCompose(createExactSequenceParser('private'), () => 'PRIVATE' as const),
	promiseCompose(createExactSequenceParser('static'), () => 'STATIC' as const),
	promiseCompose(createExactSequenceParser('final'), () => 'FINAL' as const),
	promiseCompose(createExactSequenceParser('abstract'), () => 'ABSTRACT' as const),
	promiseCompose(createExactSequenceParser('synchronized'), () => 'SYNCHRONIZED' as const),
	promiseCompose(createExactSequenceParser('native'), () => 'NATIVE' as const),
	promiseCompose(createExactSequenceParser('transient'), () => 'TRANSIENT' as const),
	promiseCompose(createExactSequenceParser('volatile'), () => 'VOLATILE' as const),
	promiseCompose(createExactSequenceParser('strictfp'), () => 'STRICTFP' as const),
	promiseCompose(createExactSequenceParser('default'), () => 'DEFAULT' as const),
	promiseCompose(createExactSequenceParser('sealed'), () => 'SEALED' as const),
	promiseCompose(createExactSequenceParser('non-sealed'), () => 'NON_SEALED' as const),
]);

const javaModifierParser: Parser<JavaModifier, string> = promiseCompose(
	javaModifierKeywordParser,
	keyword => ({ type: 'Modifier' as const, keyword }),
);

setParserName(javaModifierParser, 'javaModifierParser');

// Type parsers
type JavaPrimitiveTypeOutput = {
	type: 'PrimitiveType';
	type_: 'BOOLEAN' | 'BYTE' | 'CHAR' | 'DOUBLE' | 'FLOAT' | 'INT' | 'LONG' | 'SHORT';
	annotations: unknown[];
};

const javaPrimitiveTypeParser: Parser<JavaPrimitiveTypeOutput, string> = createDisjunctionParser([
	promiseCompose(createExactSequenceParser('boolean'), () => ({ type: 'PrimitiveType' as const, type_: 'BOOLEAN' as const, annotations: [] })),
	promiseCompose(createExactSequenceParser('byte'), () => ({ type: 'PrimitiveType' as const, type_: 'BYTE' as const, annotations: [] })),
	promiseCompose(createExactSequenceParser('char'), () => ({ type: 'PrimitiveType' as const, type_: 'CHAR' as const, annotations: [] })),
	promiseCompose(createExactSequenceParser('double'), () => ({ type: 'PrimitiveType' as const, type_: 'DOUBLE' as const, annotations: [] })),
	promiseCompose(createExactSequenceParser('float'), () => ({ type: 'PrimitiveType' as const, type_: 'FLOAT' as const, annotations: [] })),
	promiseCompose(createExactSequenceParser('int'), () => ({ type: 'PrimitiveType' as const, type_: 'INT' as const, annotations: [] })),
	promiseCompose(createExactSequenceParser('long'), () => ({ type: 'PrimitiveType' as const, type_: 'LONG' as const, annotations: [] })),
	promiseCompose(createExactSequenceParser('short'), () => ({ type: 'PrimitiveType' as const, type_: 'SHORT' as const, annotations: [] })),
]);

setParserName(javaPrimitiveTypeParser, 'javaPrimitiveTypeParser');

type JavaVoidTypeOutput = {
	type: 'VoidType';
	annotations: unknown[];
};

const javaVoidTypeParser: Parser<JavaVoidTypeOutput, string> = promiseCompose(
	createExactSequenceParser('void'),
	() => ({ type: 'VoidType' as const, annotations: [] }),
);

setParserName(javaVoidTypeParser, 'javaVoidTypeParser');

type JavaClassOrInterfaceTypeOutput = {
	type: 'ClassOrInterfaceType';
	name: JavaSimpleName;
	scope?: JavaClassOrInterfaceTypeOutput;
	typeArguments?: unknown[];
	annotations: unknown[];
};

// Forward declaration for recursive type parsing
let javaTypeParser: Parser<unknown, string>;

// Type arguments: <T, U, V>
const javaTypeArgumentsParser: Parser<unknown[], string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('<'),
		javaSkippableParser,
		createSeparatedNonEmptyArrayParser(
			promiseCompose(
				createTupleParser([
					// Lazy evaluation for recursive reference
					(ctx) => javaTypeParser(ctx),
					javaSkippableParser,
				]),
				([type]) => type,
			),
			promiseCompose(
				createTupleParser([
					createExactSequenceParser(','),
					javaSkippableParser,
				]),
				() => ',',
			),
		),
		javaSkippableParser,
		createExactSequenceParser('>'),
	]),
	([, , types]) => types,
);

setParserName(javaTypeArgumentsParser, 'javaTypeArgumentsParser');

// ClassOrInterfaceType: Foo, com.example.Foo, List<T>, Map<K, V>
const javaClassOrInterfaceTypeParser: Parser<JavaClassOrInterfaceTypeOutput, string> = promiseCompose(
	createTupleParser([
		javaSimpleNameParser,
		javaSkippableParser,
		createOptionalParser(javaTypeArgumentsParser),
		// TODO: handle scope (Outer.Inner)
	]),
	([name, , typeArguments]) => ({
		type: 'ClassOrInterfaceType' as const,
		name,
		...(typeArguments ? { typeArguments } : {}),
		annotations: [],
	}),
);

setParserName(javaClassOrInterfaceTypeParser, 'javaClassOrInterfaceTypeParser');

// Reference type (class/interface or array)
type JavaTypeOutput = JavaPrimitiveTypeOutput | JavaVoidTypeOutput | JavaClassOrInterfaceTypeOutput | {
	type: 'ArrayType';
	componentType: JavaTypeOutput;
	origin: 'TYPE';
	annotations: unknown[];
};

// Base type (without array brackets)
const javaBaseTypeParser: Parser<JavaPrimitiveTypeOutput | JavaVoidTypeOutput | JavaClassOrInterfaceTypeOutput, string> = createDisjunctionParser([
	javaPrimitiveTypeParser,
	javaVoidTypeParser,
	javaClassOrInterfaceTypeParser,
]);

// Array brackets
const javaArrayBracketsParser: Parser<unknown[], string> = createArrayParser(
	promiseCompose(
		createTupleParser([
			javaSkippableParser,
			createExactSequenceParser('['),
			javaSkippableParser,
			createExactSequenceParser(']'),
		]),
		() => [],
	),
);

// Full type with optional array brackets
javaTypeParser = promiseCompose(
	createTupleParser([
		javaBaseTypeParser,
		javaArrayBracketsParser,
	]),
	([baseType, brackets]) => {
		let result: JavaTypeOutput = baseType;
		for (const _ of brackets) {
			result = {
				type: 'ArrayType' as const,
				componentType: result,
				origin: 'TYPE' as const,
				annotations: [],
			};
		}
		return result;
	},
);

setParserName(javaTypeParser, 'javaTypeParser');

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

// Skip balanced braces (for skipping method/block bodies)
const javaSkipBalancedBracesParser: Parser<string, string> = promiseCompose(
	createRegExpParser(/\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\}/),
	match => match[0],
);

// Parameter: @Annotation final Type name
type JavaParameterOutput = {
	type: 'Parameter';
	modifiers: JavaModifier[];
	annotations: unknown[];
	type_: unknown;
	isVarArgs: boolean;
	varArgsAnnotations: unknown[];
	name: JavaSimpleName;
};

const javaParameterParser: Parser<JavaParameterOutput, string> = promiseCompose(
	createTupleParser([
		javaAnnotationsParser,
		javaModifiersParser,
		javaTypeParser,
		javaSkippableParser,
		createOptionalParser(createExactSequenceParser('...')), // varargs
		javaSkippableParser,
		javaSimpleNameParser,
	]),
	([annotations, modifiers, type_, , varArgs, , name]) => ({
		type: 'Parameter' as const,
		modifiers,
		annotations,
		type_,
		isVarArgs: varArgs !== undefined,
		varArgsAnnotations: [],
		name,
	}),
);

setParserName(javaParameterParser, 'javaParameterParser');

// Parameter list: (param1, param2, ...)
const javaParameterListParser: Parser<JavaParameterOutput[], string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('('),
		javaSkippableParser,
		createOptionalParser(
			createSeparatedNonEmptyArrayParser(
				promiseCompose(
					createTupleParser([
						javaParameterParser,
						javaSkippableParser,
					]),
					([param]) => param,
				),
				promiseCompose(
					createTupleParser([
						createExactSequenceParser(','),
						javaSkippableParser,
					]),
					() => ',',
				),
			),
		),
		javaSkippableParser,
		createExactSequenceParser(')'),
	]),
	([, , params]) => params ?? [],
);

setParserName(javaParameterListParser, 'javaParameterListParser');

// Throws clause: throws Exception1, Exception2
const javaThrowsClauseParser: Parser<JavaClassOrInterfaceTypeOutput[], string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('throws'),
		javaWhitespaceParser,
		createSeparatedNonEmptyArrayParser(
			promiseCompose(
				createTupleParser([
					javaClassOrInterfaceTypeParser,
					javaSkippableParser,
				]),
				([type]) => type,
			),
			promiseCompose(
				createTupleParser([
					createExactSequenceParser(','),
					javaSkippableParser,
				]),
				() => ',',
			),
		),
	]),
	([, , types]) => types,
);

setParserName(javaThrowsClauseParser, 'javaThrowsClauseParser');

// Block statement: { ... }
type JavaBlockStmtOutput = {
	type: 'BlockStmt';
	statements: unknown[];
};

const javaBlockStmtParser: Parser<JavaBlockStmtOutput, string> = promiseCompose(
	javaSkipBalancedBracesParser,
	() => ({
		type: 'BlockStmt' as const,
		statements: [], // TODO: parse actual statements
	}),
);

setParserName(javaBlockStmtParser, 'javaBlockStmtParser');

// Method declaration
type JavaMethodDeclarationOutput = {
	type: 'MethodDeclaration';
	modifiers: JavaModifier[];
	annotations: unknown[];
	typeParameters: unknown[];
	type_: unknown;
	name: JavaSimpleName;
	parameters: JavaParameterOutput[];
	thrownExceptions: JavaClassOrInterfaceTypeOutput[];
	body?: JavaBlockStmtOutput;
};

const javaMethodDeclarationParser: Parser<JavaMethodDeclarationOutput, string> = promiseCompose(
	createTupleParser([
		javaAnnotationsParser,
		javaModifiersParser,
		// TODO: type parameters <T, U>
		javaTypeParser,
		javaSkippableParser,
		javaSimpleNameParser,
		javaSkippableParser,
		javaParameterListParser,
		javaSkippableParser,
		createOptionalParser(
			promiseCompose(
				createTupleParser([
					javaThrowsClauseParser,
					javaSkippableParser,
				]),
				([throws]) => throws,
			),
		),
		createUnionParser([
			javaBlockStmtParser,
			promiseCompose(createExactSequenceParser(';'), () => undefined),
		]),
	]),
	([annotations, modifiers, type_, , name, , parameters, , thrownExceptions, body]) => ({
		type: 'MethodDeclaration' as const,
		modifiers,
		annotations,
		typeParameters: [],
		type_,
		name,
		parameters,
		thrownExceptions: thrownExceptions ?? [],
		...(body ? { body } : {}),
	}),
);

setParserName(javaMethodDeclarationParser, 'javaMethodDeclarationParser');

// Field declaration: modifiers type name [= init] [, name2 [= init2]] ;
type JavaVariableDeclaratorOutput = {
	type: 'VariableDeclarator';
	name: JavaSimpleName;
	type_: unknown;
	initializer?: unknown;
};

type JavaFieldDeclarationOutput = {
	type: 'FieldDeclaration';
	modifiers: JavaModifier[];
	annotations: unknown[];
	variables: JavaVariableDeclaratorOutput[];
};

// Skip balanced expression (for field initializers)
const javaSkipInitializerParser: Parser<unknown, string> = promiseCompose(
	createRegExpParser(/[^,;{}]+/),
	() => ({ type: 'UnparsedExpr' }),
);

const javaFieldDeclarationParser: Parser<JavaFieldDeclarationOutput, string> = promiseCompose(
	createTupleParser([
		javaAnnotationsParser,
		javaModifiersParser,
		javaTypeParser,
		javaSkippableParser,
		createSeparatedNonEmptyArrayParser(
			promiseCompose(
				createTupleParser([
					javaSimpleNameParser,
					javaSkippableParser,
					createOptionalParser(
						promiseCompose(
							createTupleParser([
								createExactSequenceParser('='),
								javaSkippableParser,
								javaSkipInitializerParser,
							]),
							([, , init]) => init,
						),
					),
				]),
				([name, , initializer]) => ({ name, initializer }),
			),
			promiseCompose(
				createTupleParser([
					createExactSequenceParser(','),
					javaSkippableParser,
				]),
				() => ',',
			),
		),
		javaSkippableParser,
		createExactSequenceParser(';'),
	]),
	([annotations, modifiers, type_, , variables]) => ({
		type: 'FieldDeclaration' as const,
		modifiers,
		annotations,
		variables: variables.map(v => ({
			type: 'VariableDeclarator' as const,
			name: v.name,
			type_,
			...(v.initializer ? { initializer: v.initializer } : {}),
		})),
	}),
);

setParserName(javaFieldDeclarationParser, 'javaFieldDeclarationParser');

// Constructor declaration
type JavaConstructorDeclarationOutput = {
	type: 'ConstructorDeclaration';
	modifiers: JavaModifier[];
	annotations: unknown[];
	typeParameters: unknown[];
	name: JavaSimpleName;
	parameters: JavaParameterOutput[];
	thrownExceptions: JavaClassOrInterfaceTypeOutput[];
	body: JavaBlockStmtOutput;
};

const javaConstructorDeclarationParser: Parser<JavaConstructorDeclarationOutput, string> = promiseCompose(
	createTupleParser([
		javaAnnotationsParser,
		javaModifiersParser,
		// Constructor name (same as class name)
		javaSimpleNameParser,
		javaSkippableParser,
		javaParameterListParser,
		javaSkippableParser,
		createOptionalParser(
			promiseCompose(
				createTupleParser([
					javaThrowsClauseParser,
					javaSkippableParser,
				]),
				([throws]) => throws,
			),
		),
		javaBlockStmtParser,
	]),
	([annotations, modifiers, name, , parameters, , thrownExceptions, body]) => ({
		type: 'ConstructorDeclaration' as const,
		modifiers,
		annotations,
		typeParameters: [],
		name,
		parameters,
		thrownExceptions: thrownExceptions ?? [],
		body,
	}),
);

setParserName(javaConstructorDeclarationParser, 'javaConstructorDeclarationParser');

// Body declaration (member)
type JavaBodyDeclarationOutput = JavaMethodDeclarationOutput | JavaFieldDeclarationOutput | JavaConstructorDeclarationOutput;

// We need to try method first because field declaration also starts with modifiers + type + name
// But constructors don't have a return type, so we try constructor after field fails
const javaBodyDeclarationParser: Parser<JavaBodyDeclarationOutput, string> = createDisjunctionParser([
	javaMethodDeclarationParser,
	javaConstructorDeclarationParser,
	javaFieldDeclarationParser,
]);

setParserName(javaBodyDeclarationParser, 'javaBodyDeclarationParser');

// Class body: { member1 member2 ... }
const javaClassBodyParser: Parser<JavaBodyDeclarationOutput[], string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('{'),
		javaSkippableParser,
		createArrayParser(
			promiseCompose(
				createTupleParser([
					javaBodyDeclarationParser,
					javaSkippableParser,
				]),
				([member]) => member,
			),
		),
		createExactSequenceParser('}'),
	]),
	([, , members]) => members,
);

// Class or Interface declaration (combined as javaparser does)
type JavaClassOrInterfaceDeclarationOutput = {
	type: 'ClassOrInterfaceDeclaration';
	modifiers: JavaModifier[];
	annotations: JavaAnnotation[];
	name: JavaSimpleName;
	isInterface: boolean;
	typeParameters: unknown[];
	extendedTypes: unknown[];
	implementedTypes: unknown[];
	permittedTypes: unknown[];
	members: unknown[];
};

const javaClassDeclarationParser: Parser<JavaClassOrInterfaceDeclarationOutput, string> = promiseCompose(
	createTupleParser([
		javaSkippableParser, // Skip leading comments (e.g., javadoc)
		javaAnnotationsParser,
		javaModifiersParser,
		createExactSequenceParser('class'),
		javaSkippableParser,
		javaSimpleNameParser,
		javaSkippableParser,
		// TODO: type parameters
		// TODO: extends clause
		// TODO: implements clause
		// TODO: permits clause
		javaClassBodyParser,
	]),
	([, annotations, modifiers, , , name, , members]) => ({
		type: 'ClassOrInterfaceDeclaration' as const,
		modifiers,
		annotations,
		name,
		isInterface: false,
		typeParameters: [],
		extendedTypes: [],
		implementedTypes: [],
		permittedTypes: [],
		members,
	}),
);

setParserName(javaClassDeclarationParser, 'javaClassDeclarationParser');

const javaInterfaceDeclarationParser: Parser<JavaClassOrInterfaceDeclarationOutput, string> = promiseCompose(
	createTupleParser([
		javaAnnotationsParser,
		javaModifiersParser,
		createExactSequenceParser('interface'),
		javaSkippableParser,
		javaSimpleNameParser,
		javaSkippableParser,
		// TODO: type parameters
		// TODO: extends clause
		// TODO: permits clause
		javaClassBodyParser,
	]),
	([annotations, modifiers, , , name, , members]) => ({
		type: 'ClassOrInterfaceDeclaration' as const,
		modifiers,
		annotations,
		name,
		isInterface: true,
		typeParameters: [],
		extendedTypes: [],
		implementedTypes: [],
		permittedTypes: [],
		members,
	}),
);

setParserName(javaInterfaceDeclarationParser, 'javaInterfaceDeclarationParser');

// Enum declaration
const javaEnumDeclarationParser: Parser<JavaEnumDeclarationOutput, string> = promiseCompose(
	createTupleParser([
		javaSkippableParser, // Skip leading comments
		javaAnnotationsParser,
		javaModifiersParser,
		createExactSequenceParser('enum'),
		javaSkippableParser,
		javaSimpleNameParser,
		javaSkippableParser,
		// TODO: implements clause
		// TODO: parse enum entries and members
		javaSkipBalancedBracesParser, // Skip body for now
	]),
	([, annotations, modifiers, , , name]) => ({
		type: 'EnumDeclaration' as const,
		modifiers,
		annotations,
		name,
		implementedTypes: [],
		entries: [],
		members: [],
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
const javaAnnotationDeclarationParser: Parser<JavaAnnotationTypeDeclaration, string> = promiseCompose(
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
export const javaCompilationUnitParser = createObjectParser({
	type: promiseCompose(createExactSequenceParser(''), () => 'CompilationUnit' as const),
	_ws1: javaSkippableParser,
	packageDeclaration: createOptionalParser(
		promiseCompose(
			createTupleParser([
				javaPackageDeclarationParserNew,
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
