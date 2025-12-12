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
type JavaAnnotation = { type: 'MarkerAnnotationExpr'; name: JavaName };
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
const javaSimpleNameParser: Parser<JavaSimpleName, string> = createObjectParser({
	type: 'SimpleName' as const,
	identifier: javaIdentifierParser,
});

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
// TODO: annotation arguments like @Name(value = "foo") -> SingleMemberAnnotationExpr or NormalAnnotationExpr
type JavaMarkerAnnotationExprOutput = {
	type: 'MarkerAnnotationExpr';
	name: JavaName;
};

const javaAnnotationParser: Parser<JavaMarkerAnnotationExprOutput, string> = createObjectParser({
	_at: createExactSequenceParser('@'),
	type: 'MarkerAnnotationExpr' as const,
	name: javaNameParser,
});

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
const javaPackageDeclarationParserNew: Parser<JavaPackageDeclarationNew, string> = createObjectParser({
	annotations: javaAnnotationsParser,
	_package: createExactSequenceParser('package'),
	_ws1: javaWhitespaceParser,
	type: 'PackageDeclaration' as const,
	name: javaNameParser,
	_ws2: javaOptionalWhitespaceParser,
	_semi: createExactSequenceParser(';'),
});

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

const javaModifierParser: Parser<JavaModifier, string> = createObjectParser({
	type: 'Modifier' as const,
	keyword: javaModifierKeywordParser,
});

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

const javaVoidTypeParser: Parser<JavaVoidTypeOutput, string> = createObjectParser({
	_void: createExactSequenceParser('void'),
	type: 'VoidType' as const,
	annotations: [] as unknown[],
});

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

// Wildcard type: ?, ? extends Foo, ? super Foo
type JavaWildcardTypeOutput = {
	type: 'WildcardType';
	annotations: unknown[];
	extendedType?: unknown;
	superType?: unknown;
};

const javaWildcardTypeParser: Parser<JavaWildcardTypeOutput, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('?'),
		javaSkippableParser,
		createOptionalParser(
			createUnionParser([
				promiseCompose(
					createTupleParser([
						createExactSequenceParser('extends'),
						javaSkippableParser,
						(ctx) => javaTypeParser(ctx),
					]),
					([, , type]) => ({ extendedType: type }),
				),
				promiseCompose(
					createTupleParser([
						createExactSequenceParser('super'),
						javaSkippableParser,
						(ctx) => javaTypeParser(ctx),
					]),
					([, , type]) => ({ superType: type }),
				),
			]),
		),
	]),
	([, , bounds]) => ({
		type: 'WildcardType' as const,
		annotations: [],
		...(bounds ?? {}),
	}),
);

setParserName(javaWildcardTypeParser, 'javaWildcardTypeParser');

// Type argument: either a type or a wildcard
const javaTypeArgumentParser: Parser<unknown, string> = createUnionParser([
	javaWildcardTypeParser,
	(ctx) => javaTypeParser(ctx),
]);

setParserName(javaTypeArgumentParser, 'javaTypeArgumentParser');

// Type arguments: <T, U, V> or <?, ? extends Foo>
const javaTypeArgumentsParser: Parser<unknown[], string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('<'),
		javaSkippableParser,
		createSeparatedNonEmptyArrayParser(
			promiseCompose(
				createTupleParser([
					javaTypeArgumentParser,
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

// Type parameter: T, T extends Foo, T extends Foo & Bar
type JavaTypeParameterOutput = {
	type: 'TypeParameter';
	annotations: unknown[];
	name: JavaSimpleName;
	typeBound: unknown[];
};

const javaTypeParameterParser: Parser<JavaTypeParameterOutput, string> = promiseCompose(
	createTupleParser([
		javaSimpleNameParser,
		javaSkippableParser,
		createOptionalParser(
			promiseCompose(
				createTupleParser([
					createExactSequenceParser('extends'),
					javaSkippableParser,
					createSeparatedNonEmptyArrayParser(
						promiseCompose(
							createTupleParser([
								(ctx) => javaTypeParser(ctx),
								javaSkippableParser,
							]),
							([type]) => type,
						),
						promiseCompose(
							createTupleParser([
								createExactSequenceParser('&'),
								javaSkippableParser,
							]),
							() => '&',
						),
					),
				]),
				([, , bounds]) => bounds,
			),
		),
	]),
	([name, , typeBound]) => ({
		type: 'TypeParameter' as const,
		annotations: [],  // TODO: parse type parameter annotations
		name,
		typeBound: typeBound ?? [],
	}),
);

setParserName(javaTypeParameterParser, 'javaTypeParameterParser');

// Type parameters: <T>, <T, U>, <T extends Foo>
const javaTypeParametersParser: Parser<JavaTypeParameterOutput[], string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('<'),
		javaSkippableParser,
		createSeparatedNonEmptyArrayParser(
			promiseCompose(
				createTupleParser([
					javaTypeParameterParser,
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
		javaSkippableParser,
		createExactSequenceParser('>'),
	]),
	([, , params]) => params,
);

setParserName(javaTypeParametersParser, 'javaTypeParametersParser');

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
	type_: unknown;  // The type of the parameter
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

// Implements clause: implements Interface1, Interface2
const javaImplementsClauseParser: Parser<JavaClassOrInterfaceTypeOutput[], string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('implements'),
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

setParserName(javaImplementsClauseParser, 'javaImplementsClauseParser');

// Extends clause: extends Parent
const javaExtendsClauseParser: Parser<JavaClassOrInterfaceTypeOutput[], string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('extends'),
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

setParserName(javaExtendsClauseParser, 'javaExtendsClauseParser');

// Block statement: { ... }
type JavaBlockStmtOutput = {
	type: 'BlockStmt';
	statements: unknown[];
};

// Forward declaration - will be defined after expression parsers
let javaStatementParser: Parser<unknown, string>;
let javaBlockStmtParserWithStatements: Parser<JavaBlockStmtOutput, string>;

// Simple block parser that skips content (used during initial parsing)
const javaBlockStmtParser: Parser<JavaBlockStmtOutput, string> = createObjectParser({
	_content: javaSkipBalancedBracesParser,
	type: 'BlockStmt' as const,
	statements: [] as unknown[], // Will be replaced by javaBlockStmtParserWithStatements
});

setParserName(javaBlockStmtParser, 'javaBlockStmtParser');

// Method declaration
type JavaMethodDeclarationOutput = {
	type: 'MethodDeclaration';
	modifiers: JavaModifier[];
	annotations: unknown[];
	typeParameters: unknown[];
	type_: unknown;  // Return type
	name: JavaSimpleName;
	parameters: JavaParameterOutput[];
	thrownExceptions: JavaClassOrInterfaceTypeOutput[];
	body?: JavaBlockStmtOutput;
};

const javaMethodDeclarationParser: Parser<JavaMethodDeclarationOutput, string> = promiseCompose(
	createTupleParser([
		javaAnnotationsParser,
		javaModifiersParser,
		createOptionalParser(
			promiseCompose(
				createTupleParser([
					javaTypeParametersParser,
					javaSkippableParser,
				]),
				([params]) => params,
			),
		),
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
			(ctx) => javaBlockStmtParserWithStatements(ctx),
			promiseCompose(createExactSequenceParser(';'), () => undefined),
		]),
	]),
	([annotations, modifiers, typeParameters, type_, , name, , parameters, , thrownExceptions, body]) => ({
		type: 'MethodDeclaration' as const,
		modifiers,
		annotations,
		typeParameters: typeParameters ?? [],
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
	type_: unknown;  // Variable type
	initializer?: unknown;
};

type JavaFieldDeclarationOutput = {
	type: 'FieldDeclaration';
	modifiers: JavaModifier[];
	annotations: unknown[];
	variables: JavaVariableDeclaratorOutput[];
};

// Expression parsers
// Forward declaration for recursive expression parsing
let javaExpressionParser: Parser<unknown, string>;

// NameExpr: simple name reference like `foo`
type JavaNameExprOutput = {
	type: 'NameExpr';
	name: JavaSimpleName;
};

const javaNameExprParser: Parser<JavaNameExprOutput, string> = createObjectParser({
	type: 'NameExpr' as const,
	name: javaSimpleNameParser,
});

setParserName(javaNameExprParser, 'javaNameExprParser');

// StringLiteralExpr: "string"
type JavaStringLiteralExprOutput = {
	type: 'StringLiteralExpr';
	value: string;
};

const javaStringLiteralExprParser: Parser<JavaStringLiteralExprOutput, string> = promiseCompose(
	createRegExpParser(/"(?:[^"\\]|\\.)*"/),
	match => ({
		type: 'StringLiteralExpr' as const,
		value: match[0].slice(1, -1), // Remove quotes
	}),
);

setParserName(javaStringLiteralExprParser, 'javaStringLiteralExprParser');

// IntegerLiteralExpr: 123, 0x1F, etc.
type JavaIntegerLiteralExprOutput = {
	type: 'IntegerLiteralExpr';
	value: string;
};

const javaIntegerLiteralExprParser: Parser<JavaIntegerLiteralExprOutput, string> = promiseCompose(
	createRegExpParser(/(?:0x[0-9a-fA-F]+|0b[01]+|0[0-7]*|[1-9][0-9]*)[lL]?/),
	match => ({
		type: 'IntegerLiteralExpr' as const,
		value: match[0],
	}),
);

setParserName(javaIntegerLiteralExprParser, 'javaIntegerLiteralExprParser');

// NullLiteralExpr: null
type JavaNullLiteralExprOutput = {
	type: 'NullLiteralExpr';
};

const javaNullLiteralExprParser: Parser<JavaNullLiteralExprOutput, string> = createObjectParser({
	_null: createExactSequenceParser('null'),
	type: 'NullLiteralExpr' as const,
});

setParserName(javaNullLiteralExprParser, 'javaNullLiteralExprParser');

// BooleanLiteralExpr: true, false
type JavaBooleanLiteralExprOutput = {
	type: 'BooleanLiteralExpr';
	value: boolean;
};

const javaBooleanLiteralExprParser: Parser<JavaBooleanLiteralExprOutput, string> = createUnionParser([
	promiseCompose(createExactSequenceParser('true'), () => ({ type: 'BooleanLiteralExpr' as const, value: true })),
	promiseCompose(createExactSequenceParser('false'), () => ({ type: 'BooleanLiteralExpr' as const, value: false })),
]);

setParserName(javaBooleanLiteralExprParser, 'javaBooleanLiteralExprParser');

// TypeExpr: used in method references like ParserConfiguration::new
type JavaTypeExprOutput = {
	type: 'TypeExpr';
	type_: unknown;
};

const javaTypeExprParser: Parser<JavaTypeExprOutput, string> = createObjectParser({
	type: 'TypeExpr' as const,
	type_: javaClassOrInterfaceTypeParser,
});

setParserName(javaTypeExprParser, 'javaTypeExprParser');

// MethodReferenceExpr: Foo::bar or Foo::new
type JavaMethodReferenceExprOutput = {
	type: 'MethodReferenceExpr';
	scope: unknown;
	identifier: string;
};

const javaMethodReferenceExprParser: Parser<JavaMethodReferenceExprOutput, string> = createObjectParser({
	type: 'MethodReferenceExpr' as const,
	scope: javaTypeExprParser,
	_ws1: javaSkippableParser,
	_colons: createExactSequenceParser('::'),
	_ws2: javaSkippableParser,
	identifier: javaIdentifierParser,
});

setParserName(javaMethodReferenceExprParser, 'javaMethodReferenceExprParser');

// Argument list: (arg1, arg2, ...)
const javaArgumentListParser: Parser<unknown[], string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('('),
		javaSkippableParser,
		createOptionalParser(
			createSeparatedNonEmptyArrayParser(
				promiseCompose(
					createTupleParser([
						(ctx) => javaExpressionParser(ctx),
						javaSkippableParser,
					]),
					([expr]) => expr,
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
	([, , args]) => args ?? [],
);

setParserName(javaArgumentListParser, 'javaArgumentListParser');

// MethodCallExpr: foo.bar(args) or bar(args)
type JavaMethodCallExprOutput = {
	type: 'MethodCallExpr';
	scope?: unknown;
	name: JavaSimpleName;
	arguments: unknown[];
};

// Simple method call without scope: foo(args)
const javaSimpleMethodCallExprParser: Parser<JavaMethodCallExprOutput, string> = createObjectParser({
	type: 'MethodCallExpr' as const,
	name: javaSimpleNameParser,
	_ws1: javaSkippableParser,
	arguments: javaArgumentListParser,
});

setParserName(javaSimpleMethodCallExprParser, 'javaSimpleMethodCallExprParser');

// ObjectCreationExpr: new ClassName(args)
const javaObjectCreationExprParser = createObjectParser({
	_new: createExactSequenceParser('new'),
	_ws1: javaWhitespaceParser, // Must have whitespace after 'new' to avoid matching 'newFoo()' as method call
	type: 'ObjectCreationExpr' as const,
	type_: javaClassOrInterfaceTypeParser,
	_ws2: javaSkippableParser,
	arguments: javaArgumentListParser,
});

setParserName(javaObjectCreationExprParser, 'javaObjectCreationExprParser');

// ThisExpr: this
type JavaThisExprOutput = {
	type: 'ThisExpr';
};

const javaThisExprParser: Parser<JavaThisExprOutput, string> = promiseCompose(
	createExactSequenceParser('this'),
	() => ({ type: 'ThisExpr' as const }),
);

setParserName(javaThisExprParser, 'javaThisExprParser');

// CastExpr: (Type) expr
type JavaCastExprOutput = {
	type: 'CastExpr';
	type_: unknown;
	expression: unknown;
};

// Forward declaration - will be defined later after primary expressions
let javaCastExprParser: Parser<unknown, string>;

// Parenthesized expression: (expr)
type JavaEnclosedExprOutput = {
	type: 'EnclosedExpr';
	inner: unknown;
};

const javaEnclosedExprParser: Parser<JavaEnclosedExprOutput, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('('),
		javaSkippableParser,
		(ctx) => javaExpressionParser(ctx),
		javaSkippableParser,
		createExactSequenceParser(')'),
	]),
	([, , inner]) => ({
		type: 'EnclosedExpr' as const,
		inner,
	}),
);

setParserName(javaEnclosedExprParser, 'javaEnclosedExprParser');

// Primary expression (without method calls chained)
const javaPrimaryExprParser: Parser<unknown, string> = createDisjunctionParser([
	javaStringLiteralExprParser,
	javaIntegerLiteralExprParser,
	javaNullLiteralExprParser,
	javaBooleanLiteralExprParser,
	javaThisExprParser, // this - must come before NameExpr
	javaObjectCreationExprParser, // new Foo() - must come before NameExpr
	javaMethodReferenceExprParser,
	javaSimpleMethodCallExprParser, // foo() - must come before NameExpr
	(ctx) => javaCastExprParser(ctx), // Cast - must come before enclosed
	javaEnclosedExprParser, // (expr) - parenthesized expressions
	javaNameExprParser, // Must be last since it matches any identifier
]);

setParserName(javaPrimaryExprParser, 'javaPrimaryExprParser');

// FieldAccessExpr: scope.field
type JavaFieldAccessExprOutput = {
	type: 'FieldAccessExpr';
	scope: unknown;
	name: JavaSimpleName;
};

// Expression with optional member access chain: expr.field, expr.method(args), expr::method
const javaMemberAccessExprParser: Parser<unknown, string> = promiseCompose(
	createTupleParser([
		javaPrimaryExprParser,
		createArrayParser(
			createDisjunctionParser([
				// Method reference: ::identifier
				promiseCompose(
					createTupleParser([
						javaSkippableParser,
						createExactSequenceParser('::'),
						javaSkippableParser,
						javaIdentifierParser,
					]),
					([, , , identifier]) => ({ type: 'methodReference' as const, identifier }),
				),
				// Field access or method call: .name[(args)]
				promiseCompose(
					createTupleParser([
						javaSkippableParser,
						createExactSequenceParser('.'),
						javaSkippableParser,
						javaSimpleNameParser,
						javaSkippableParser,
						createOptionalParser(javaArgumentListParser),
					]),
					([, , , name, , args]) => ({ type: 'member' as const, name, arguments: args }),
				),
			]),
		),
	]),
	([primary, members]) => {
		let result = primary;
		for (const member of members) {
			if (member.type === 'methodReference') {
				result = {
					type: 'MethodReferenceExpr' as const,
					scope: result,
					identifier: member.identifier,
				};
			} else if (member.arguments !== undefined) {
				result = {
					type: 'MethodCallExpr' as const,
					scope: result,
					name: member.name,
					arguments: member.arguments,
				};
			} else {
				result = {
					type: 'FieldAccessExpr' as const,
					scope: result,
					name: member.name,
				};
			}
		}
		return result;
	},
);

setParserName(javaMemberAccessExprParser, 'javaMemberAccessExprParser');

// Define cast expression: (Type) expr
javaCastExprParser = promiseCompose(
	createTupleParser([
		createExactSequenceParser('('),
		javaSkippableParser,
		javaTypeParser, // Must be a type, not just any expression
		javaSkippableParser,
		createExactSequenceParser(')'),
		javaSkippableParser,
		javaMemberAccessExprParser, // The expression being cast
	]),
	([, , type_, , , , expression]) => ({
		type: 'CastExpr' as const,
		type_,
		expression,
	}),
);

setParserName(javaCastExprParser, 'javaCastExprParser');

// Unary expression: -expr, !expr, +expr
type JavaUnaryExprOutput = {
	type: 'UnaryExpr';
	operator: string;
	expression: unknown;
};

const javaUnaryExprParser: Parser<unknown, string> = createDisjunctionParser([
	// Unary minus, plus, not
	promiseCompose(
		createTupleParser([
			createDisjunctionParser([
				promiseCompose(createExactSequenceParser('-'), () => 'MINUS'),
				promiseCompose(createExactSequenceParser('+'), () => 'PLUS'),
				promiseCompose(createExactSequenceParser('!'), () => 'LOGICAL_COMPLEMENT'),
			]),
			javaSkippableParser,
			(ctx) => javaUnaryExprParser(ctx), // Recursive for --x, !!x, etc.
		]),
		([operator, , expression]) => ({
			type: 'UnaryExpr' as const,
			operator,
			expression,
		}),
	),
	// Non-unary (primary/member access)
	javaMemberAccessExprParser,
]);

setParserName(javaUnaryExprParser, 'javaUnaryExprParser');

// Multiplicative operator (*, /, %)
const javaMultiplicativeOperatorParser: Parser<string, string> = createDisjunctionParser([
	promiseCompose(createExactSequenceParser('*'), () => 'MULTIPLY'),
	promiseCompose(createExactSequenceParser('/'), () => 'DIVIDE'),
	promiseCompose(createExactSequenceParser('%'), () => 'REMAINDER'),
]);

// Multiplicative expression
const javaMultiplicativeExprParser: Parser<unknown, string> = promiseCompose(
	createTupleParser([
		javaUnaryExprParser,
		createArrayParser(
			promiseCompose(
				createTupleParser([
					javaSkippableParser,
					javaMultiplicativeOperatorParser,
					javaSkippableParser,
					javaUnaryExprParser,
				]),
				([, operator, , right]) => ({ operator, right }),
			),
		),
	]),
	([left, operations]) => {
		let result = left;
		for (const op of operations) {
			result = {
				type: 'BinaryExpr' as const,
				left: result,
				right: op.right,
				operator: op.operator,
			};
		}
		return result;
	},
);

setParserName(javaMultiplicativeExprParser, 'javaMultiplicativeExprParser');

// Additive operator (+, -)
const javaAdditiveOperatorParser: Parser<string, string> = createDisjunctionParser([
	promiseCompose(createExactSequenceParser('+'), () => 'PLUS'),
	promiseCompose(createExactSequenceParser('-'), () => 'MINUS'),
]);

// Additive expression (handles string concatenation and arithmetic)
const javaAdditiveExprParser: Parser<unknown, string> = promiseCompose(
	createTupleParser([
		javaMultiplicativeExprParser,
		createArrayParser(
			promiseCompose(
				createTupleParser([
					javaSkippableParser,
					javaAdditiveOperatorParser,
					javaSkippableParser,
					javaUnaryExprParser,
				]),
				([, operator, , right]) => ({ operator, right }),
			),
		),
	]),
	([left, operations]) => {
		let result = left;
		for (const op of operations) {
			result = {
				type: 'BinaryExpr' as const,
				left: result,
				right: op.right,
				operator: op.operator,
			};
		}
		return result;
	},
);

setParserName(javaAdditiveExprParser, 'javaAdditiveExprParser');

// InstanceOfExpr: expr instanceof Type
type JavaInstanceOfExprOutput = {
	type: 'InstanceOfExpr';
	expression: unknown;
	type_: unknown;
};

// Relational expression with instanceof
const javaRelationalExprParser: Parser<unknown, string> = promiseCompose(
	createTupleParser([
		javaAdditiveExprParser,
		createOptionalParser(
			promiseCompose(
				createTupleParser([
					javaSkippableParser,
					createExactSequenceParser('instanceof'),
					javaWhitespaceParser,
					javaTypeParser,
				]),
				([, , , type_]) => ({ type: 'instanceof' as const, type_ }),
			),
		),
	]),
	([expr, instanceOf]) => {
		if (instanceOf) {
			return {
				type: 'InstanceOfExpr' as const,
				expression: expr,
				type_: instanceOf.type_,
			};
		}
		return expr;
	},
);

setParserName(javaRelationalExprParser, 'javaRelationalExprParser');

// Comparison operator
const javaComparisonOperatorParser: Parser<string, string> = createDisjunctionParser([
	promiseCompose(createExactSequenceParser('<='), () => 'LESS_EQUALS'),
	promiseCompose(createExactSequenceParser('>='), () => 'GREATER_EQUALS'),
	promiseCompose(createExactSequenceParser('=='), () => 'EQUALS'),
	promiseCompose(createExactSequenceParser('!='), () => 'NOT_EQUALS'),
	promiseCompose(createExactSequenceParser('<'), () => 'LESS'),
	promiseCompose(createExactSequenceParser('>'), () => 'GREATER'),
]);

// Comparison expression (relational and equality)
const javaComparisonExprParser: Parser<unknown, string> = promiseCompose(
	createTupleParser([
		javaRelationalExprParser,
		createOptionalParser(
			promiseCompose(
				createTupleParser([
					javaSkippableParser,
					javaComparisonOperatorParser,
					javaSkippableParser,
					javaRelationalExprParser,
				]),
				([, operator, , right]) => ({ operator, right }),
			),
		),
	]),
	([left, comparison]) => {
		if (comparison) {
			return {
				type: 'BinaryExpr' as const,
				left,
				right: comparison.right,
				operator: comparison.operator,
			};
		}
		return left;
	},
);

setParserName(javaComparisonExprParser, 'javaComparisonExprParser');

// Logical AND expression
const javaLogicalAndExprParser: Parser<unknown, string> = promiseCompose(
	createTupleParser([
		javaComparisonExprParser,
		createArrayParser(
			promiseCompose(
				createTupleParser([
					javaSkippableParser,
					createExactSequenceParser('&&'),
					javaSkippableParser,
					javaComparisonExprParser,
				]),
				([, , , right]) => right,
			),
		),
	]),
	([left, rights]) => {
		let result = left;
		for (const right of rights) {
			result = {
				type: 'BinaryExpr' as const,
				left: result,
				right,
				operator: 'AND',
			};
		}
		return result;
	},
);

setParserName(javaLogicalAndExprParser, 'javaLogicalAndExprParser');

// Logical OR expression
const javaLogicalOrExprParser: Parser<unknown, string> = promiseCompose(
	createTupleParser([
		javaLogicalAndExprParser,
		createArrayParser(
			promiseCompose(
				createTupleParser([
					javaSkippableParser,
					createExactSequenceParser('||'),
					javaSkippableParser,
					javaLogicalAndExprParser,
				]),
				([, , , right]) => right,
			),
		),
	]),
	([left, rights]) => {
		let result = left;
		for (const right of rights) {
			result = {
				type: 'BinaryExpr' as const,
				left: result,
				right,
				operator: 'OR',
			};
		}
		return result;
	},
);

setParserName(javaLogicalOrExprParser, 'javaLogicalOrExprParser');

// Ternary (conditional) expression: condition ? thenExpr : elseExpr
type JavaConditionalExprOutput = {
	type: 'ConditionalExpr';
	condition: unknown;
	thenExpr: unknown;
	elseExpr: unknown;
};

const javaTernaryExprParser: Parser<unknown, string> = promiseCompose(
	createTupleParser([
		javaLogicalOrExprParser,
		createOptionalParser(
			promiseCompose(
				createTupleParser([
					javaSkippableParser,
					createExactSequenceParser('?'),
					javaSkippableParser,
					(ctx) => javaTernaryExprParser(ctx), // thenExpr can be another ternary
					javaSkippableParser,
					createExactSequenceParser(':'),
					javaSkippableParser,
					(ctx) => javaTernaryExprParser(ctx), // elseExpr can be another ternary
				]),
				([, , , thenExpr, , , , elseExpr]) => ({ thenExpr, elseExpr }),
			),
		),
	]),
	([condition, ternary]) => {
		if (ternary) {
			return {
				type: 'ConditionalExpr' as const,
				condition,
				thenExpr: ternary.thenExpr,
				elseExpr: ternary.elseExpr,
			};
		}
		return condition;
	},
);

setParserName(javaTernaryExprParser, 'javaTernaryExprParser');

// Assignment operator
const javaAssignOperatorParser: Parser<string, string> = createDisjunctionParser([
	promiseCompose(createExactSequenceParser('='), () => 'ASSIGN'),
	promiseCompose(createExactSequenceParser('+='), () => 'PLUS'),
	promiseCompose(createExactSequenceParser('-='), () => 'MINUS'),
	promiseCompose(createExactSequenceParser('*='), () => 'MULTIPLY'),
	promiseCompose(createExactSequenceParser('/='), () => 'DIVIDE'),
]);

// Expression with optional assignment
javaExpressionParser = promiseCompose(
	createTupleParser([
		javaTernaryExprParser,
		createOptionalParser(
			promiseCompose(
				createTupleParser([
					javaSkippableParser,
					javaAssignOperatorParser,
					javaSkippableParser,
					(ctx) => javaExpressionParser(ctx), // Recursive for chained assignment
				]),
				([, operator, , value]) => ({ operator, value }),
			),
		),
	]),
	([target, assignment]) => {
		if (assignment) {
			return {
				type: 'AssignExpr' as const,
				target,
				value: assignment.value,
				operator: assignment.operator,
			};
		}
		return target;
	},
);

setParserName(javaExpressionParser, 'javaExpressionParser');

// Skip balanced expression (fallback for complex initializers we can't parse yet)
const javaSkipInitializerParser: Parser<unknown, string> = promiseCompose(
	createRegExpParser(/[^,;{}]+/),
	() => ({ type: 'UnparsedExpr' }),
);

// Expression parser with fallback
const javaInitializerExprParser: Parser<unknown, string> = createDisjunctionParser([
	javaExpressionParser,
	javaSkipInitializerParser,
]);

// Statement parsers
// ReturnStmt: return expr;
type JavaReturnStmtOutput = {
	type: 'ReturnStmt';
	expression?: unknown;
};

const javaReturnStmtParser: Parser<JavaReturnStmtOutput, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('return'),
		javaSkippableParser,
		createOptionalParser(
			promiseCompose(
				createTupleParser([
					javaExpressionParser,
					javaSkippableParser,
				]),
				([expr]) => expr,
			),
		),
		createExactSequenceParser(';'),
	]),
	([, , expression]) => ({
		type: 'ReturnStmt' as const,
		...(expression ? { expression } : {}),
	}),
);

setParserName(javaReturnStmtParser, 'javaReturnStmtParser');

// ThrowStmt: throw expr;
type JavaThrowStmtOutput = {
	type: 'ThrowStmt';
	expression: unknown;
};

const javaThrowStmtParser: Parser<JavaThrowStmtOutput, string> = createObjectParser({
	_throw: createExactSequenceParser('throw'),
	_ws1: javaSkippableParser,
	type: 'ThrowStmt' as const,
	expression: javaExpressionParser,
	_ws2: javaSkippableParser,
	_semi: createExactSequenceParser(';'),
});

setParserName(javaThrowStmtParser, 'javaThrowStmtParser');

// ExpressionStmt: expr;
type JavaExpressionStmtOutput = {
	type: 'ExpressionStmt';
	expression: unknown;
};

const javaExpressionStmtParser: Parser<JavaExpressionStmtOutput, string> = createObjectParser({
	type: 'ExpressionStmt' as const,
	expression: javaExpressionParser,
	_ws1: javaSkippableParser,
	_semi: createExactSequenceParser(';'),
});

setParserName(javaExpressionStmtParser, 'javaExpressionStmtParser');

// IfStmt: if (cond) then [else elseStmt]
type JavaIfStmtOutput = {
	type: 'IfStmt';
	condition: unknown;
	thenStmt: unknown;
	elseStmt?: unknown;
};

const javaIfStmtParser: Parser<JavaIfStmtOutput, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('if'),
		javaSkippableParser,
		createExactSequenceParser('('),
		javaSkippableParser,
		javaExpressionParser,
		javaSkippableParser,
		createExactSequenceParser(')'),
		javaSkippableParser,
		(ctx) => javaStatementParser(ctx),
		createOptionalParser(
			promiseCompose(
				createTupleParser([
					javaSkippableParser,
					createExactSequenceParser('else'),
					javaSkippableParser,
					(ctx) => javaStatementParser(ctx),
				]),
				([, , , elseStmt]) => elseStmt,
			),
		),
	]),
	([, , , , condition, , , , thenStmt, elseStmt]) => ({
		type: 'IfStmt' as const,
		condition,
		thenStmt,
		...(elseStmt ? { elseStmt } : {}),
	}),
);

setParserName(javaIfStmtParser, 'javaIfStmtParser');

// Define the block statement parser with actual statements
javaBlockStmtParserWithStatements = createObjectParser({
	_open: createExactSequenceParser('{'),
	_ws1: javaSkippableParser,
	type: 'BlockStmt' as const,
	statements: createArrayParser(
		promiseCompose(
			createTupleParser([
				(ctx) => javaStatementParser(ctx),
				javaSkippableParser,
			]),
			([stmt]) => stmt,
		),
	),
	_close: createExactSequenceParser('}'),
});

setParserName(javaBlockStmtParserWithStatements, 'javaBlockStmtParserWithStatements');

// VariableDeclarationExpr: Type name = expr
type JavaVariableDeclarationExprOutput = {
	type: 'VariableDeclarationExpr';
	modifiers: JavaModifier[];
	annotations: unknown[];
	variables: JavaVariableDeclaratorOutput[];
};

const javaVariableDeclarationExprParser: Parser<JavaVariableDeclarationExprOutput, string> = promiseCompose(
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
								javaExpressionParser,
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
	]),
	([annotations, modifiers, type_, , variables]) => ({
		type: 'VariableDeclarationExpr' as const,
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

setParserName(javaVariableDeclarationExprParser, 'javaVariableDeclarationExprParser');

// Local variable declaration statement
type JavaExpressionStmtOutputForVarDecl = {
	type: 'ExpressionStmt';
	expression: JavaVariableDeclarationExprOutput;
};

const javaLocalVarDeclStmtParser: Parser<JavaExpressionStmtOutputForVarDecl, string> = createObjectParser({
	type: 'ExpressionStmt' as const,
	expression: javaVariableDeclarationExprParser,
	_ws1: javaSkippableParser,
	_semi: createExactSequenceParser(';'),
});

setParserName(javaLocalVarDeclStmtParser, 'javaLocalVarDeclStmtParser');

// Statement parser - combines all statement types
javaStatementParser = createDisjunctionParser([
	javaReturnStmtParser,
	javaThrowStmtParser,
	javaIfStmtParser,
	javaBlockStmtParserWithStatements,
	javaLocalVarDeclStmtParser, // Local variable declarations
	javaExpressionStmtParser, // Must be last since it's most general
]);

setParserName(javaStatementParser, 'javaStatementParser');

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
								javaInitializerExprParser,
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
		(ctx) => javaBlockStmtParserWithStatements(ctx),
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
		createOptionalParser(
			promiseCompose(
				createTupleParser([javaTypeParametersParser, javaSkippableParser]),
				([params]) => params,
			),
		),
		createOptionalParser(
			promiseCompose(
				createTupleParser([javaExtendsClauseParser, javaSkippableParser]),
				([types]) => types,
			),
		),
		createOptionalParser(
			promiseCompose(
				createTupleParser([javaImplementsClauseParser, javaSkippableParser]),
				([types]) => types,
			),
		),
		// TODO: permits clause
		javaClassBodyParser,
	]),
	([, annotations, modifiers, , , name, , typeParameters, extendedTypes, implementedTypes, members]) => ({
		type: 'ClassOrInterfaceDeclaration' as const,
		modifiers,
		annotations,
		name,
		isInterface: false,
		typeParameters: typeParameters ?? [],
		extendedTypes: extendedTypes ?? [],
		implementedTypes: implementedTypes ?? [],
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
	type: 'CompilationUnit' as const,
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
