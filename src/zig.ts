// Zig AST type definitions

// Identifier
export type ZigIdentifier = {
	type: 'Identifier';
	name: string;
};

// Literals
export type ZigIntegerLiteral = {
	type: 'IntegerLiteral';
	value: string;
};

export type ZigFloatLiteral = {
	type: 'FloatLiteral';
	value: string;
};

export type ZigStringLiteral = {
	type: 'StringLiteral';
	value: string;
};

export type ZigMultilineStringLiteral = {
	type: 'MultilineStringLiteral';
	value: string;
};

export type ZigCharLiteral = {
	type: 'CharLiteral';
	value: string;
};

export type ZigEnumLiteral = {
	type: 'EnumLiteral';
	name: string;
};

export type ZigBoolLiteral = {
	type: 'BoolLiteral';
	value: boolean;
};

export type ZigNullLiteral = {
	type: 'NullLiteral';
};

export type ZigUndefinedLiteral = {
	type: 'UndefinedLiteral';
};

export type ZigLiteral =
	| ZigIntegerLiteral
	| ZigFloatLiteral
	| ZigStringLiteral
	| ZigMultilineStringLiteral
	| ZigCharLiteral
	| ZigEnumLiteral
	| ZigBoolLiteral
	| ZigNullLiteral
	| ZigUndefinedLiteral;

// Type expressions
export type ZigIdentifierType = {
	type: 'IdentifierType';
	name: string;
};

export type ZigPointerType = {
	type: 'PointerType';
	size: 'one' | 'many' | 'slice';
	isConst: boolean;
	sentinel?: ZigExpression;
	child: ZigTypeExpression;
};

export type ZigArrayType = {
	type: 'ArrayType';
	length: ZigExpression;
	sentinel?: ZigExpression;
	child: ZigTypeExpression;
};

export type ZigOptionalType = {
	type: 'OptionalType';
	child: ZigTypeExpression;
};

export type ZigErrorUnionType = {
	type: 'ErrorUnionType';
	error: ZigTypeExpression;
	payload: ZigTypeExpression;
};

export type ZigDotType = {
	type: 'DotType';
	operand: ZigTypeExpression;
	member: string;
};

export type ZigBuiltinType = {
	type: 'BuiltinType';
	name: string;
};

export type ZigFnProtoType = {
	type: 'FnProtoType';
	params: ZigFnParam[];
	returnType: ZigTypeExpression;
};

export type ZigTypeExpression =
	| ZigIdentifierType
	| ZigPointerType
	| ZigArrayType
	| ZigOptionalType
	| ZigErrorUnionType
	| ZigDotType
	| ZigBuiltinType
	| ZigFnProtoType
	| ZigExpression;

// Expressions
export type ZigBinaryOp =
	| '+' | '-' | '*' | '/' | '%'
	| '<<' | '>>'
	| '&' | '|' | '^'
	| '==' | '!=' | '<' | '>' | '<=' | '>='
	| 'and' | 'or'
	| '++' | '**'
	| 'orelse' | 'catch';

export type ZigBinaryExpr = {
	type: 'BinaryExpr';
	operator: ZigBinaryOp;
	left: ZigExpression;
	right: ZigExpression;
};

export type ZigUnaryOp = '-' | '~' | '!' | '&';

export type ZigUnaryExpr = {
	type: 'UnaryExpr';
	operator: string;
	operand: ZigExpression;
};

export type ZigFieldAccessExpr = {
	type: 'FieldAccessExpr';
	operand: ZigExpression;
	member: string;
};

export type ZigIndexExpr = {
	type: 'IndexExpr';
	operand: ZigExpression;
	index: ZigExpression;
};

export type ZigSliceExpr = {
	type: 'SliceExpr';
	operand: ZigExpression;
	start: ZigExpression;
	end?: ZigExpression;
	sentinel?: ZigExpression;
};

export type ZigCallExpr = {
	type: 'CallExpr';
	callee: ZigExpression;
	args: ZigExpression[];
};

export type ZigBuiltinCallExpr = {
	type: 'BuiltinCallExpr';
	name: string;
	args: ZigExpression[];
};

export type ZigIfExpr = {
	type: 'IfExpr';
	condition: ZigExpression;
	capture?: string;
	body: ZigStatement;
	elseCapture?: string;
	elseBody?: ZigStatement;
};

export type ZigSwitchProng = {
	type: 'SwitchProng';
	cases: ZigExpression[];
	isElse: boolean;
	capture?: string;
	body: ZigExpression;
};

export type ZigSwitchExpr = {
	type: 'SwitchExpr';
	operand: ZigExpression;
	prongs: ZigSwitchProng[];
};

export type ZigStructInitField = {
	type: 'StructInitField';
	name: string;
	value: ZigExpression;
};

export type ZigStructInitExpr = {
	type: 'StructInitExpr';
	operand?: ZigExpression;
	fields: ZigStructInitField[];
};

export type ZigArrayInitExpr = {
	type: 'ArrayInitExpr';
	operand?: ZigExpression;
	elements: ZigExpression[];
};

export type ZigTryExpr = {
	type: 'TryExpr';
	operand: ZigExpression;
};

export type ZigComptimeExpr = {
	type: 'ComptimeExpr';
	operand: ZigExpression;
};

export type ZigBlockExpr = {
	type: 'BlockExpr';
	label?: string;
	statements: ZigStatement[];
};

export type ZigGroupedExpr = {
	type: 'GroupedExpr';
	inner: ZigExpression;
};

export type ZigErrorSetExpr = {
	type: 'ErrorSetExpr';
	names: string[];
};

export type ZigStructExpr = {
	type: 'StructExpr';
	members: ZigContainerMember[];
};

export type ZigExpression =
	| ZigIdentifier
	| ZigLiteral
	| ZigBinaryExpr
	| ZigUnaryExpr
	| ZigFieldAccessExpr
	| ZigIndexExpr
	| ZigSliceExpr
	| ZigCallExpr
	| ZigBuiltinCallExpr
	| ZigIfExpr
	| ZigSwitchExpr
	| ZigStructInitExpr
	| ZigArrayInitExpr
	| ZigTryExpr
	| ZigComptimeExpr
	| ZigBlockExpr
	| ZigGroupedExpr
	| ZigErrorSetExpr
	| ZigErrorUnionType
	| ZigPointerType
	| ZigOptionalType
	| ZigFnProtoType
	| ZigStructExpr
	| ZigArrayType;

// Statements
export type ZigAssignOp = '=' | '+=' | '-=' | '*=' | '/=' | '%=' | '&=' | '|=' | '^=' | '<<=' | '>>=';

export type ZigAssignStmt = {
	type: 'AssignStmt';
	target: ZigExpression;
	operator: ZigAssignOp;
	value: ZigExpression;
};

export type ZigWhileStmt = {
	type: 'WhileStmt';
	condition: ZigExpression;
	capture?: string;
	continuation?: ZigExpression;
	body: ZigStatement;
	elseBody?: ZigStatement;
	label?: string;
	isInline: boolean;
};

export type ZigForStmt = {
	type: 'ForStmt';
	inputs: ZigExpression[];
	captures: string[];
	body: ZigStatement;
	elseBody?: ZigStatement;
	label?: string;
	isInline: boolean;
};

export type ZigReturnStmt = {
	type: 'ReturnStmt';
	value?: ZigExpression;
};

export type ZigBreakStmt = {
	type: 'BreakStmt';
	label?: string;
	value?: ZigExpression;
};

export type ZigContinueStmt = {
	type: 'ContinueStmt';
	label?: string;
};

export type ZigDeferStmt = {
	type: 'DeferStmt';
	isErrdefer: boolean;
	capture?: string;
	body: ZigStatement;
};

export type ZigStatement =
	| ZigAssignStmt
	| ZigVarDecl
	| ZigWhileStmt
	| ZigForStmt
	| ZigReturnStmt
	| ZigBreakStmt
	| ZigContinueStmt
	| ZigDeferStmt
	| ZigExpression;

// Function parameters
export type ZigFnParam = {
	type: 'FnParam';
	name?: string;
	isComptime: boolean;
	isNoalias: boolean;
	typeExpr?: ZigTypeExpression;
};

// Top-level declarations
export type ZigFnDecl = {
	type: 'FnDecl';
	isPub: boolean;
	isExtern: boolean;
	isExport: boolean;
	isInline: boolean;
	isComptime: boolean;
	name: string;
	params: ZigFnParam[];
	returnType: ZigTypeExpression;
	body?: ZigBlockExpr;
};

export type ZigVarDecl = {
	type: 'VarDecl';
	isConst: boolean;
	isPub: boolean;
	isExtern: boolean;
	isComptime: boolean;
	isThreadlocal: boolean;
	name: string;
	typeExpr?: ZigTypeExpression;
	alignExpr?: ZigExpression;
	initExpr?: ZigExpression;
};

export type ZigTestDecl = {
	type: 'TestDecl';
	name?: string;
	body: ZigBlockExpr;
};

export type ZigUsingnamespaceDecl = {
	type: 'UsingnamespaceDecl';
	isPub: boolean;
	expression: ZigExpression;
};

export type ZigContainerField = {
	type: 'ContainerField';
	name: string;
	typeExpr?: ZigTypeExpression;
	alignExpr?: ZigExpression;
	defaultValue?: ZigExpression;
};

export type ZigContainerMember =
	| ZigFnDecl
	| ZigVarDecl
	| ZigTestDecl
	| ZigUsingnamespaceDecl
	| ZigContainerField;

// Root node
export type ZigRoot = {
	type: 'Root';
	members: ZigContainerMember[];
};
