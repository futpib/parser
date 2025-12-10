// Java AST type definitions

export type JavaIdentifier = string;

export type JavaQualifiedName = {
	parts: JavaIdentifier[];
};

// Modifiers
export type JavaModifier =
	| 'public'
	| 'protected'
	| 'private'
	| 'static'
	| 'final'
	| 'abstract'
	| 'synchronized'
	| 'native'
	| 'transient'
	| 'volatile'
	| 'strictfp'
	| 'default'
	| 'sealed'
	| 'non-sealed';

// Annotations
export type JavaAnnotation = {
	name: JavaQualifiedName;
	// TODO: annotation arguments
};

// Package declaration
export type JavaPackageDeclaration = {
	annotations: JavaAnnotation[];
	name: JavaQualifiedName;
};

// Import declaration
export type JavaImportDeclaration = {
	isStatic: boolean;
	name: JavaQualifiedName;
	isWildcard: boolean;
};

// Type declarations (classes, interfaces, enums, records, annotations)
export type JavaClassDeclaration = {
	type: 'class';
	annotations: JavaAnnotation[];
	modifiers: JavaModifier[];
	name: JavaIdentifier;
	// TODO: type parameters
	// TODO: extends clause
	// TODO: implements clause
	// TODO: permits clause (sealed classes)
	// TODO: body
};

export type JavaInterfaceDeclaration = {
	type: 'interface';
	annotations: JavaAnnotation[];
	modifiers: JavaModifier[];
	name: JavaIdentifier;
	// TODO: type parameters
	// TODO: extends clause
	// TODO: permits clause
	// TODO: body
};

export type JavaEnumDeclaration = {
	type: 'enum';
	annotations: JavaAnnotation[];
	modifiers: JavaModifier[];
	name: JavaIdentifier;
	// TODO: implements clause
	// TODO: enum constants
	// TODO: body
};

export type JavaRecordDeclaration = {
	type: 'record';
	annotations: JavaAnnotation[];
	modifiers: JavaModifier[];
	name: JavaIdentifier;
	// TODO: type parameters
	// TODO: record components
	// TODO: implements clause
	// TODO: body
};

export type JavaAnnotationDeclaration = {
	type: 'annotation';
	annotations: JavaAnnotation[];
	modifiers: JavaModifier[];
	name: JavaIdentifier;
	// TODO: body
};

export type JavaTypeDeclaration =
	| JavaClassDeclaration
	| JavaInterfaceDeclaration
	| JavaEnumDeclaration
	| JavaRecordDeclaration
	| JavaAnnotationDeclaration;

// Compilation unit (top-level)
export type JavaCompilationUnit = {
	package?: JavaPackageDeclaration;
	imports: JavaImportDeclaration[];
	types: JavaTypeDeclaration[];
};
