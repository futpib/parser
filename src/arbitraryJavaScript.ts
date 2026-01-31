import * as fc from 'fast-check';
import { type JavaScriptProgram, type StripMeta } from './javaScriptParser.js';
import type * as estree from 'estree';

type Expression = StripMeta<estree.Expression>;
type Statement = StripMeta<estree.Statement>;
type Identifier = StripMeta<estree.Identifier>;

const jsKeywords = new Set([
	'abstract', 'arguments', 'await', 'boolean', 'break', 'byte', 'case', 'catch',
	'char', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do',
	'double', 'else', 'enum', 'eval', 'export', 'extends', 'false', 'final',
	'finally', 'float', 'for', 'function', 'goto', 'if', 'implements', 'import',
	'in', 'instanceof', 'int', 'interface', 'let', 'long', 'native', 'new',
	'null', 'package', 'private', 'protected', 'public', 'return', 'short',
	'static', 'super', 'switch', 'synchronized', 'this', 'throw', 'throws',
	'transient', 'true', 'try', 'typeof', 'var', 'void', 'volatile', 'while',
	'with', 'yield', 'undefined', 'NaN', 'Infinity',
]);

const arbitraryIdentifierName = fc.stringMatching(/^[a-zA-Z_$][a-zA-Z0-9_$]*$/).filter(
	id => !jsKeywords.has(id),
);

const arbitraryIdentifier: fc.Arbitrary<Identifier> = fc.record({
	type: fc.constant('Identifier' as const),
	name: arbitraryIdentifierName,
});

const arbitraryStringLiteral = fc.record({
	type: fc.constant('Literal' as const),
	value: fc.stringMatching(/^[a-zA-Z0-9 ]*$/),
});

const arbitraryNumberLiteral = fc.record({
	type: fc.constant('Literal' as const),
	value: fc.integer({ min: 0, max: 999 }),
});

const arbitraryBooleanLiteral = fc.record({
	type: fc.constant('Literal' as const),
	value: fc.boolean(),
});

const arbitraryNullLiteral = fc.record({
	type: fc.constant('Literal' as const),
	value: fc.constant(null),
});

const arbitraryThisExpression = fc.record({
	type: fc.constant('ThisExpression' as const),
});

const arbitraryLeafExpression: fc.Arbitrary<Expression> = fc.oneof(
	arbitraryIdentifier as fc.Arbitrary<Expression>,
	arbitraryStringLiteral as fc.Arbitrary<Expression>,
	arbitraryNumberLiteral as fc.Arbitrary<Expression>,
	arbitraryBooleanLiteral as fc.Arbitrary<Expression>,
	arbitraryNullLiteral as fc.Arbitrary<Expression>,
	arbitraryThisExpression as fc.Arbitrary<Expression>,
);

const safeBinaryOperators: Array<estree.BinaryOperator> = [
	'==', '!=', '===', '!==', '<', '<=', '>', '>=',
	'<<', '>>', '>>>',
	'+', '-', '*', '/', '%', '**',
	'|', '^', '&',
	'instanceof',
];

const arbitraryBinaryExpression = fc.record({
	type: fc.constant('BinaryExpression' as const),
	operator: fc.oneof(...safeBinaryOperators.map(op => fc.constant(op))),
	left: arbitraryLeafExpression,
	right: arbitraryLeafExpression,
});

const arbitraryLogicalExpression = fc.record({
	type: fc.constant('LogicalExpression' as const),
	operator: fc.oneof(
		fc.constant('||' as const),
		fc.constant('&&' as const),
		fc.constant('??' as const),
	),
	left: arbitraryLeafExpression,
	right: arbitraryLeafExpression,
});

const safeUnaryOperators: Array<estree.UnaryOperator> = [
	'-', '+', '!', '~', 'typeof', 'void',
];

const arbitraryUnaryExpression = fc.record({
	type: fc.constant('UnaryExpression' as const),
	operator: fc.oneof(...safeUnaryOperators.map(op => fc.constant(op))),
	prefix: fc.constant(true as const),
	argument: arbitraryLeafExpression,
});

const arbitraryUpdateExpression = fc.record({
	type: fc.constant('UpdateExpression' as const),
	operator: fc.oneof(
		fc.constant('++' as const),
		fc.constant('--' as const),
	),
	argument: arbitraryIdentifier as fc.Arbitrary<Expression>,
	prefix: fc.boolean(),
});

const arbitraryAssignmentExpression = fc.record({
	type: fc.constant('AssignmentExpression' as const),
	operator: fc.constant('=' as const),
	left: arbitraryIdentifier,
	right: arbitraryLeafExpression,
});

const arbitraryConditionalExpression = fc.record({
	type: fc.constant('ConditionalExpression' as const),
	test: arbitraryLeafExpression,
	consequent: arbitraryLeafExpression,
	alternate: arbitraryLeafExpression,
});

const arbitraryCallExpression = fc.record({
	type: fc.constant('CallExpression' as const),
	callee: arbitraryIdentifier as fc.Arbitrary<Expression>,
	arguments: fc.array(arbitraryLeafExpression, { minLength: 0, maxLength: 3 }),
	optional: fc.constant(false),
});

const arbitraryMemberExpression = fc.record({
	type: fc.constant('MemberExpression' as const),
	object: arbitraryIdentifier as fc.Arbitrary<Expression>,
	property: arbitraryIdentifier as fc.Arbitrary<Expression>,
	computed: fc.constant(false),
	optional: fc.constant(false),
});

const arbitraryArrayExpression = fc.record({
	type: fc.constant('ArrayExpression' as const),
	elements: fc.array(arbitraryLeafExpression, { minLength: 0, maxLength: 3 }),
});

const arbitraryProperty = fc.record({
	type: fc.constant('Property' as const),
	key: arbitraryIdentifier as fc.Arbitrary<Expression>,
	value: arbitraryLeafExpression,
	kind: fc.constant('init' as const),
	method: fc.constant(false),
	shorthand: fc.constant(false),
	computed: fc.constant(false),
});

const arbitraryObjectExpression = fc.record({
	type: fc.constant('ObjectExpression' as const),
	properties: fc.array(arbitraryProperty, { minLength: 0, maxLength: 3 }),
});

const arbitraryNewExpression = fc.record({
	type: fc.constant('NewExpression' as const),
	callee: arbitraryIdentifier as fc.Arbitrary<Expression>,
	arguments: fc.array(arbitraryLeafExpression, { minLength: 0, maxLength: 3 }),
});

const arbitraryExpression: fc.Arbitrary<Expression> = fc.oneof(
	{ weight: 5, arbitrary: arbitraryLeafExpression },
	{ weight: 2, arbitrary: arbitraryBinaryExpression as fc.Arbitrary<Expression> },
	{ weight: 2, arbitrary: arbitraryLogicalExpression as fc.Arbitrary<Expression> },
	{ weight: 2, arbitrary: arbitraryUnaryExpression as fc.Arbitrary<Expression> },
	{ weight: 1, arbitrary: arbitraryUpdateExpression as fc.Arbitrary<Expression> },
	{ weight: 1, arbitrary: arbitraryAssignmentExpression as fc.Arbitrary<Expression> },
	{ weight: 1, arbitrary: arbitraryConditionalExpression as fc.Arbitrary<Expression> },
	{ weight: 2, arbitrary: arbitraryCallExpression as fc.Arbitrary<Expression> },
	{ weight: 1, arbitrary: arbitraryMemberExpression as fc.Arbitrary<Expression> },
	{ weight: 1, arbitrary: arbitraryArrayExpression as fc.Arbitrary<Expression> },
	{ weight: 1, arbitrary: arbitraryObjectExpression as fc.Arbitrary<Expression> },
	{ weight: 1, arbitrary: arbitraryNewExpression as fc.Arbitrary<Expression> },
);

const arbitraryExpressionStatement: fc.Arbitrary<Statement> = arbitraryExpression
	.filter(expr => {
		if (expr.type === 'Literal' && typeof (expr as { value: unknown }).value === 'string') {
			return false;
		}

		if (expr.type === 'ObjectExpression') {
			return false;
		}

		return true;
	})
	.map(expression => ({
		type: 'ExpressionStatement' as const,
		expression,
	}));

const arbitraryVariableDeclaration: fc.Arbitrary<Statement> = fc.record({
	type: fc.constant('VariableDeclaration' as const),
	kind: fc.constant('var' as const),
	declarations: fc.array(
		fc.record({
			type: fc.constant('VariableDeclarator' as const),
			id: arbitraryIdentifier,
			init: fc.oneof(
				fc.constant(null),
				arbitraryLeafExpression,
			),
		}),
		{ minLength: 1, maxLength: 3 },
	),
});

const arbitraryReturnStatement: fc.Arbitrary<Statement> = fc.record({
	type: fc.constant('ReturnStatement' as const),
	argument: fc.oneof(
		fc.constant(null),
		arbitraryLeafExpression,
	),
});

const arbitraryEmptyStatement: fc.Arbitrary<Statement> = fc.record({
	type: fc.constant('EmptyStatement' as const),
});

const arbitraryThrowStatement: fc.Arbitrary<Statement> = fc.record({
	type: fc.constant('ThrowStatement' as const),
	argument: arbitraryLeafExpression,
});

const arbitrarySimpleNonFunctionStatement: fc.Arbitrary<Statement> = fc.oneof(
	{ weight: 3, arbitrary: arbitraryExpressionStatement },
	{ weight: 2, arbitrary: arbitraryVariableDeclaration },
	{ weight: 1, arbitrary: arbitraryEmptyStatement },
	{ weight: 1, arbitrary: arbitraryThrowStatement },
);

const arbitrarySimpleBlockStatement = fc.record({
	type: fc.constant('BlockStatement' as const),
	body: fc.array(arbitrarySimpleNonFunctionStatement, { minLength: 0, maxLength: 3 }),
});

const arbitraryFunctionBodyStatement: fc.Arbitrary<Statement> = fc.oneof(
	{ weight: 3, arbitrary: arbitraryExpressionStatement },
	{ weight: 2, arbitrary: arbitraryVariableDeclaration },
	{ weight: 2, arbitrary: arbitraryReturnStatement },
	{ weight: 1, arbitrary: arbitraryEmptyStatement },
	{ weight: 1, arbitrary: arbitraryThrowStatement },
);

const arbitraryFunctionBodyBlockStatement = fc.record({
	type: fc.constant('BlockStatement' as const),
	body: fc.array(arbitraryFunctionBodyStatement, { minLength: 0, maxLength: 3 }),
});

const arbitraryArrowFunctionExpression = fc.oneof(
	fc.record({
		type: fc.constant('ArrowFunctionExpression' as const),
		id: fc.constant(null),
		params: fc.array(arbitraryIdentifier, { minLength: 0, maxLength: 3 }),
		body: arbitraryFunctionBodyBlockStatement,
		expression: fc.constant(false),
		generator: fc.constant(false),
		async: fc.constant(false),
	}),
	fc.record({
		type: fc.constant('ArrowFunctionExpression' as const),
		id: fc.constant(null),
		params: fc.array(arbitraryIdentifier, { minLength: 0, maxLength: 3 }),
		body: arbitraryLeafExpression,
		expression: fc.constant(true),
		generator: fc.constant(false),
		async: fc.constant(false),
	}),
);

const arbitraryFunctionExpression = fc.record({
	type: fc.constant('FunctionExpression' as const),
	id: fc.constant(null),
	params: fc.array(arbitraryIdentifier, { minLength: 0, maxLength: 3 }),
	body: arbitraryFunctionBodyBlockStatement,
	expression: fc.constant(false),
	generator: fc.constant(false),
	async: fc.constant(false),
});

const arbitraryIfStatement: fc.Arbitrary<Statement> = fc.record({
	type: fc.constant('IfStatement' as const),
	test: arbitraryLeafExpression,
	consequent: arbitrarySimpleBlockStatement as fc.Arbitrary<Statement>,
	alternate: fc.oneof(
		fc.constant(null),
		arbitrarySimpleBlockStatement as fc.Arbitrary<Statement>,
	),
});

const arbitraryWhileStatement: fc.Arbitrary<Statement> = fc.record({
	type: fc.constant('WhileStatement' as const),
	test: arbitraryLeafExpression,
	body: arbitrarySimpleBlockStatement as fc.Arbitrary<Statement>,
});

const arbitraryForStatement: fc.Arbitrary<Statement> = fc.record({
	type: fc.constant('ForStatement' as const),
	init: fc.oneof(
		fc.constant(null),
		fc.record({
			type: fc.constant('VariableDeclaration' as const),
			kind: fc.constant('let' as const),
			declarations: fc.tuple(
				fc.record({
					type: fc.constant('VariableDeclarator' as const),
					id: arbitraryIdentifier,
					init: fc.oneof(
						fc.constant(null),
						arbitraryNumberLiteral as fc.Arbitrary<Expression>,
					),
				}),
			).map(([decl]) => [decl]),
		}),
	),
	test: fc.oneof(
		fc.constant(null),
		arbitraryLeafExpression,
	),
	update: fc.oneof(
		fc.constant(null),
		arbitraryLeafExpression,
	),
	body: arbitrarySimpleBlockStatement as fc.Arbitrary<Statement>,
});

const arbitraryCatchClause = fc.record({
	type: fc.constant('CatchClause' as const),
	param: fc.oneof(
		fc.constant(null),
		arbitraryIdentifier,
	),
	body: arbitrarySimpleBlockStatement,
});

const arbitraryTryStatement: fc.Arbitrary<Statement> = fc.oneof(
	fc.record({
		type: fc.constant('TryStatement' as const),
		block: arbitrarySimpleBlockStatement,
		handler: arbitraryCatchClause,
		finalizer: fc.oneof(
			fc.constant(null),
			arbitrarySimpleBlockStatement,
		),
	}),
	fc.record({
		type: fc.constant('TryStatement' as const),
		block: arbitrarySimpleBlockStatement,
		handler: fc.constant(null),
		finalizer: arbitrarySimpleBlockStatement,
	}),
);

const arbitraryFunctionDeclaration: fc.Arbitrary<Statement> = fc.record({
	type: fc.constant('FunctionDeclaration' as const),
	id: arbitraryIdentifier,
	params: fc.array(arbitraryIdentifier, { minLength: 0, maxLength: 3 }),
	body: arbitraryFunctionBodyBlockStatement,
	expression: fc.constant(false),
	generator: fc.constant(false),
	async: fc.constant(false),
});

const arbitraryTopLevelExpressionStatement: fc.Arbitrary<Statement> = fc.oneof(
	arbitraryExpression,
	arbitraryArrowFunctionExpression as fc.Arbitrary<Expression>,
	arbitraryFunctionExpression as fc.Arbitrary<Expression>,
)
	.filter(expr => {
		if (expr.type === 'Literal' && typeof (expr as { value: unknown }).value === 'string') {
			return false;
		}

		if (expr.type === 'ObjectExpression') {
			return false;
		}

		if (expr.type === 'FunctionExpression') {
			return false;
		}

		return true;
	})
	.map(expression => ({
		type: 'ExpressionStatement' as const,
		expression,
	}));

const arbitraryStatement: fc.Arbitrary<Statement> = fc.oneof(
	{ weight: 3, arbitrary: arbitraryTopLevelExpressionStatement },
	{ weight: 2, arbitrary: arbitraryVariableDeclaration },
	{ weight: 2, arbitrary: arbitraryIfStatement },
	{ weight: 1, arbitrary: arbitraryWhileStatement },
	{ weight: 1, arbitrary: arbitraryForStatement },
	{ weight: 1, arbitrary: arbitraryEmptyStatement },
	{ weight: 1, arbitrary: arbitraryFunctionDeclaration },
	{ weight: 1, arbitrary: arbitraryThrowStatement },
	{ weight: 1, arbitrary: arbitraryTryStatement },
);

export const arbitraryJavaScriptProgram: fc.Arbitrary<JavaScriptProgram> = fc.record({
	type: fc.constant('Program' as const),
	sourceType: fc.constant('script' as const),
	body: fc.array(arbitraryStatement, { minLength: 0, maxLength: 5 }),
});
