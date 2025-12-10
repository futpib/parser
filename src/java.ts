// Java AST type definitions - matches javaparser's JSON output format

// Name node (qualified name as nested structure)
export type JavaName = {
	type: 'Name';
	identifier: string;
	qualifier?: JavaName;
};

// SimpleName node
export type JavaSimpleName = {
	type: 'SimpleName';
	identifier: string;
};

// Modifier node
export type JavaModifierKeyword =
	| 'PUBLIC'
	| 'PROTECTED'
	| 'PRIVATE'
	| 'STATIC'
	| 'FINAL'
	| 'ABSTRACT'
	| 'SYNCHRONIZED'
	| 'NATIVE'
	| 'TRANSIENT'
	| 'VOLATILE'
	| 'STRICTFP'
	| 'DEFAULT'
	| 'SEALED'
	| 'NON_SEALED';

export type JavaModifier = {
	type: 'Modifier';
	keyword: JavaModifierKeyword;
};

// Annotation expressions
export type JavaMarkerAnnotationExpr = {
	type: 'MarkerAnnotationExpr';
	name: JavaName;
};

export type JavaSingleMemberAnnotationExpr = {
	type: 'SingleMemberAnnotationExpr';
	name: JavaName;
	memberValue: JavaExpression;
};

export type JavaMemberValuePair = {
	type: 'MemberValuePair';
	name: JavaSimpleName;
	value: JavaExpression;
};

export type JavaNormalAnnotationExpr = {
	type: 'NormalAnnotationExpr';
	name: JavaName;
	pairs: JavaMemberValuePair[];
};

export type JavaAnnotationExpr =
	| JavaMarkerAnnotationExpr
	| JavaSingleMemberAnnotationExpr
	| JavaNormalAnnotationExpr;

// Package declaration
export type JavaPackageDeclaration = {
	type: 'PackageDeclaration';
	annotations: JavaAnnotationExpr[];
	name: JavaName;
};

// Import declaration
export type JavaImportDeclaration = {
	type: 'ImportDeclaration';
	isStatic: boolean;
	isAsterisk: boolean;
	name: JavaName;
};

// Type parameters and arguments
export type JavaTypeParameter = {
	type: 'TypeParameter';
	name: JavaSimpleName;
	typeBound: JavaClassOrInterfaceType[];
	annotations: JavaAnnotationExpr[];
};

export type JavaClassOrInterfaceType = {
	type: 'ClassOrInterfaceType';
	name: JavaSimpleName;
	scope?: JavaClassOrInterfaceType;
	typeArguments?: JavaType[];
	annotations: JavaAnnotationExpr[];
};

export type JavaPrimitiveType = {
	type: 'PrimitiveType';
	type_: 'BOOLEAN' | 'BYTE' | 'CHAR' | 'DOUBLE' | 'FLOAT' | 'INT' | 'LONG' | 'SHORT';
	annotations: JavaAnnotationExpr[];
};

export type JavaArrayType = {
	type: 'ArrayType';
	componentType: JavaType;
	origin: 'NAME' | 'TYPE';
	annotations: JavaAnnotationExpr[];
};

export type JavaVoidType = {
	type: 'VoidType';
	annotations: JavaAnnotationExpr[];
};

export type JavaWildcardType = {
	type: 'WildcardType';
	extendedType?: JavaReferenceType;
	superType?: JavaReferenceType;
	annotations: JavaAnnotationExpr[];
};

export type JavaVarType = {
	type: 'VarType';
	annotations: JavaAnnotationExpr[];
};

export type JavaUnionType = {
	type: 'UnionType';
	elements: JavaReferenceType[];
	annotations: JavaAnnotationExpr[];
};

export type JavaIntersectionType = {
	type: 'IntersectionType';
	elements: JavaReferenceType[];
	annotations: JavaAnnotationExpr[];
};

export type JavaReferenceType = JavaClassOrInterfaceType | JavaArrayType;

export type JavaType =
	| JavaPrimitiveType
	| JavaClassOrInterfaceType
	| JavaArrayType
	| JavaVoidType
	| JavaWildcardType
	| JavaVarType
	| JavaUnionType
	| JavaIntersectionType;

// Expressions
export type JavaNameExpr = {
	type: 'NameExpr';
	name: JavaSimpleName;
};

export type JavaLiteralExpr =
	| JavaIntegerLiteralExpr
	| JavaLongLiteralExpr
	| JavaDoubleLiteralExpr
	| JavaCharLiteralExpr
	| JavaStringLiteralExpr
	| JavaTextBlockLiteralExpr
	| JavaBooleanLiteralExpr
	| JavaNullLiteralExpr;

export type JavaIntegerLiteralExpr = {
	type: 'IntegerLiteralExpr';
	value: string;
};

export type JavaLongLiteralExpr = {
	type: 'LongLiteralExpr';
	value: string;
};

export type JavaDoubleLiteralExpr = {
	type: 'DoubleLiteralExpr';
	value: string;
};

export type JavaCharLiteralExpr = {
	type: 'CharLiteralExpr';
	value: string;
};

export type JavaStringLiteralExpr = {
	type: 'StringLiteralExpr';
	value: string;
};

export type JavaTextBlockLiteralExpr = {
	type: 'TextBlockLiteralExpr';
	value: string;
};

export type JavaBooleanLiteralExpr = {
	type: 'BooleanLiteralExpr';
	value: boolean;
};

export type JavaNullLiteralExpr = {
	type: 'NullLiteralExpr';
};

export type JavaThisExpr = {
	type: 'ThisExpr';
	typeName?: JavaName;
};

export type JavaSuperExpr = {
	type: 'SuperExpr';
	typeName?: JavaName;
};

export type JavaFieldAccessExpr = {
	type: 'FieldAccessExpr';
	scope: JavaExpression;
	name: JavaSimpleName;
	typeArguments?: JavaType[];
};

export type JavaArrayAccessExpr = {
	type: 'ArrayAccessExpr';
	name: JavaExpression;
	index: JavaExpression;
};

export type JavaMethodCallExpr = {
	type: 'MethodCallExpr';
	scope?: JavaExpression;
	name: JavaSimpleName;
	arguments: JavaExpression[];
	typeArguments?: JavaType[];
};

export type JavaObjectCreationExpr = {
	type: 'ObjectCreationExpr';
	scope?: JavaExpression;
	type_: JavaClassOrInterfaceType;
	arguments: JavaExpression[];
	typeArguments?: JavaType[];
	anonymousClassBody?: JavaBodyDeclaration[];
};

export type JavaArrayCreationExpr = {
	type: 'ArrayCreationExpr';
	elementType: JavaType;
	levels: JavaArrayCreationLevel[];
	initializer?: JavaArrayInitializerExpr;
};

export type JavaArrayCreationLevel = {
	type: 'ArrayCreationLevel';
	dimension?: JavaExpression;
	annotations: JavaAnnotationExpr[];
};

export type JavaArrayInitializerExpr = {
	type: 'ArrayInitializerExpr';
	values: JavaExpression[];
};

export type JavaBinaryExpr = {
	type: 'BinaryExpr';
	left: JavaExpression;
	right: JavaExpression;
	operator: string;
};

export type JavaUnaryExpr = {
	type: 'UnaryExpr';
	expression: JavaExpression;
	operator: string;
	prefix: boolean;
};

export type JavaAssignExpr = {
	type: 'AssignExpr';
	target: JavaExpression;
	value: JavaExpression;
	operator: string;
};

export type JavaConditionalExpr = {
	type: 'ConditionalExpr';
	condition: JavaExpression;
	thenExpr: JavaExpression;
	elseExpr: JavaExpression;
};

export type JavaEnclosedExpr = {
	type: 'EnclosedExpr';
	inner: JavaExpression;
};

export type JavaCastExpr = {
	type: 'CastExpr';
	type_: JavaType;
	expression: JavaExpression;
};

export type JavaInstanceOfExpr = {
	type: 'InstanceOfExpr';
	expression: JavaExpression;
	type_: JavaReferenceType;
	pattern?: JavaPatternExpr;
};

export type JavaTypePatternExpr = {
	type: 'TypePatternExpr';
	type_: JavaType;
	name: JavaSimpleName;
	modifiers: JavaModifier[];
};

export type JavaRecordPatternExpr = {
	type: 'RecordPatternExpr';
	type_: JavaType;
	patternList: JavaPatternExpr[];
};

export type JavaPatternExpr = JavaTypePatternExpr | JavaRecordPatternExpr;

export type JavaClassExpr = {
	type: 'ClassExpr';
	type_: JavaType;
};

export type JavaLambdaExpr = {
	type: 'LambdaExpr';
	parameters: JavaParameter[];
	body: JavaStatement | JavaExpression;
	isEnclosingParameters: boolean;
};

export type JavaMethodReferenceExpr = {
	type: 'MethodReferenceExpr';
	scope: JavaExpression | JavaType;
	identifier: string;
	typeArguments?: JavaType[];
};

export type JavaSwitchExpr = {
	type: 'SwitchExpr';
	selector: JavaExpression;
	entries: JavaSwitchEntry[];
};

export type JavaExpression =
	| JavaNameExpr
	| JavaLiteralExpr
	| JavaThisExpr
	| JavaSuperExpr
	| JavaFieldAccessExpr
	| JavaArrayAccessExpr
	| JavaMethodCallExpr
	| JavaObjectCreationExpr
	| JavaArrayCreationExpr
	| JavaArrayInitializerExpr
	| JavaBinaryExpr
	| JavaUnaryExpr
	| JavaAssignExpr
	| JavaConditionalExpr
	| JavaEnclosedExpr
	| JavaCastExpr
	| JavaInstanceOfExpr
	| JavaClassExpr
	| JavaLambdaExpr
	| JavaMethodReferenceExpr
	| JavaAnnotationExpr
	| JavaSwitchExpr;

// Statements
export type JavaBlockStmt = {
	type: 'BlockStmt';
	statements: JavaStatement[];
};

export type JavaExpressionStmt = {
	type: 'ExpressionStmt';
	expression: JavaExpression;
};

export type JavaReturnStmt = {
	type: 'ReturnStmt';
	expression?: JavaExpression;
};

export type JavaIfStmt = {
	type: 'IfStmt';
	condition: JavaExpression;
	thenStmt: JavaStatement;
	elseStmt?: JavaStatement;
};

export type JavaForStmt = {
	type: 'ForStmt';
	initialization: JavaExpression[];
	compare?: JavaExpression;
	update: JavaExpression[];
	body: JavaStatement;
};

export type JavaForEachStmt = {
	type: 'ForEachStmt';
	variable: JavaVariableDeclarationExpr;
	iterable: JavaExpression;
	body: JavaStatement;
};

export type JavaWhileStmt = {
	type: 'WhileStmt';
	condition: JavaExpression;
	body: JavaStatement;
};

export type JavaDoStmt = {
	type: 'DoStmt';
	body: JavaStatement;
	condition: JavaExpression;
};

export type JavaSwitchStmt = {
	type: 'SwitchStmt';
	selector: JavaExpression;
	entries: JavaSwitchEntry[];
};

export type JavaSwitchEntry = {
	type: 'SwitchEntry';
	labels: JavaExpression[];
	type_: 'STATEMENT_GROUP' | 'EXPRESSION' | 'BLOCK' | 'THROWS_STATEMENT';
	statements: JavaStatement[];
	guard?: JavaExpression;
};

export type JavaBreakStmt = {
	type: 'BreakStmt';
	label?: JavaSimpleName;
};

export type JavaContinueStmt = {
	type: 'ContinueStmt';
	label?: JavaSimpleName;
};

export type JavaYieldStmt = {
	type: 'YieldStmt';
	expression: JavaExpression;
};

export type JavaThrowStmt = {
	type: 'ThrowStmt';
	expression: JavaExpression;
};

export type JavaTryStmt = {
	type: 'TryStmt';
	resources: JavaExpression[];
	tryBlock: JavaBlockStmt;
	catchClauses: JavaCatchClause[];
	finallyBlock?: JavaBlockStmt;
};

export type JavaCatchClause = {
	type: 'CatchClause';
	parameter: JavaParameter;
	body: JavaBlockStmt;
};

export type JavaSynchronizedStmt = {
	type: 'SynchronizedStmt';
	expression: JavaExpression;
	body: JavaBlockStmt;
};

export type JavaLabeledStmt = {
	type: 'LabeledStmt';
	label: JavaSimpleName;
	statement: JavaStatement;
};

export type JavaAssertStmt = {
	type: 'AssertStmt';
	check: JavaExpression;
	message?: JavaExpression;
};

export type JavaLocalClassDeclarationStmt = {
	type: 'LocalClassDeclarationStmt';
	classDeclaration: JavaClassOrInterfaceDeclaration;
};

export type JavaLocalRecordDeclarationStmt = {
	type: 'LocalRecordDeclarationStmt';
	recordDeclaration: JavaRecordDeclaration;
};

export type JavaEmptyStmt = {
	type: 'EmptyStmt';
};

export type JavaExplicitConstructorInvocationStmt = {
	type: 'ExplicitConstructorInvocationStmt';
	isThis: boolean;
	expression?: JavaExpression;
	arguments: JavaExpression[];
	typeArguments?: JavaType[];
};

export type JavaUnparsableStmt = {
	type: 'UnparsableStmt';
};

export type JavaStatement =
	| JavaBlockStmt
	| JavaExpressionStmt
	| JavaReturnStmt
	| JavaIfStmt
	| JavaForStmt
	| JavaForEachStmt
	| JavaWhileStmt
	| JavaDoStmt
	| JavaSwitchStmt
	| JavaBreakStmt
	| JavaContinueStmt
	| JavaYieldStmt
	| JavaThrowStmt
	| JavaTryStmt
	| JavaSynchronizedStmt
	| JavaLabeledStmt
	| JavaAssertStmt
	| JavaLocalClassDeclarationStmt
	| JavaLocalRecordDeclarationStmt
	| JavaEmptyStmt
	| JavaExplicitConstructorInvocationStmt
	| JavaUnparsableStmt;

// Variable declarations
export type JavaVariableDeclarator = {
	type: 'VariableDeclarator';
	name: JavaSimpleName;
	type_: JavaType;
	initializer?: JavaExpression;
};

export type JavaVariableDeclarationExpr = {
	type: 'VariableDeclarationExpr';
	modifiers: JavaModifier[];
	annotations: JavaAnnotationExpr[];
	variables: JavaVariableDeclarator[];
};

// Parameters
export type JavaParameter = {
	type: 'Parameter';
	modifiers: JavaModifier[];
	annotations: JavaAnnotationExpr[];
	type_: JavaType;
	isVarArgs: boolean;
	varArgsAnnotations: JavaAnnotationExpr[];
	name: JavaSimpleName;
};

export type JavaReceiverParameter = {
	type: 'ReceiverParameter';
	annotations: JavaAnnotationExpr[];
	type_: JavaType;
	name: JavaName;
};

// Body declarations (members)
export type JavaFieldDeclaration = {
	type: 'FieldDeclaration';
	modifiers: JavaModifier[];
	annotations: JavaAnnotationExpr[];
	variables: JavaVariableDeclarator[];
};

export type JavaMethodDeclaration = {
	type: 'MethodDeclaration';
	modifiers: JavaModifier[];
	annotations: JavaAnnotationExpr[];
	typeParameters: JavaTypeParameter[];
	type_: JavaType;
	name: JavaSimpleName;
	parameters: JavaParameter[];
	receiverParameter?: JavaReceiverParameter;
	thrownExceptions: JavaReferenceType[];
	body?: JavaBlockStmt;
};

export type JavaConstructorDeclaration = {
	type: 'ConstructorDeclaration';
	modifiers: JavaModifier[];
	annotations: JavaAnnotationExpr[];
	typeParameters: JavaTypeParameter[];
	name: JavaSimpleName;
	parameters: JavaParameter[];
	receiverParameter?: JavaReceiverParameter;
	thrownExceptions: JavaReferenceType[];
	body: JavaBlockStmt;
};

export type JavaInitializerDeclaration = {
	type: 'InitializerDeclaration';
	isStatic: boolean;
	body: JavaBlockStmt;
};

export type JavaEnumConstantDeclaration = {
	type: 'EnumConstantDeclaration';
	annotations: JavaAnnotationExpr[];
	name: JavaSimpleName;
	arguments: JavaExpression[];
	classBody: JavaBodyDeclaration[];
};

export type JavaAnnotationMemberDeclaration = {
	type: 'AnnotationMemberDeclaration';
	modifiers: JavaModifier[];
	annotations: JavaAnnotationExpr[];
	type_: JavaType;
	name: JavaSimpleName;
	defaultValue?: JavaExpression;
};

export type JavaCompactConstructorDeclaration = {
	type: 'CompactConstructorDeclaration';
	modifiers: JavaModifier[];
	annotations: JavaAnnotationExpr[];
	typeParameters: JavaTypeParameter[];
	name: JavaSimpleName;
	thrownExceptions: JavaReferenceType[];
	body: JavaBlockStmt;
};

export type JavaBodyDeclaration =
	| JavaFieldDeclaration
	| JavaMethodDeclaration
	| JavaConstructorDeclaration
	| JavaInitializerDeclaration
	| JavaEnumConstantDeclaration
	| JavaAnnotationMemberDeclaration
	| JavaCompactConstructorDeclaration
	| JavaClassOrInterfaceDeclaration
	| JavaEnumDeclaration
	| JavaRecordDeclaration
	| JavaAnnotationDeclaration;

// Type declarations
export type JavaClassOrInterfaceDeclaration = {
	type: 'ClassOrInterfaceDeclaration';
	modifiers: JavaModifier[];
	annotations: JavaAnnotationExpr[];
	name: JavaSimpleName;
	isInterface: boolean;
	typeParameters: JavaTypeParameter[];
	extendedTypes: JavaClassOrInterfaceType[];
	implementedTypes: JavaClassOrInterfaceType[];
	permittedTypes: JavaClassOrInterfaceType[];
	members: JavaBodyDeclaration[];
};

export type JavaEnumDeclaration = {
	type: 'EnumDeclaration';
	modifiers: JavaModifier[];
	annotations: JavaAnnotationExpr[];
	name: JavaSimpleName;
	implementedTypes: JavaClassOrInterfaceType[];
	entries: JavaEnumConstantDeclaration[];
	members: JavaBodyDeclaration[];
};

export type JavaRecordDeclaration = {
	type: 'RecordDeclaration';
	modifiers: JavaModifier[];
	annotations: JavaAnnotationExpr[];
	name: JavaSimpleName;
	typeParameters: JavaTypeParameter[];
	parameters: JavaParameter[];
	implementedTypes: JavaClassOrInterfaceType[];
	members: JavaBodyDeclaration[];
};

export type JavaAnnotationDeclaration = {
	type: 'AnnotationDeclaration';
	modifiers: JavaModifier[];
	annotations: JavaAnnotationExpr[];
	name: JavaSimpleName;
	members: JavaBodyDeclaration[];
};

export type JavaTypeDeclaration =
	| JavaClassOrInterfaceDeclaration
	| JavaEnumDeclaration
	| JavaRecordDeclaration
	| JavaAnnotationDeclaration;

// Compilation unit (top-level)
export type JavaCompilationUnit = {
	type: 'CompilationUnit';
	packageDeclaration?: JavaPackageDeclaration;
	imports: JavaImportDeclaration[];
	types: JavaTypeDeclaration[];
};
