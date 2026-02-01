import { type Unparser } from './unparser.js';
import {
	type ZigRoot,
	type ZigContainerMember,
	type ZigFnDecl,
	type ZigVarDecl,
	type ZigTestDecl,
	type ZigUsingnamespaceDecl,
	type ZigContainerField,
	type ZigFnParam,
	type ZigExpression,
	type ZigTypeExpression,
	type ZigStatement,
	type ZigBlockExpr,
	type ZigSwitchProng,
	type ZigStructInitField,
	type ZigBinaryOp,
} from './zig.js';

function unparseExpression(node: ZigExpression): string {
	switch (node.type) {
		case 'Identifier':
			return node.name;

		case 'IntegerLiteral':
			return node.value;

		case 'FloatLiteral':
			return node.value;

		case 'StringLiteral':
			return '"' + node.value + '"';

		case 'MultilineStringLiteral':
			return node.value;

		case 'CharLiteral':
			return "'" + node.value + "'";

		case 'EnumLiteral':
			return '.' + node.name;

		case 'BoolLiteral':
			return node.value ? 'true' : 'false';

		case 'NullLiteral':
			return 'null';

		case 'UndefinedLiteral':
			return 'undefined';

		case 'BinaryExpr':
			return unparseExpression(node.left) + ' ' + unparseBinaryOp(node.operator) + ' ' + unparseExpression(node.right);

		case 'UnaryExpr':
			if (node.operator === '&') {
				return '&' + unparseExpression(node.operand);
			}

			return node.operator + unparseExpression(node.operand);

		case 'FieldAccessExpr':
			return unparseExpression(node.operand) + '.' + node.member;

		case 'IndexExpr':
			return unparseExpression(node.operand) + '[' + unparseExpression(node.index) + ']';

		case 'SliceExpr': {
			let result = unparseExpression(node.operand) + '[' + unparseExpression(node.start) + '..';
			if (node.end) {
				result += unparseExpression(node.end);
			}

			result += ']';
			return result;
		}

		case 'CallExpr':
			return unparseExpression(node.callee) + '(' + node.args.map(a => unparseExpression(a)).join(', ') + ')';

		case 'BuiltinCallExpr':
			return '@' + node.name + '(' + node.args.map(a => unparseExpression(a)).join(', ') + ')';

		case 'IfExpr': {
			let result = 'if (' + unparseExpression(node.condition) + ')';
			if (node.capture) {
				result += ' |' + node.capture + '|';
			}

			result += ' ' + unparseExpression(node.body as ZigExpression);
			if (node.elseBody) {
				result += ' else';
				if (node.elseCapture) {
					result += ' |' + node.elseCapture + '|';
				}

				result += ' ' + unparseExpression(node.elseBody as ZigExpression);
			}

			return result;
		}

		case 'SwitchExpr': {
			let result = 'switch (' + unparseExpression(node.operand) + ') {';
			for (let i = 0; i < node.prongs.length; i++) {
				if (i > 0) {
					result += ',';
				}

				result += ' ' + unparseSwitchProng(node.prongs[i]!);
			}

			if (node.prongs.length > 0) {
				result += ',';
			}

			result += ' }';
			return result;
		}

		case 'StructInitExpr': {
			let result = '';
			if (node.operand) {
				result += unparseExpression(node.operand);
			} else {
				result += '.';
			}

			result += '{ ';
			result += node.fields.map(f => unparseStructInitField(f)).join(', ');
			if (node.fields.length > 0) {
				result += ', ';
			}

			result += '}';
			return result;
		}

		case 'ArrayInitExpr': {
			let result = '';
			if (node.operand) {
				result += unparseExpression(node.operand);
			} else {
				result += '.';
			}

			result += '{ ';
			result += node.elements.map(e => unparseExpression(e)).join(', ');
			if (node.elements.length > 0) {
				result += ', ';
			}

			result += '}';
			return result;
		}

		case 'TryExpr':
			return 'try ' + unparseExpression(node.operand);

		case 'ComptimeExpr':
			return 'comptime ' + unparseExpression(node.operand);

		case 'BlockExpr':
			return unparseBlockExpr(node);

		case 'GroupedExpr':
			return '(' + unparseExpression(node.inner) + ')';

		case 'ErrorSetExpr':
			return 'error{ ' + node.names.join(', ') + ' }';

		case 'ErrorUnionType':
			return unparseTypeExpression(node.error) + '!' + unparseTypeExpression(node.payload);

		case 'PointerType':
			return unparsePointerType(node);

		case 'OptionalType':
			return '?' + unparseTypeExpression(node.child);

		case 'FnProtoType':
			return 'fn(' + node.params.map(p => unparseFnParam(p)).join(', ') + ') ' + unparseTypeExpression(node.returnType);

		case 'StructExpr': {
			let result = 'struct { ';
			for (const member of node.members) {
				result += unparseContainerMember(member) + ' ';
			}
			result += '}';
			return result;
		}

		case 'ArrayType': {
			let result = '[' + unparseExpression(node.length);
			if (node.sentinel) {
				result += ':' + unparseExpression(node.sentinel);
			}
			result += ']';
			result += unparseTypeExpression(node.child);
			return result;
		}

		default:
			throw new Error(`Unknown expression type: ${(node as { type: string }).type}`);
	}
}

function unparsePointerType(node: { type: 'PointerType'; size: string; isConst: boolean; sentinel?: ZigExpression; child: ZigTypeExpression }): string {
	let result = '';
	switch (node.size) {
		case 'one':
			result += '*';
			break;
		case 'many':
			result += '[*]';
			break;
		case 'slice':
			result += '[]';
			break;
	}

	if (node.isConst) {
		result += 'const ';
	}

	result += unparseTypeExpression(node.child);
	return result;
}

function unparseTypeExpression(node: ZigTypeExpression): string {
	switch (node.type) {
		case 'IdentifierType':
			return node.name;

		case 'PointerType':
			return unparsePointerType(node);

		case 'ArrayType': {
			let result = '[' + unparseExpression(node.length);
			if (node.sentinel) {
				result += ':' + unparseExpression(node.sentinel);
			}

			result += ']';
			result += unparseTypeExpression(node.child);
			return result;
		}

		case 'OptionalType':
			return '?' + unparseTypeExpression(node.child);

		case 'ErrorUnionType':
			return unparseTypeExpression(node.error) + '!' + unparseTypeExpression(node.payload);

		case 'DotType':
			return unparseTypeExpression(node.operand) + '.' + node.member;

		case 'BuiltinType':
			return '@' + node.name;

		case 'FnProtoType':
			return 'fn(' + node.params.map(p => unparseFnParam(p)).join(', ') + ') ' + unparseTypeExpression(node.returnType);

		default:
			return unparseExpression(node);
	}
}

function unparseBinaryOp(op: ZigBinaryOp): string {
	switch (op) {
		case 'and':
			return 'and';
		case 'or':
			return 'or';
		case 'orelse':
			return 'orelse';
		case 'catch':
			return 'catch';
		default:
			return op;
	}
}

function unparseSwitchProng(prong: ZigSwitchProng): string {
	let result = '';
	if (prong.isElse) {
		result += 'else';
	} else {
		result += prong.cases.map(c => unparseExpression(c)).join(', ');
	}

	result += ' =>';
	if (prong.capture) {
		result += ' |' + prong.capture + '|';
	}

	result += ' ' + unparseExpression(prong.body);
	return result;
}

function unparseStructInitField(field: ZigStructInitField): string {
	return '.' + field.name + ' = ' + unparseExpression(field.value);
}

function unparseBlockExpr(node: ZigBlockExpr): string {
	let result = '';
	if (node.label) {
		result += node.label + ': ';
	}

	result += '{ ';
	for (const stmt of node.statements) {
		result += unparseStatement(stmt) + ' ';
	}

	result += '}';
	return result;
}

function unparseStatement(node: ZigStatement): string {
	switch (node.type) {
		case 'AssignStmt':
			return unparseExpression(node.target) + ' ' + node.operator + ' ' + unparseExpression(node.value) + ';';

		case 'VarDecl':
			return unparseVarDeclCommon(node);

		case 'IfExpr': {
			let result = 'if (' + unparseExpression(node.condition) + ')';
			if (node.capture) {
				result += ' |' + node.capture + '|';
			}

			result += ' ' + unparseStatement(node.body);
			if (node.elseBody) {
				result += ' else';
				if (node.elseCapture) {
					result += ' |' + node.elseCapture + '|';
				}

				result += ' ' + unparseStatement(node.elseBody);
			}

			return result;
		}

		case 'WhileStmt': {
			let result = '';
			if (node.label) {
				result += node.label + ': ';
			}

			if (node.isInline) {
				result += 'inline ';
			}

			result += 'while (' + unparseExpression(node.condition) + ')';
			if (node.capture) {
				result += ' |' + node.capture + '|';
			}

			if (node.continuation) {
				result += ' : (' + unparseExpression(node.continuation) + ')';
			}

			result += ' ' + unparseStatement(node.body);
			if (node.elseBody) {
				result += ' else ' + unparseStatement(node.elseBody);
			}

			return result;
		}

		case 'ForStmt': {
			let result = '';
			if (node.label) {
				result += node.label + ': ';
			}

			if (node.isInline) {
				result += 'inline ';
			}

			result += 'for (' + node.inputs.map(i => unparseExpression(i)).join(', ') + ') |' + node.captures.join(', ') + '| ' + unparseStatement(node.body);
			if (node.elseBody) {
				result += ' else ' + unparseStatement(node.elseBody);
			}

			return result;
		}

		case 'ReturnStmt':
			if (node.value) {
				return 'return ' + unparseExpression(node.value) + ';';
			}

			return 'return;';

		case 'BreakStmt': {
			let result = 'break';
			if (node.label) {
				result += ' :' + node.label;
			}

			if (node.value) {
				result += ' ' + unparseExpression(node.value);
			}

			result += ';';
			return result;
		}

		case 'ContinueStmt': {
			let result = 'continue';
			if (node.label) {
				result += ' :' + node.label;
			}

			result += ';';
			return result;
		}

		case 'DeferStmt': {
			let result = node.isErrdefer ? 'errdefer' : 'defer';
			if (node.capture) {
				result += ' |' + node.capture + '|';
			}

			result += ' ' + unparseStatement(node.body);
			return result;
		}

		case 'BlockExpr':
			return unparseBlockExpr(node);

		default:
			return unparseExpression(node as ZigExpression) + ';';
	}
}

function unparseVarDeclCommon(node: {
	isPub: boolean;
	isExtern: boolean;
	isComptime: boolean;
	isThreadlocal: boolean;
	isConst: boolean;
	name: string;
	typeExpr?: ZigTypeExpression;
	alignExpr?: ZigExpression;
	initExpr?: ZigExpression;
}): string {
	let result = '';
	if (node.isPub) {
		result += 'pub ';
	}

	if (node.isExtern) {
		result += 'extern ';
	}

	if (node.isComptime) {
		result += 'comptime ';
	}

	if (node.isThreadlocal) {
		result += 'threadlocal ';
	}

	result += node.isConst ? 'const' : 'var';
	result += ' ' + node.name;
	if (node.typeExpr) {
		result += ': ' + unparseTypeExpression(node.typeExpr);
	}

	if (node.alignExpr) {
		result += ' align(' + unparseExpression(node.alignExpr) + ')';
	}

	if (node.initExpr) {
		result += ' = ' + unparseExpression(node.initExpr);
	}

	result += ';';
	return result;
}

function unparseFnParam(param: ZigFnParam): string {
	let result = '';
	if (param.isComptime) {
		result += 'comptime ';
	}

	if (param.isNoalias) {
		result += 'noalias ';
	}

	if (param.name) {
		result += param.name + ': ';
	}

	if (param.typeExpr) {
		result += unparseTypeExpression(param.typeExpr);
	}

	return result;
}

function unparseContainerMember(node: ZigContainerMember): string {
	switch (node.type) {
		case 'FnDecl':
			return unparseFnDecl(node);

		case 'VarDecl':
			return unparseVarDeclCommon(node);

		case 'TestDecl':
			return unparseTestDecl(node);

		case 'UsingnamespaceDecl':
			return unparseUsingnamespaceDecl(node);

		case 'ContainerField':
			return unparseContainerField(node);

		default:
			throw new Error(`Unknown container member type: ${(node as { type: string }).type}`);
	}
}

function unparseFnDecl(node: ZigFnDecl): string {
	let result = '';
	if (node.isPub) {
		result += 'pub ';
	}

	if (node.isExtern) {
		result += 'extern ';
	}

	if (node.isExport) {
		result += 'export ';
	}

	if (node.isInline) {
		result += 'inline ';
	}

	if (node.isComptime) {
		result += 'comptime ';
	}

	result += 'fn ' + node.name + '(' + node.params.map(p => unparseFnParam(p)).join(', ') + ') ';
	result += unparseTypeExpression(node.returnType);
	if (node.body) {
		result += ' ' + unparseBlockExpr(node.body);
	} else {
		result += ';';
	}

	return result;
}

function unparseTestDecl(node: ZigTestDecl): string {
	let result = 'test';
	if (node.name) {
		result += ' "' + node.name + '"';
	}

	result += ' ' + unparseBlockExpr(node.body);
	return result;
}

function unparseUsingnamespaceDecl(node: ZigUsingnamespaceDecl): string {
	let result = '';
	if (node.isPub) {
		result += 'pub ';
	}

	result += 'usingnamespace ' + unparseExpression(node.expression) + ';';
	return result;
}

function unparseContainerField(node: ZigContainerField): string {
	let result = node.name;
	if (node.typeExpr) {
		result += ': ' + unparseTypeExpression(node.typeExpr);
	}

	if (node.alignExpr) {
		result += ' align(' + unparseExpression(node.alignExpr) + ')';
	}

	if (node.defaultValue) {
		result += ' = ' + unparseExpression(node.defaultValue);
	}

	result += ',';
	return result;
}

export const zigSourceFileUnparser: Unparser<unknown, string> = async function * (input) {
	const root = input as ZigRoot;
	let result = '';

	for (let i = 0; i < root.members.length; i++) {
		if (i > 0) {
			result += '\n';
		}

		result += unparseContainerMember(root.members[i]!);
	}

	yield result;
};
