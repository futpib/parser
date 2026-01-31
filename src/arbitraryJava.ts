import * as fc from 'fast-check';

const javaKeywords = new Set([
	'abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char',
	'class', 'const', 'continue', 'default', 'do', 'double', 'else', 'enum',
	'extends', 'final', 'finally', 'float', 'for', 'goto', 'if', 'implements',
	'import', 'instanceof', 'int', 'interface', 'long', 'native', 'new',
	'package', 'private', 'protected', 'public', 'return', 'short', 'static',
	'strictfp', 'super', 'switch', 'synchronized', 'this', 'throw', 'throws',
	'transient', 'try', 'void', 'volatile', 'while', 'true', 'false', 'null',
	'sealed', 'non-sealed', 'record', 'yield', 'var',
]);

const arbitraryJavaIdentifier = fc.stringMatching(/^[a-zA-Z_][a-zA-Z0-9_]*$/).filter(
	id => !javaKeywords.has(id),
);

const arbitrarySimpleName = fc.record({
	type: fc.constant('SimpleName' as const),
	identifier: arbitraryJavaIdentifier,
});

const arbitraryName: fc.Arbitrary<{ type: 'Name'; identifier: string; qualifier?: unknown }> = fc.nat({ max: 2 }).chain(depth => {
	if (depth === 0) {
		return fc.record({
			type: fc.constant('Name' as const),
			identifier: arbitraryJavaIdentifier,
		});
	}

	return arbitraryJavaIdentifier.chain(identifier => {
		const buildQualifier = (d: number): fc.Arbitrary<{ type: 'Name'; identifier: string; qualifier?: unknown }> => {
			if (d === 0) {
				return fc.record({
					type: fc.constant('Name' as const),
					identifier: arbitraryJavaIdentifier,
				});
			}

			return fc.record({
				type: fc.constant('Name' as const),
				identifier: arbitraryJavaIdentifier,
				qualifier: buildQualifier(d - 1),
			});
		};

		return fc.record({
			type: fc.constant('Name' as const),
			identifier: fc.constant(identifier),
			qualifier: buildQualifier(depth - 1),
		});
	});
});

// Types

const arbitraryPrimitiveType = fc.record({
	type: fc.constant('PrimitiveType' as const),
	type_: fc.oneof(
		fc.constant('BOOLEAN' as const),
		fc.constant('BYTE' as const),
		fc.constant('CHAR' as const),
		fc.constant('DOUBLE' as const),
		fc.constant('FLOAT' as const),
		fc.constant('INT' as const),
		fc.constant('LONG' as const),
		fc.constant('SHORT' as const),
	),
	annotations: fc.constant([] as unknown[]),
});

const arbitraryVoidType = fc.record({
	type: fc.constant('VoidType' as const),
	annotations: fc.constant([] as unknown[]),
});

const arbitraryAnnotation = fc.record({
	type: fc.constant('MarkerAnnotationExpr' as const),
	name: arbitraryName,
});

type ClassOrInterfaceTypeShape = {
	type: 'ClassOrInterfaceType';
	name: { type: 'SimpleName'; identifier: string };
	scope?: ClassOrInterfaceTypeShape;
	typeArguments?: unknown[];
	annotations: unknown[];
};

const arbitraryClassOrInterfaceType: fc.Arbitrary<ClassOrInterfaceTypeShape> = fc.nat({ max: 1 }).chain(depth => {
	const buildType = (d: number): fc.Arbitrary<ClassOrInterfaceTypeShape> => {
		if (d === 0) {
			return fc.record({
				type: fc.constant('ClassOrInterfaceType' as const),
				name: arbitrarySimpleName,
				annotations: fc.constant([] as unknown[]),
			});
		}

		return fc.record({
			type: fc.constant('ClassOrInterfaceType' as const),
			scope: buildType(d - 1),
			name: arbitrarySimpleName,
			annotations: fc.constant([] as unknown[]),
		});
	};

	return buildType(depth);
});

// ClassOrInterfaceType with optional type arguments (for extends/implements)
const arbitraryClassOrInterfaceTypeWithTypeArgs: fc.Arbitrary<ClassOrInterfaceTypeShape> = fc.nat({ max: 1 }).chain(depth => {
	const buildType = (d: number): fc.Arbitrary<ClassOrInterfaceTypeShape> => {
		const baseFields = {
			type: fc.constant('ClassOrInterfaceType' as const),
			name: arbitrarySimpleName,
			annotations: fc.constant([] as unknown[]),
		};

		if (d === 0) {
			return fc.oneof(
				fc.record(baseFields),
				fc.record({
					...baseFields,
					typeArguments: fc.array(
						fc.oneof(
							arbitraryPrimitiveType,
							fc.record({
								type: fc.constant('ClassOrInterfaceType' as const),
								name: arbitrarySimpleName,
								annotations: fc.constant([] as unknown[]),
							}),
							fc.record({
								type: fc.constant('WildcardType' as const),
								annotations: fc.constant([] as unknown[]),
							}),
						),
						{ minLength: 1, maxLength: 2 },
					),
				}),
			);
		}

		return fc.record({
			...baseFields,
			scope: buildType(d - 1),
		});
	};

	return buildType(depth);
});

type JavaTypeShape = {
	type: string;
	[key: string]: unknown;
};

const arbitraryNonArrayType: fc.Arbitrary<JavaTypeShape> = fc.oneof(
	arbitraryPrimitiveType,
	arbitraryClassOrInterfaceType,
);

const arbitraryType: fc.Arbitrary<JavaTypeShape> = fc.oneof(
	{ weight: 3, arbitrary: arbitraryNonArrayType },
	{
		weight: 1,
		arbitrary: arbitraryNonArrayType.map(componentType => ({
			type: 'ArrayType' as const,
			componentType,
			origin: 'TYPE' as const,
			annotations: [],
		})),
	},
);

const arbitraryReturnType: fc.Arbitrary<JavaTypeShape> = fc.oneof(
	{ weight: 3, arbitrary: arbitraryType },
	{ weight: 1, arbitrary: arbitraryVoidType },
);

// Leaf expressions (used as operands in compound expressions to avoid precedence issues)

const arbitraryNameExpr = fc.record({
	type: fc.constant('NameExpr' as const),
	name: arbitrarySimpleName,
});

const arbitraryStringLiteralExpr = fc.record({
	type: fc.constant('StringLiteralExpr' as const),
	value: fc.stringMatching(/^[a-zA-Z0-9 ]*$/),
});

const arbitraryIntegerLiteralExpr = fc.record({
	type: fc.constant('IntegerLiteralExpr' as const),
	value: fc.nat({ max: 999 }).map(n => String(n)),
});

const arbitraryNullLiteralExpr = fc.record({
	type: fc.constant('NullLiteralExpr' as const),
});

const arbitraryBooleanLiteralExpr = fc.record({
	type: fc.constant('BooleanLiteralExpr' as const),
	value: fc.boolean(),
});

const arbitraryThisExpr = fc.record({
	type: fc.constant('ThisExpr' as const),
});

const arbitraryLeafExpression: fc.Arbitrary<unknown> = fc.oneof(
	arbitraryNameExpr,
	arbitraryStringLiteralExpr,
	arbitraryIntegerLiteralExpr,
	arbitraryNullLiteralExpr,
	arbitraryBooleanLiteralExpr,
	arbitraryThisExpr,
);

// Compound expressions (only use leaf operands)

const arbitraryMethodCallExpr: fc.Arbitrary<unknown> = fc.oneof(
	// Without scope
	fc.record({
		type: fc.constant('MethodCallExpr' as const),
		name: arbitrarySimpleName,
		arguments: fc.array(arbitraryLeafExpression, { maxLength: 2 }),
	}),
	// With scope
	fc.record({
		type: fc.constant('MethodCallExpr' as const),
		scope: arbitraryLeafExpression,
		name: arbitrarySimpleName,
		arguments: fc.array(arbitraryLeafExpression, { maxLength: 2 }),
	}),
);

const arbitraryFieldAccessExpr: fc.Arbitrary<unknown> = fc.record({
	type: fc.constant('FieldAccessExpr' as const),
	scope: arbitraryLeafExpression,
	name: arbitrarySimpleName,
});

const arbitraryEnclosedExpr: fc.Arbitrary<unknown> = fc.record({
	type: fc.constant('EnclosedExpr' as const),
	inner: arbitraryLeafExpression,
});

const arbitraryArrayAccessExpr: fc.Arbitrary<unknown> = fc.record({
	type: fc.constant('ArrayAccessExpr' as const),
	name: arbitraryLeafExpression,
	index: arbitraryLeafExpression,
});

const arbitraryObjectCreationExpr: fc.Arbitrary<unknown> = fc.oneof(
	fc.record({
		type: fc.constant('ObjectCreationExpr' as const),
		type_: arbitraryClassOrInterfaceType,
		arguments: fc.array(arbitraryLeafExpression, { maxLength: 2 }),
	}),
	// With diamond operator (empty typeArguments)
	fc.record({
		type: fc.constant('ObjectCreationExpr' as const),
		type_: arbitraryClassOrInterfaceType.map(t => ({
			...t,
			typeArguments: [] as unknown[],
		})),
		arguments: fc.array(arbitraryLeafExpression, { maxLength: 2 }),
	}),
);

const arbitraryPrimaryExpression: fc.Arbitrary<unknown> = fc.oneof(
	arbitraryLeafExpression,
	arbitraryMethodCallExpr,
	arbitraryFieldAccessExpr,
	arbitraryEnclosedExpr,
	arbitraryArrayAccessExpr,
	arbitraryObjectCreationExpr,
);

const arbitraryBinaryOperator = fc.oneof(
	fc.constant('PLUS'),
	fc.constant('MINUS'),
	fc.constant('MULTIPLY'),
	fc.constant('DIVIDE'),
	fc.constant('REMAINDER'),
	fc.constant('LESS'),
	fc.constant('GREATER'),
	fc.constant('LESS_EQUALS'),
	fc.constant('GREATER_EQUALS'),
	fc.constant('EQUALS'),
	fc.constant('NOT_EQUALS'),
	fc.constant('AND'),
	fc.constant('OR'),
);

const arbitraryBinaryExpr: fc.Arbitrary<unknown> = fc.record({
	type: fc.constant('BinaryExpr' as const),
	left: arbitraryLeafExpression,
	right: arbitraryLeafExpression,
	operator: arbitraryBinaryOperator,
});

// UnaryExpr in parser output has NO prefix field - operator encodes prefix/postfix
const arbitraryUnaryExpr: fc.Arbitrary<unknown> = fc.record({
	type: fc.constant('UnaryExpr' as const),
	operator: fc.oneof(
		fc.constant('PREFIX_INCREMENT'),
		fc.constant('PREFIX_DECREMENT'),
		fc.constant('POSTFIX_INCREMENT'),
		fc.constant('POSTFIX_DECREMENT'),
		fc.constant('MINUS'),
		fc.constant('PLUS'),
		fc.constant('LOGICAL_COMPLEMENT'),
	),
	expression: arbitraryLeafExpression,
});

const arbitraryAssignOperator = fc.oneof(
	fc.constant('ASSIGN'),
	fc.constant('PLUS'),
	fc.constant('MINUS'),
	fc.constant('MULTIPLY'),
	fc.constant('DIVIDE'),
);

const arbitraryAssignExpr: fc.Arbitrary<unknown> = fc.record({
	type: fc.constant('AssignExpr' as const),
	target: arbitraryNameExpr,
	value: arbitraryLeafExpression,
	operator: arbitraryAssignOperator,
});

const arbitraryConditionalExpr: fc.Arbitrary<unknown> = fc.record({
	type: fc.constant('ConditionalExpr' as const),
	condition: arbitraryLeafExpression,
	thenExpr: arbitraryLeafExpression,
	elseExpr: arbitraryLeafExpression,
});

const arbitraryCastExpr: fc.Arbitrary<unknown> = fc.record({
	type: fc.constant('CastExpr' as const),
	type_: arbitraryType,
	expression: arbitraryPrimaryExpression,
});

const arbitraryInstanceOfExpr: fc.Arbitrary<unknown> = fc.record({
	type: fc.constant('InstanceOfExpr' as const),
	expression: arbitraryLeafExpression,
	type_: fc.oneof(
		arbitraryClassOrInterfaceType as fc.Arbitrary<JavaTypeShape>,
		arbitraryNonArrayType.map(componentType => ({
			type: 'ArrayType' as const,
			componentType,
			origin: 'TYPE' as const,
			annotations: [] as unknown[],
		})),
	),
});

// Lambda expressions
const arbitraryLambdaExpr: fc.Arbitrary<unknown> = fc.oneof(
	// With parenthesized params
	fc.record({
		type: fc.constant('LambdaExpr' as const),
		parameters: fc.array(
			fc.record({
				type: fc.constant('Parameter' as const),
				annotations: fc.constant([]),
				modifiers: fc.constant([]),
				isVarArgs: fc.constant(false),
				varArgsAnnotations: fc.constant([]),
				name: arbitrarySimpleName,
				type_: fc.constant({ type: 'UnknownType', annotations: [] }),
			}),
			{ maxLength: 2 },
		),
		body: fc.oneof(
			// Expression body (wrapped in ExpressionStmt)
			arbitraryLeafExpression.map(expr => ({
				type: 'ExpressionStmt' as const,
				expression: expr,
			})),
			// Block body
			fc.constant({ type: 'BlockStmt' as const, statements: [] }),
		),
		isEnclosingParameters: fc.constant(true),
	}),
	// Single unparenthesized param
	fc.record({
		type: fc.constant('LambdaExpr' as const),
		parameters: arbitrarySimpleName.map(name => ([{
			type: 'Parameter' as const,
			annotations: [],
			modifiers: [],
			isVarArgs: false,
			varArgsAnnotations: [],
			name,
			type_: { type: 'UnknownType', annotations: [] },
		}])),
		body: fc.oneof(
			arbitraryLeafExpression.map(expr => ({
				type: 'ExpressionStmt' as const,
				expression: expr,
			})),
			fc.constant({ type: 'BlockStmt' as const, statements: [] }),
		),
		isEnclosingParameters: fc.constant(false),
	}),
);

const arbitraryExpression: fc.Arbitrary<unknown> = fc.oneof(
	{ weight: 4, arbitrary: arbitraryLeafExpression },
	{ weight: 1, arbitrary: arbitraryBinaryExpr },
	{ weight: 1, arbitrary: arbitraryUnaryExpr },
	{ weight: 1, arbitrary: arbitraryAssignExpr },
	{ weight: 1, arbitrary: arbitraryConditionalExpr },
	{ weight: 1, arbitrary: arbitraryCastExpr },
	{ weight: 1, arbitrary: arbitraryEnclosedExpr },
	{ weight: 1, arbitrary: arbitraryMethodCallExpr },
	{ weight: 1, arbitrary: arbitraryFieldAccessExpr },
	{ weight: 1, arbitrary: arbitraryObjectCreationExpr },
	{ weight: 1, arbitrary: arbitraryArrayAccessExpr },
	{ weight: 1, arbitrary: arbitraryInstanceOfExpr },
	{ weight: 1, arbitrary: arbitraryLambdaExpr },
);

// Variable declarations

const arbitraryVariableDeclarator: fc.Arbitrary<unknown> = fc.record({
	type: fc.constant('VariableDeclarator' as const),
	name: arbitrarySimpleName,
	type_: arbitraryType,
}).chain(base =>
	fc.oneof(
		fc.constant(base),
		arbitraryLeafExpression.map(init => ({
			...base,
			initializer: init,
		})),
	),
);

const arbitraryVariableDeclarationExpr: fc.Arbitrary<unknown> = arbitraryType.chain(type_ =>
	fc.record({
		type: fc.constant('VariableDeclarationExpr' as const),
		modifiers: fc.constant([]),
		annotations: fc.constant([]),
		variables: fc.array(
			fc.record({
				type: fc.constant('VariableDeclarator' as const),
				name: arbitrarySimpleName,
				type_: fc.constant(type_),
			}).chain(base =>
				fc.oneof(
					fc.constant(base),
					arbitraryLeafExpression.map(init => ({
						...base,
						initializer: init,
					})),
				),
			),
			{ minLength: 1, maxLength: 2 },
		),
	}),
);

// Statements

const arbitraryBlockStmt: fc.Arbitrary<unknown> = fc.record({
	type: fc.constant('BlockStmt' as const),
	statements: fc.constant([]),
});

const arbitraryExpressionStmt: fc.Arbitrary<unknown> = fc.record({
	type: fc.constant('ExpressionStmt' as const),
	expression: arbitraryExpression,
});

const arbitraryReturnStmt: fc.Arbitrary<unknown> = fc.oneof(
	fc.constant({ type: 'ReturnStmt' as const }),
	fc.record({
		type: fc.constant('ReturnStmt' as const),
		expression: arbitraryExpression,
	}),
);

const arbitraryThrowStmt: fc.Arbitrary<unknown> = fc.record({
	type: fc.constant('ThrowStmt' as const),
	expression: arbitraryExpression,
});

const arbitraryIfStmt: fc.Arbitrary<unknown> = fc.oneof(
	fc.record({
		type: fc.constant('IfStmt' as const),
		condition: arbitraryExpression,
		thenStmt: arbitraryBlockStmt,
	}),
	fc.record({
		type: fc.constant('IfStmt' as const),
		condition: arbitraryExpression,
		thenStmt: arbitraryBlockStmt,
		elseStmt: arbitraryBlockStmt,
	}),
);

const arbitraryForStmt: fc.Arbitrary<unknown> = fc.oneof(
	// Empty for
	fc.record({
		type: fc.constant('ForStmt' as const),
		initialization: fc.constant([]),
		update: fc.constant([]),
		body: arbitraryBlockStmt,
	}),
	// For with init and compare
	fc.record({
		type: fc.constant('ForStmt' as const),
		initialization: fc.array(arbitraryVariableDeclarationExpr, { minLength: 1, maxLength: 1 }),
		compare: arbitraryExpression,
		update: fc.array(arbitraryExpression, { maxLength: 2 }),
		body: arbitraryBlockStmt,
	}),
);

const arbitraryForEachStmt: fc.Arbitrary<unknown> = fc.record({
	type: fc.constant('ForEachStmt' as const),
	variable: arbitraryVariableDeclarationExpr,
	iterable: arbitraryExpression,
	body: arbitraryBlockStmt,
});

const arbitraryParameter: fc.Arbitrary<unknown> = fc.record({
	type: fc.constant('Parameter' as const),
	modifiers: fc.constant([]),
	annotations: fc.constant([]),
	type_: arbitraryType,
	isVarArgs: fc.constant(false),
	varArgsAnnotations: fc.constant([]),
	name: arbitrarySimpleName,
});

const arbitraryCatchClause: fc.Arbitrary<unknown> = fc.record({
	type: fc.constant('CatchClause' as const),
	parameter: arbitraryParameter,
	body: fc.record({
		type: fc.constant('BlockStmt' as const),
		statements: fc.constant([]),
	}),
});

const arbitraryTryStmt: fc.Arbitrary<unknown> = fc.oneof(
	// try-catch
	fc.record({
		type: fc.constant('TryStmt' as const),
		resources: fc.constant([]),
		tryBlock: fc.record({
			type: fc.constant('BlockStmt' as const),
			statements: fc.constant([]),
		}),
		catchClauses: fc.array(arbitraryCatchClause, { minLength: 1, maxLength: 2 }),
	}),
	// try-catch-finally
	fc.record({
		type: fc.constant('TryStmt' as const),
		resources: fc.constant([]),
		tryBlock: fc.record({
			type: fc.constant('BlockStmt' as const),
			statements: fc.constant([]),
		}),
		catchClauses: fc.array(arbitraryCatchClause, { maxLength: 1 }),
		finallyBlock: fc.record({
			type: fc.constant('BlockStmt' as const),
			statements: fc.constant([]),
		}),
	}),
	// try-with-resources
	fc.record({
		type: fc.constant('TryStmt' as const),
		resources: fc.array(arbitraryVariableDeclarationExpr, { minLength: 1, maxLength: 1 }),
		tryBlock: fc.record({
			type: fc.constant('BlockStmt' as const),
			statements: fc.constant([]),
		}),
		catchClauses: fc.constant([]),
	}),
);

const arbitrarySwitchEntry: fc.Arbitrary<unknown> = fc.oneof(
	// case
	fc.record({
		type: fc.constant('SwitchEntry' as const),
		isDefault: fc.constant(false),
		labels: fc.array(arbitraryExpression, { minLength: 1, maxLength: 1 }),
		statements: fc.constant([]),
		type_: fc.constant('STATEMENT_GROUP' as const),
	}),
	// default
	fc.record({
		type: fc.constant('SwitchEntry' as const),
		isDefault: fc.constant(true),
		labels: fc.constant([]),
		statements: fc.constant([]),
		type_: fc.constant('STATEMENT_GROUP' as const),
	}),
);

const arbitrarySwitchStmt: fc.Arbitrary<unknown> = fc.record({
	type: fc.constant('SwitchStmt' as const),
	selector: arbitraryExpression,
	entries: fc.array(arbitrarySwitchEntry, { maxLength: 3 }),
});

const arbitraryExplicitConstructorInvocationStmt: fc.Arbitrary<unknown> = fc.record({
	type: fc.constant('ExplicitConstructorInvocationStmt' as const),
	isThis: fc.boolean(),
	arguments: fc.array(arbitraryLeafExpression, { maxLength: 2 }),
});

const arbitraryLocalVarDeclStmt: fc.Arbitrary<unknown> = fc.record({
	type: fc.constant('ExpressionStmt' as const),
	expression: arbitraryVariableDeclarationExpr,
});

const arbitraryStatement: fc.Arbitrary<unknown> = fc.oneof(
	{ weight: 2, arbitrary: arbitraryBlockStmt },
	{ weight: 2, arbitrary: arbitraryExpressionStmt },
	{ weight: 2, arbitrary: arbitraryReturnStmt },
	{ weight: 1, arbitrary: arbitraryThrowStmt },
	{ weight: 1, arbitrary: arbitraryIfStmt },
	{ weight: 1, arbitrary: arbitraryForStmt },
	{ weight: 1, arbitrary: arbitraryForEachStmt },
	{ weight: 1, arbitrary: arbitraryTryStmt },
	{ weight: 1, arbitrary: arbitrarySwitchStmt },
	{ weight: 1, arbitrary: arbitraryExplicitConstructorInvocationStmt },
	{ weight: 1, arbitrary: arbitraryLocalVarDeclStmt },
);

// Body declarations

const arbitraryModifier = fc.record({
	type: fc.constant('Modifier' as const),
	keyword: fc.oneof(
		fc.constant('PUBLIC' as const),
		fc.constant('PROTECTED' as const),
		fc.constant('PRIVATE' as const),
		fc.constant('STATIC' as const),
		fc.constant('FINAL' as const),
		fc.constant('ABSTRACT' as const),
	),
});

const arbitraryFieldDeclaration: fc.Arbitrary<unknown> = arbitraryType.chain(type_ =>
	fc.record({
		type: fc.constant('FieldDeclaration' as const),
		modifiers: fc.array(arbitraryModifier, { maxLength: 2 }),
		annotations: fc.array(arbitraryAnnotation, { maxLength: 1 }),
		variables: fc.array(
			fc.record({
				type: fc.constant('VariableDeclarator' as const),
				name: arbitrarySimpleName,
				type_: fc.constant(type_),
			}).chain(base =>
				fc.oneof(
					fc.constant(base),
					arbitraryLeafExpression.map(init => ({
						...base,
						initializer: init,
					})),
				),
			),
			{ minLength: 1, maxLength: 2 },
		),
	}),
);

const arbitraryMethodDeclaration: fc.Arbitrary<unknown> = fc.oneof(
	// Method with body
	fc.record({
		type: fc.constant('MethodDeclaration' as const),
		modifiers: fc.array(arbitraryModifier, { maxLength: 2 }),
		annotations: fc.array(arbitraryAnnotation, { maxLength: 1 }),
		typeParameters: fc.constant([]),
		type_: arbitraryReturnType,
		name: arbitrarySimpleName,
		parameters: fc.array(arbitraryParameter, { maxLength: 2 }),
		thrownExceptions: fc.constant([]),
		body: fc.record({
			type: fc.constant('BlockStmt' as const),
			statements: fc.array(arbitraryStatement, { maxLength: 2 }),
		}),
	}),
	// Abstract method (no body)
	fc.record({
		type: fc.constant('MethodDeclaration' as const),
		modifiers: fc.array(arbitraryModifier, { maxLength: 2 }),
		annotations: fc.array(arbitraryAnnotation, { maxLength: 1 }),
		typeParameters: fc.constant([]),
		type_: arbitraryReturnType,
		name: arbitrarySimpleName,
		parameters: fc.array(arbitraryParameter, { maxLength: 2 }),
		thrownExceptions: fc.constant([]),
	}),
);

const arbitraryConstructorDeclaration: fc.Arbitrary<unknown> = fc.record({
	type: fc.constant('ConstructorDeclaration' as const),
	modifiers: fc.array(arbitraryModifier, { maxLength: 1 }),
	annotations: fc.constant([]),
	typeParameters: fc.constant([]),
	name: arbitrarySimpleName,
	parameters: fc.array(arbitraryParameter, { maxLength: 2 }),
	thrownExceptions: fc.constant([]),
	body: fc.record({
		type: fc.constant('BlockStmt' as const),
		statements: fc.array(arbitraryStatement, { maxLength: 2 }),
	}),
});

const arbitraryBodyDeclaration: fc.Arbitrary<unknown> = fc.oneof(
	{ weight: 2, arbitrary: arbitraryFieldDeclaration },
	{ weight: 2, arbitrary: arbitraryMethodDeclaration },
	{ weight: 1, arbitrary: arbitraryConstructorDeclaration },
);

// Type declarations

const arbitraryEnumDeclaration: fc.Arbitrary<unknown> = fc.record({
	type: fc.constant('EnumDeclaration' as const),
	modifiers: fc.array(arbitraryModifier, { maxLength: 2 }),
	annotations: fc.array(arbitraryAnnotation, { maxLength: 1 }),
	name: arbitrarySimpleName,
	implementedTypes: fc.constant([]),
	entries: fc.constant([]),
	members: fc.constant([]),
});

const arbitraryClassOrInterfaceDeclaration: fc.Arbitrary<unknown> = fc.boolean().chain(isInterface =>
	fc.record({
		type: fc.constant('ClassOrInterfaceDeclaration' as const),
		modifiers: fc.array(arbitraryModifier, { maxLength: 2 }),
		annotations: fc.array(arbitraryAnnotation, { maxLength: 1 }),
		name: arbitrarySimpleName,
		isInterface: fc.constant(isInterface),
		typeParameters: fc.oneof(
			fc.constant([]),
			fc.array(
				fc.record({
					type: fc.constant('TypeParameter' as const),
					annotations: fc.constant([]),
					name: arbitrarySimpleName,
					typeBound: fc.constant([]),
				}),
				{ minLength: 1, maxLength: 2 },
			),
		),
		extendedTypes: fc.oneof(
			fc.constant([]),
			fc.array(arbitraryClassOrInterfaceTypeWithTypeArgs, { minLength: 1, maxLength: 1 }),
		),
		// Interfaces always have implementedTypes: [] (parser outputs empty array for interfaces)
		implementedTypes: isInterface
			? fc.constant([])
			: fc.oneof(
				fc.constant([]),
				fc.array(arbitraryClassOrInterfaceTypeWithTypeArgs, { minLength: 1, maxLength: 2 }),
			),
		permittedTypes: fc.constant([]),
		members: fc.array(arbitraryBodyDeclaration, { maxLength: 3 }),
	}),
);

const arbitraryTypeDeclaration: fc.Arbitrary<unknown> = fc.oneof(
	{ weight: 3, arbitrary: arbitraryClassOrInterfaceDeclaration },
	{ weight: 1, arbitrary: arbitraryEnumDeclaration },
);

// Import declaration

const arbitraryImportDeclaration = fc.record({
	type: fc.constant('ImportDeclaration' as const),
	isStatic: fc.boolean(),
	isAsterisk: fc.boolean(),
	name: arbitraryName,
});

// Package declaration

const arbitraryPackageDeclaration = fc.record({
	type: fc.constant('PackageDeclaration' as const),
	annotations: fc.array(arbitraryAnnotation, { maxLength: 1 }),
	name: arbitraryName,
});

// Compilation unit

export const arbitraryJavaCompilationUnit = fc.record({
	type: fc.constant('CompilationUnit' as const),
	packageDeclaration: fc.option(arbitraryPackageDeclaration, { nil: undefined }),
	imports: fc.array(arbitraryImportDeclaration, { maxLength: 2 }),
	types: fc.array(arbitraryTypeDeclaration, { minLength: 1, maxLength: 2 }),
});
