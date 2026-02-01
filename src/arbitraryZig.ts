import * as fc from 'fast-check';
import {
	type ZigRoot,
	type ZigExpression,
	type ZigTypeExpression,
	type ZigStatement,
	type ZigFnParam,
	type ZigContainerMember,
	type ZigBlockExpr,
} from './zig.js';

const zigKeywords = new Set([
	'addrspace', 'align', 'allowzero', 'and', 'anyframe', 'anytype',
	'asm', 'async', 'await', 'break', 'callconv', 'catch', 'comptime',
	'const', 'continue', 'defer', 'else', 'enum', 'errdefer', 'error',
	'export', 'extern', 'false', 'fn', 'for', 'if', 'inline',
	'linksection', 'noalias', 'nosuspend', 'null', 'opaque', 'or',
	'orelse', 'packed', 'pub', 'resume', 'return', 'struct',
	'suspend', 'switch', 'test', 'threadlocal', 'true', 'try',
	'undefined', 'union', 'unreachable', 'var', 'volatile', 'while',
]);

const arbitraryZigIdentifier = fc.stringMatching(/^[a-zA-Z_][a-zA-Z0-9_]*$/).filter(
	id => !zigKeywords.has(id),
);

// Leaf expressions - safe to use as operands without precedence issues

const arbitraryIdentifier: fc.Arbitrary<ZigExpression> = fc.record({
	type: fc.constant('Identifier' as const),
	name: arbitraryZigIdentifier,
});

const arbitraryIntegerLiteral: fc.Arbitrary<ZigExpression> = fc.record({
	type: fc.constant('IntegerLiteral' as const),
	value: fc.nat({ max: 999 }).map(n => String(n)),
});

const arbitraryStringLiteral: fc.Arbitrary<ZigExpression> = fc.record({
	type: fc.constant('StringLiteral' as const),
	value: fc.oneof(
		fc.stringMatching(/^[a-zA-Z0-9 ]*$/),
		fc.constantFrom('hello\nworld', 'tab\there', 'back\\slash', 'quote\ttab\nnewline'),
	),
});

const arbitraryCharLiteral: fc.Arbitrary<ZigExpression> = fc.record({
	type: fc.constant('CharLiteral' as const),
	value: fc.stringMatching(/^[a-zA-Z0-9]$/),
});

const arbitraryEnumLiteral: fc.Arbitrary<ZigExpression> = fc.record({
	type: fc.constant('EnumLiteral' as const),
	name: arbitraryZigIdentifier,
});

const arbitraryBoolLiteral: fc.Arbitrary<ZigExpression> = fc.record({
	type: fc.constant('BoolLiteral' as const),
	value: fc.boolean(),
});

const arbitraryNullLiteral: fc.Arbitrary<ZigExpression> = fc.constant({
	type: 'NullLiteral' as const,
});

const arbitraryUndefinedLiteral: fc.Arbitrary<ZigExpression> = fc.constant({
	type: 'UndefinedLiteral' as const,
});

const arbitraryLeafExpression: fc.Arbitrary<ZigExpression> = fc.oneof(
	{ weight: 3, arbitrary: arbitraryIdentifier },
	{ weight: 2, arbitrary: arbitraryIntegerLiteral },
	{ weight: 1, arbitrary: arbitraryStringLiteral },
	{ weight: 1, arbitrary: arbitraryCharLiteral },
	{ weight: 1, arbitrary: arbitraryEnumLiteral },
	{ weight: 1, arbitrary: arbitraryBoolLiteral },
	{ weight: 1, arbitrary: arbitraryNullLiteral },
	{ weight: 1, arbitrary: arbitraryUndefinedLiteral },
);

// Type expressions (simple ones for use in declarations)

const arbitrarySimpleTypeExpression: fc.Arbitrary<ZigTypeExpression> = arbitraryIdentifier as fc.Arbitrary<ZigTypeExpression>;

const arbitraryOptionalType: fc.Arbitrary<ZigTypeExpression> = fc.record({
	type: fc.constant('OptionalType' as const),
	child: arbitrarySimpleTypeExpression,
});

const arbitraryPointerType: fc.Arbitrary<ZigTypeExpression> = fc.record({
	type: fc.constant('PointerType' as const),
	size: fc.oneof(
		fc.constant('one' as const),
		fc.constant('many' as const),
		fc.constant('slice' as const),
	),
	isConst: fc.boolean(),
	child: arbitrarySimpleTypeExpression,
});

const arbitraryErrorUnionType: fc.Arbitrary<ZigTypeExpression> = fc.record({
	type: fc.constant('ErrorUnionType' as const),
	error: arbitrarySimpleTypeExpression,
	payload: arbitrarySimpleTypeExpression,
});

const arbitraryTypeExpression: fc.Arbitrary<ZigTypeExpression> = fc.oneof(
	{ weight: 4, arbitrary: arbitrarySimpleTypeExpression },
	{ weight: 1, arbitrary: arbitraryOptionalType },
	{ weight: 1, arbitrary: arbitraryPointerType },
	{ weight: 1, arbitrary: arbitraryErrorUnionType },
);

// Compound expressions (use leaf operands to avoid precedence issues)

const arbitraryBuiltinCallExpr: fc.Arbitrary<ZigExpression> = fc.record({
	type: fc.constant('BuiltinCallExpr' as const),
	name: arbitraryZigIdentifier,
	args: fc.array(arbitraryLeafExpression, { maxLength: 2 }),
});

const arbitraryFieldAccessExpr: fc.Arbitrary<ZigExpression> = fc.record({
	type: fc.constant('FieldAccessExpr' as const),
	operand: arbitraryIdentifier,
	member: arbitraryZigIdentifier,
});

const arbitraryCallExpr: fc.Arbitrary<ZigExpression> = fc.record({
	type: fc.constant('CallExpr' as const),
	callee: arbitraryIdentifier,
	args: fc.array(arbitraryLeafExpression, { maxLength: 2 }),
});

const arbitraryIndexExpr: fc.Arbitrary<ZigExpression> = fc.record({
	type: fc.constant('IndexExpr' as const),
	operand: arbitraryIdentifier,
	index: arbitraryLeafExpression,
});

const arbitraryGroupedExpr: fc.Arbitrary<ZigExpression> = fc.record({
	type: fc.constant('GroupedExpr' as const),
	inner: arbitraryLeafExpression,
});

const arbitraryErrorSetExpr: fc.Arbitrary<ZigExpression> = fc.record({
	type: fc.constant('ErrorSetExpr' as const),
	names: fc.array(arbitraryZigIdentifier, { minLength: 1, maxLength: 3 }),
});

const arbitraryStructInitExpr: fc.Arbitrary<ZigExpression> = fc.record({
	type: fc.constant('StructInitExpr' as const),
	fields: fc.array(
		fc.record({
			type: fc.constant('StructInitField' as const),
			name: arbitraryZigIdentifier,
			value: arbitraryLeafExpression,
		}),
		{ maxLength: 3 },
	),
});

const arbitraryArrayInitExpr: fc.Arbitrary<ZigExpression> = fc.record({
	type: fc.constant('ArrayInitExpr' as const),
	elements: fc.array(arbitraryLeafExpression, { maxLength: 3 }),
});

const arbitraryExpression: fc.Arbitrary<ZigExpression> = fc.oneof(
	{ weight: 5, arbitrary: arbitraryLeafExpression },
	{ weight: 1, arbitrary: arbitraryBuiltinCallExpr },
	{ weight: 1, arbitrary: arbitraryFieldAccessExpr },
	{ weight: 1, arbitrary: arbitraryCallExpr },
	{ weight: 1, arbitrary: arbitraryIndexExpr },
	{ weight: 1, arbitrary: arbitraryGroupedExpr },
	{ weight: 1, arbitrary: arbitraryErrorSetExpr },
	{ weight: 1, arbitrary: arbitraryStructInitExpr },
	{ weight: 1, arbitrary: arbitraryArrayInitExpr },
);

// Expressions safe to use in statement positions (don't start with keywords,
// which would cause the parser's while/for/block label detector to throw
// a non-recoverable error from zigIdentifierParser).
const arbitraryNonKeywordLeafExpression: fc.Arbitrary<ZigExpression> = fc.oneof(
	{ weight: 3, arbitrary: arbitraryIdentifier },
	{ weight: 2, arbitrary: arbitraryIntegerLiteral },
	{ weight: 1, arbitrary: arbitraryStringLiteral },
	{ weight: 1, arbitrary: arbitraryCharLiteral },
	{ weight: 1, arbitrary: arbitraryEnumLiteral },
);

const arbitraryStatementSafeExpression: fc.Arbitrary<ZigExpression> = fc.oneof(
	{ weight: 5, arbitrary: arbitraryNonKeywordLeafExpression },
	{ weight: 1, arbitrary: arbitraryBuiltinCallExpr },
	{ weight: 1, arbitrary: arbitraryFieldAccessExpr },
	{ weight: 1, arbitrary: arbitraryCallExpr },
	{ weight: 1, arbitrary: arbitraryIndexExpr },
	{ weight: 1, arbitrary: arbitraryGroupedExpr },
);

// Statements

// Expression statements are bare expressions (no wrapper)
const arbitraryExprStmt: fc.Arbitrary<ZigStatement> = arbitraryStatementSafeExpression as fc.Arbitrary<ZigStatement>;

const arbitraryReturnStmt: fc.Arbitrary<ZigStatement> = fc.oneof(
	fc.constant({ type: 'ReturnStmt' as const }),
	fc.record({
		type: fc.constant('ReturnStmt' as const),
		value: arbitraryLeafExpression,
	}),
);

const arbitraryBreakStmt: fc.Arbitrary<ZigStatement> = fc.constant({
	type: 'BreakStmt' as const,
});

const arbitraryContinueStmt: fc.Arbitrary<ZigStatement> = fc.constant({
	type: 'ContinueStmt' as const,
});

const arbitraryVarDeclStmt: fc.Arbitrary<ZigStatement> = fc.record({
	type: fc.constant('VarDecl' as const),
	isConst: fc.boolean(),
	isPub: fc.constant(false),
	isExtern: fc.constant(false),
	isComptime: fc.constant(false),
	isThreadlocal: fc.constant(false),
	name: arbitraryZigIdentifier,
}).chain(base =>
	fc.oneof(
		// With type and init
		fc.record({
			typeExpr: arbitraryTypeExpression,
			initExpr: arbitraryLeafExpression,
		}).map(extra => ({ ...base, ...extra })),
		// With init only
		fc.record({
			initExpr: arbitraryLeafExpression,
		}).map(extra => ({ ...base, ...extra })),
		// With type only (extern style)
		fc.record({
			typeExpr: arbitraryTypeExpression,
		}).map(extra => ({ ...base, isExtern: true, ...extra })),
	),
);

const arbitraryAssignStmt: fc.Arbitrary<ZigStatement> = fc.record({
	type: fc.constant('AssignStmt' as const),
	target: arbitraryIdentifier as fc.Arbitrary<ZigExpression>,
	operator: fc.oneof(
		fc.constant('=' as const),
		fc.constant('+=' as const),
		fc.constant('-=' as const),
		fc.constant('*=' as const),
	),
	value: arbitraryLeafExpression,
});

const arbitraryBlockStmt: fc.Arbitrary<ZigStatement> = fc.record({
	type: fc.constant('BlockExpr' as const),
	statements: fc.constant([] as ZigStatement[]),
}) as fc.Arbitrary<ZigStatement>;

const arbitraryDeferStmt: fc.Arbitrary<ZigStatement> = fc.record({
	type: fc.constant('DeferStmt' as const),
	isErrdefer: fc.boolean(),
	body: arbitraryStatementSafeExpression as fc.Arbitrary<ZigStatement>,
});

const arbitraryStatement: fc.Arbitrary<ZigStatement> = fc.oneof(
	{ weight: 2, arbitrary: arbitraryExprStmt },
	{ weight: 2, arbitrary: arbitraryVarDeclStmt },
	{ weight: 2, arbitrary: arbitraryReturnStmt },
	{ weight: 1, arbitrary: arbitraryAssignStmt },
	{ weight: 1, arbitrary: arbitraryBreakStmt },
	{ weight: 1, arbitrary: arbitraryContinueStmt },
	{ weight: 1, arbitrary: arbitraryBlockStmt },
	{ weight: 1, arbitrary: arbitraryDeferStmt },
);

// Function parameters

const arbitraryFnParam: fc.Arbitrary<ZigFnParam> = fc.oneof(
	// Named parameter
	fc.record({
		type: fc.constant('FnParam' as const),
		name: arbitraryZigIdentifier,
		isComptime: fc.constant(false),
		isNoalias: fc.constant(false),
		typeExpr: arbitraryTypeExpression,
	}),
	// Unnamed parameter
	fc.record({
		type: fc.constant('FnParam' as const),
		isComptime: fc.constant(false),
		isNoalias: fc.constant(false),
		typeExpr: arbitraryTypeExpression,
	}),
);

// Block expression

const arbitraryBlockExpr: fc.Arbitrary<ZigBlockExpr> = fc.record({
	type: fc.constant('BlockExpr' as const),
	statements: fc.array(arbitraryStatement, { maxLength: 3 }),
});

// Top-level declarations

const arbitraryFnDecl: fc.Arbitrary<ZigContainerMember> = fc.oneof(
	// Function with body
	fc.record({
		type: fc.constant('FnDecl' as const),
		isPub: fc.boolean(),
		isExtern: fc.constant(false),
		isExport: fc.constant(false),
		isInline: fc.constant(false),
		isComptime: fc.constant(false),
		name: arbitraryZigIdentifier,
		params: fc.array(arbitraryFnParam, { maxLength: 2 }),
		returnType: arbitraryTypeExpression,
		body: arbitraryBlockExpr,
	}),
	// Extern function (no body)
	fc.record({
		type: fc.constant('FnDecl' as const),
		isPub: fc.boolean(),
		isExtern: fc.constant(true),
		isExport: fc.constant(false),
		isInline: fc.constant(false),
		isComptime: fc.constant(false),
		name: arbitraryZigIdentifier,
		params: fc.array(arbitraryFnParam, { maxLength: 2 }),
		returnType: arbitraryTypeExpression,
	}),
);

const arbitraryVarDecl: fc.Arbitrary<ZigContainerMember> = fc.record({
	type: fc.constant('VarDecl' as const),
	isConst: fc.boolean(),
	isPub: fc.boolean(),
	isExtern: fc.constant(false),
	isComptime: fc.constant(false),
	isThreadlocal: fc.constant(false),
	name: arbitraryZigIdentifier,
}).chain(base =>
	fc.oneof(
		// With type and init
		fc.record({
			typeExpr: arbitraryTypeExpression,
			initExpr: arbitraryLeafExpression,
		}).map(extra => ({ ...base, ...extra })),
		// With init only
		fc.record({
			initExpr: arbitraryLeafExpression,
		}).map(extra => ({ ...base, ...extra })),
	),
);

const arbitraryTestDecl: fc.Arbitrary<ZigContainerMember> = fc.oneof(
	fc.record({
		type: fc.constant('TestDecl' as const),
		name: fc.stringMatching(/^[a-zA-Z0-9 ]+$/),
		body: arbitraryBlockExpr,
	}),
	fc.record({
		type: fc.constant('TestDecl' as const),
		body: arbitraryBlockExpr,
	}),
);

const arbitraryContainerMember: fc.Arbitrary<ZigContainerMember> = fc.oneof(
	{ weight: 3, arbitrary: arbitraryFnDecl },
	{ weight: 3, arbitrary: arbitraryVarDecl },
	{ weight: 1, arbitrary: arbitraryTestDecl },
);

export const arbitraryZigRoot: fc.Arbitrary<ZigRoot> = fc.record({
	type: fc.constant('Root' as const),
	members: fc.array(arbitraryContainerMember, { minLength: 1, maxLength: 4 }),
});
