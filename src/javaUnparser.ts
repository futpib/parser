import { escapeJavaString } from './stringEscapes.js';
import { type Unparser } from './unparser.js';

type JavaAstNode = {
	type: string;
	[key: string]: unknown;
};

const binaryOperatorMap: Record<string, string> = {
	PLUS: '+',
	MINUS: '-',
	MULTIPLY: '*',
	DIVIDE: '/',
	REMAINDER: '%',
	LESS: '<',
	GREATER: '>',
	LESS_EQUALS: '<=',
	GREATER_EQUALS: '>=',
	EQUALS: '==',
	NOT_EQUALS: '!=',
	AND: '&&',
	OR: '||',
};

const assignOperatorMap: Record<string, string> = {
	ASSIGN: '=',
	PLUS: '+=',
	MINUS: '-=',
	MULTIPLY: '*=',
	DIVIDE: '/=',
};

const prefixUnaryOperatorMap: Record<string, string> = {
	PREFIX_INCREMENT: '++',
	PREFIX_DECREMENT: '--',
	MINUS: '-',
	PLUS: '+',
	LOGICAL_COMPLEMENT: '!',
};

const postfixUnaryOperatorMap: Record<string, string> = {
	POSTFIX_INCREMENT: '++',
	POSTFIX_DECREMENT: '--',
};

const primitiveTypeMap: Record<string, string> = {
	BOOLEAN: 'boolean',
	BYTE: 'byte',
	CHAR: 'char',
	DOUBLE: 'double',
	FLOAT: 'float',
	INT: 'int',
	LONG: 'long',
	SHORT: 'short',
};

const modifierKeywordMap: Record<string, string> = {
	PUBLIC: 'public',
	PROTECTED: 'protected',
	PRIVATE: 'private',
	STATIC: 'static',
	FINAL: 'final',
	ABSTRACT: 'abstract',
	SYNCHRONIZED: 'synchronized',
	NATIVE: 'native',
	TRANSIENT: 'transient',
	VOLATILE: 'volatile',
	STRICTFP: 'strictfp',
	DEFAULT: 'default',
	SEALED: 'sealed',
	NON_SEALED: 'non-sealed',
};

function flattenName(name: JavaAstNode): string {
	if (name.qualifier) {
		return flattenName(name.qualifier as JavaAstNode) + '.' + (name.identifier as string);
	}

	return name.identifier as string;
}

function unparseType(node: JavaAstNode): string {
	switch (node.type) {
		case 'PrimitiveType':
			return primitiveTypeMap[node.type_ as string]!;

		case 'VoidType':
			return 'void';

		case 'ClassOrInterfaceType': {
			let result = '';
			if (node.scope) {
				result = unparseType(node.scope as JavaAstNode) + '.';
			}

			result += (node.name as JavaAstNode).identifier as string;
			if (node.typeArguments) {
				const typeArgs = node.typeArguments as JavaAstNode[];
				if (typeArgs.length === 0) {
					// Diamond is handled at the ObjectCreationExpr level
				} else {
					result += '<' + typeArgs.map(t => unparseType(t)).join(', ') + '>';
				}
			}

			return result;
		}

		case 'ArrayType': {
			// Unwind to base type + count brackets
			let base = node;
			let brackets = 0;
			while (base.type === 'ArrayType') {
				brackets++;
				base = base.componentType as JavaAstNode;
			}

			return unparseType(base) + '[]'.repeat(brackets);
		}

		case 'WildcardType': {
			let result = '?';
			if (node.extendedType) {
				result += ' extends ' + unparseType(node.extendedType as JavaAstNode);
			}

			if (node.superType) {
				result += ' super ' + unparseType(node.superType as JavaAstNode);
			}

			return result;
		}

		case 'UnknownType':
			return '';

		default:
			throw new Error(`Unknown type: ${node.type}`);
	}
}

function unparseExpression(node: JavaAstNode): string {
	switch (node.type) {
		case 'NameExpr':
			return (node.name as JavaAstNode).identifier as string;

		case 'StringLiteralExpr':
			return `"${escapeJavaString(node.value as string)}"`;


		case 'IntegerLiteralExpr':
			return node.value as string;

		case 'NullLiteralExpr':
			return 'null';

		case 'BooleanLiteralExpr':
			return node.value ? 'true' : 'false';

		case 'ThisExpr':
			return 'this';

		case 'FieldAccessExpr':
			return unparseExpression(node.scope as JavaAstNode) + '.' + ((node.name as JavaAstNode).identifier as string);

		case 'ArrayAccessExpr':
			return unparseExpression(node.name as JavaAstNode) + '[' + unparseExpression(node.index as JavaAstNode) + ']';

		case 'MethodCallExpr': {
			let result = '';
			if (node.scope) {
				result = unparseExpression(node.scope as JavaAstNode) + '.';
			}

			result += (node.name as JavaAstNode).identifier as string;
			result += '(' + (node.arguments as JavaAstNode[]).map(a => unparseExpression(a)).join(', ') + ')';
			return result;
		}

		case 'ObjectCreationExpr': {
			const type_ = node.type_ as JavaAstNode;
			let result = 'new ' + unparseType(type_);
			// Diamond operator
			if (type_.typeArguments) {
				const typeArgs = type_.typeArguments as JavaAstNode[];
				if (typeArgs.length === 0) {
					result += '<>';
				}
			}

			result += '(' + (node.arguments as JavaAstNode[]).map(a => unparseExpression(a)).join(', ') + ')';
			return result;
		}

		case 'BinaryExpr':
			return unparseExpression(node.left as JavaAstNode)
				+ ' ' + binaryOperatorMap[node.operator as string]
				+ ' ' + unparseExpression(node.right as JavaAstNode);

		case 'UnaryExpr': {
			const operator = node.operator as string;
			if (prefixUnaryOperatorMap[operator]) {
				return prefixUnaryOperatorMap[operator] + unparseExpression(node.expression as JavaAstNode);
			}

			if (postfixUnaryOperatorMap[operator]) {
				return unparseExpression(node.expression as JavaAstNode) + postfixUnaryOperatorMap[operator];
			}

			throw new Error(`Unknown unary operator: ${operator}`);
		}

		case 'AssignExpr':
			return unparseExpression(node.target as JavaAstNode)
				+ ' ' + assignOperatorMap[node.operator as string]
				+ ' ' + unparseExpression(node.value as JavaAstNode);

		case 'ConditionalExpr':
			return unparseExpression(node.condition as JavaAstNode)
				+ ' ? ' + unparseExpression(node.thenExpr as JavaAstNode)
				+ ' : ' + unparseExpression(node.elseExpr as JavaAstNode);

		case 'CastExpr':
			return '(' + unparseType(node.type_ as JavaAstNode) + ') ' + unparseExpression(node.expression as JavaAstNode);

		case 'EnclosedExpr':
			return '(' + unparseExpression(node.inner as JavaAstNode) + ')';

		case 'InstanceOfExpr':
			return unparseExpression(node.expression as JavaAstNode)
				+ ' instanceof ' + unparseType(node.type_ as JavaAstNode);

		case 'LambdaExpr': {
			const params = node.parameters as JavaAstNode[];
			const isEnclosing = node.isEnclosingParameters as boolean;
			const body = node.body as JavaAstNode;

			let paramStr: string;
			if (isEnclosing) {
				const paramParts = params.map(p => {
					const paramType = p.type_ as JavaAstNode;
					const paramName = (p.name as JavaAstNode).identifier as string;
					if (paramType.type === 'UnknownType') {
						return paramName;
					}

					return unparseType(paramType) + ' ' + paramName;
				});
				paramStr = '(' + paramParts.join(', ') + ')';
			} else {
				paramStr = (params[0]!.name as JavaAstNode).identifier as string;
			}

			let bodyStr: string;
			if (body.type === 'BlockStmt') {
				bodyStr = unparseBlockStmt(body);
			} else if (body.type === 'ExpressionStmt') {
				bodyStr = unparseExpression(body.expression as JavaAstNode);
			} else {
				bodyStr = unparseExpression(body);
			}

			return paramStr + ' -> ' + bodyStr;
		}

		case 'VariableDeclarationExpr':
			return unparseVariableDeclarationExpr(node);

		case 'MarkerAnnotationExpr':
			return '@' + flattenName(node.name as JavaAstNode);

		default:
			throw new Error(`Unknown expression type: ${node.type}`);
	}
}

function unparseVariableDeclarationExpr(node: JavaAstNode): string {
	const modifiers = node.modifiers as JavaAstNode[];
	const annotations = node.annotations as JavaAstNode[];
	const variables = node.variables as JavaAstNode[];

	let result = '';
	for (const ann of annotations) {
		result += unparseExpression(ann) + ' ';
	}

	for (const mod of modifiers) {
		result += modifierKeywordMap[mod.keyword as string] + ' ';
	}

	// Type comes from first variable
	const type_ = variables[0]!.type_ as JavaAstNode;
	result += unparseType(type_);

	const varParts = variables.map(v => {
		let varStr = ' ' + ((v.name as JavaAstNode).identifier as string);
		if (v.initializer) {
			varStr += ' = ' + unparseExpression(v.initializer as JavaAstNode);
		}

		return varStr;
	});

	result += varParts.join(',');
	return result;
}

function unparseBlockStmt(node: JavaAstNode): string {
	const statements = node.statements as JavaAstNode[];
	if (statements.length === 0) {
		return '{}';
	}

	return '{ ' + statements.map(s => unparseStatement(s)).join(' ') + ' }';
}

function unparseStatement(node: JavaAstNode): string {
	switch (node.type) {
		case 'BlockStmt':
			return unparseBlockStmt(node);

		case 'ExpressionStmt':
			return unparseExpression(node.expression as JavaAstNode) + ';';

		case 'ReturnStmt': {
			if (node.expression) {
				return 'return ' + unparseExpression(node.expression as JavaAstNode) + ';';
			}

			return 'return;';
		}

		case 'ThrowStmt':
			return 'throw ' + unparseExpression(node.expression as JavaAstNode) + ';';

		case 'IfStmt': {
			let result = 'if (' + unparseExpression(node.condition as JavaAstNode) + ') '
				+ unparseStatement(node.thenStmt as JavaAstNode);
			if (node.elseStmt) {
				result += ' else ' + unparseStatement(node.elseStmt as JavaAstNode);
			}

			return result;
		}

		case 'ForStmt': {
			const init = node.initialization as JavaAstNode[];
			let initStr = '';
			if (init.length > 0) {
				initStr = init.map(i => unparseExpression(i)).join(', ');
			}

			let compareStr = '';
			if (node.compare) {
				compareStr = unparseExpression(node.compare as JavaAstNode);
			}

			const update = node.update as JavaAstNode[];
			const updateStr = update.map(u => unparseExpression(u)).join(', ');

			return 'for (' + initStr + '; ' + compareStr + '; ' + updateStr + ') '
				+ unparseStatement(node.body as JavaAstNode);
		}

		case 'ForEachStmt':
			return 'for (' + unparseVariableDeclarationExpr(node.variable as JavaAstNode) + ' : '
				+ unparseExpression(node.iterable as JavaAstNode) + ') '
				+ unparseStatement(node.body as JavaAstNode);

		case 'TryStmt': {
			const resources = node.resources as JavaAstNode[];
			let result = 'try';
			if (resources.length > 0) {
				result += ' (' + resources.map(r => unparseVariableDeclarationExpr(r)).join('; ') + ')';
			}

			result += ' ' + unparseBlockStmt(node.tryBlock as JavaAstNode);

			const catchClauses = node.catchClauses as JavaAstNode[];
			for (const clause of catchClauses) {
				const param = clause.parameter as JavaAstNode;
				const paramType = param.type_ as JavaAstNode;
				const paramName = (param.name as JavaAstNode).identifier as string;
				result += ' catch (' + unparseType(paramType) + ' ' + paramName + ') '
					+ unparseBlockStmt(clause.body as JavaAstNode);
			}

			if (node.finallyBlock) {
				result += ' finally ' + unparseBlockStmt(node.finallyBlock as JavaAstNode);
			}

			return result;
		}

		case 'SwitchStmt': {
			const entries = node.entries as JavaAstNode[];
			let result = 'switch (' + unparseExpression(node.selector as JavaAstNode) + ') {';
			for (const entry of entries) {
				const isDefault = entry.isDefault as boolean;
				const labels = entry.labels as JavaAstNode[];
				const statements = entry.statements as JavaAstNode[];

				if (isDefault) {
					result += ' default:';
				} else {
					for (const label of labels) {
						result += ' case ' + unparseExpression(label) + ':';
					}
				}

				for (const stmt of statements) {
					result += ' ' + unparseStatement(stmt);
				}
			}

			result += '}';
			return result;
		}

		case 'ExplicitConstructorInvocationStmt': {
			const keyword = (node.isThis as boolean) ? 'this' : 'super';
			return keyword + '(' + (node.arguments as JavaAstNode[]).map(a => unparseExpression(a)).join(', ') + ');';
		}

		default:
			throw new Error(`Unknown statement type: ${node.type}`);
	}
}

function unparseAnnotations(annotations: JavaAstNode[]): string {
	if (annotations.length === 0) {
		return '';
	}

	return annotations.map(a => unparseExpression(a)).join(' ') + ' ';
}

function unparseModifiers(modifiers: JavaAstNode[]): string {
	if (modifiers.length === 0) {
		return '';
	}

	return modifiers.map(m => modifierKeywordMap[m.keyword as string]).join(' ') + ' ';
}

function unparseParameter(param: JavaAstNode): string {
	let result = '';
	result += unparseAnnotations(param.annotations as JavaAstNode[]);
	result += unparseModifiers(param.modifiers as JavaAstNode[]);
	const typeStr = unparseType(param.type_ as JavaAstNode);
	if (typeStr) {
		result += typeStr;
		if (param.isVarArgs) {
			result += '...';
		}

		result += ' ';
	}

	result += (param.name as JavaAstNode).identifier as string;
	return result;
}

function unparseBodyDeclaration(node: JavaAstNode): string {
	switch (node.type) {
		case 'FieldDeclaration': {
			const variables = node.variables as JavaAstNode[];
			let result = unparseAnnotations(node.annotations as JavaAstNode[]);
			result += unparseModifiers(node.modifiers as JavaAstNode[]);
			result += unparseType(variables[0]!.type_ as JavaAstNode);
			const varParts = variables.map(v => {
				let varStr = ' ' + ((v.name as JavaAstNode).identifier as string);
				if (v.initializer) {
					varStr += ' = ' + unparseExpression(v.initializer as JavaAstNode);
				}

				return varStr;
			});
			result += varParts.join(',') + ';';
			return result;
		}

		case 'MethodDeclaration': {
			let result = unparseAnnotations(node.annotations as JavaAstNode[]);
			result += unparseModifiers(node.modifiers as JavaAstNode[]);

			const typeParams = node.typeParameters as JavaAstNode[];
			if (typeParams.length > 0) {
				result += '<' + typeParams.map(tp => {
					let tpStr = ((tp.name as JavaAstNode).identifier as string);
					const bounds = tp.typeBound as JavaAstNode[];
					if (bounds.length > 0) {
						tpStr += ' extends ' + bounds.map(b => unparseType(b)).join(' & ');
					}

					return tpStr;
				}).join(', ') + '> ';
			}

			result += unparseType(node.type_ as JavaAstNode) + ' ';
			result += (node.name as JavaAstNode).identifier as string;
			result += '(' + (node.parameters as JavaAstNode[]).map(p => unparseParameter(p)).join(', ') + ')';

			const thrownExceptions = node.thrownExceptions as JavaAstNode[];
			if (thrownExceptions.length > 0) {
				result += ' throws ' + thrownExceptions.map(e => unparseType(e)).join(', ');
			}

			if (node.body) {
				result += ' ' + unparseBlockStmt(node.body as JavaAstNode);
			} else {
				result += ';';
			}

			return result;
		}

		case 'ConstructorDeclaration': {
			let result = unparseAnnotations(node.annotations as JavaAstNode[]);
			result += unparseModifiers(node.modifiers as JavaAstNode[]);
			result += (node.name as JavaAstNode).identifier as string;
			result += '(' + (node.parameters as JavaAstNode[]).map(p => unparseParameter(p)).join(', ') + ')';

			const thrownExceptions = node.thrownExceptions as JavaAstNode[];
			if (thrownExceptions.length > 0) {
				result += ' throws ' + thrownExceptions.map(e => unparseType(e)).join(', ');
			}

			result += ' ' + unparseBlockStmt(node.body as JavaAstNode);
			return result;
		}

		case 'ClassOrInterfaceDeclaration':
		case 'EnumDeclaration':
			return unparseTypeDeclaration(node);

		default:
			throw new Error(`Unknown body declaration type: ${node.type}`);
	}
}

function unparseTypeDeclaration(node: JavaAstNode): string {
	switch (node.type) {
		case 'ClassOrInterfaceDeclaration': {
			let result = unparseAnnotations(node.annotations as JavaAstNode[]);
			result += unparseModifiers(node.modifiers as JavaAstNode[]);
			result += (node.isInterface ? 'interface' : 'class') + ' ';
			result += (node.name as JavaAstNode).identifier as string;

			const typeParams = node.typeParameters as JavaAstNode[];
			if (typeParams.length > 0) {
				result += '<' + typeParams.map(tp => {
					let tpStr = ((tp.name as JavaAstNode).identifier as string);
					const bounds = tp.typeBound as JavaAstNode[];
					if (bounds.length > 0) {
						tpStr += ' extends ' + bounds.map(b => unparseType(b)).join(' & ');
					}

					return tpStr;
				}).join(', ') + '>';
			}

			const extendedTypes = node.extendedTypes as JavaAstNode[];
			if (extendedTypes.length > 0) {
				result += ' extends ' + extendedTypes.map(t => unparseType(t)).join(', ');
			}

			const implementedTypes = node.implementedTypes as JavaAstNode[];
			if (implementedTypes.length > 0) {
				result += ' implements ' + implementedTypes.map(t => unparseType(t)).join(', ');
			}

			const members = node.members as JavaAstNode[];
			if (members.length === 0) {
				result += ' {}';
			} else {
				result += ' { ' + members.map(m => unparseBodyDeclaration(m)).join('\n') + ' }';
			}

			return result;
		}

		case 'EnumDeclaration': {
			let result = unparseAnnotations(node.annotations as JavaAstNode[]);
			result += unparseModifiers(node.modifiers as JavaAstNode[]);
			result += 'enum ';
			result += (node.name as JavaAstNode).identifier as string;
			result += ' {}';
			return result;
		}

		default:
			throw new Error(`Unknown type declaration type: ${node.type}`);
	}
}

export const javaCompilationUnitUnparser: Unparser<unknown, string> = async function * (input) {
	const cu = input as JavaAstNode;

	let result = '';

	// Package declaration
	if (cu.packageDeclaration) {
		const pkg = cu.packageDeclaration as JavaAstNode;
		result += unparseAnnotations(pkg.annotations as JavaAstNode[]);
		result += 'package ' + flattenName(pkg.name as JavaAstNode) + ';';
	}

	// Imports
	const imports = cu.imports as JavaAstNode[];
	for (const imp of imports) {
		if (result.length > 0) {
			result += '\n';
		}

		result += 'import ';
		if (imp.isStatic) {
			result += 'static ';
		}

		result += flattenName(imp.name as JavaAstNode);
		if (imp.isAsterisk) {
			result += '.*';
		}

		result += ';';
	}

	// Types
	const types = cu.types as JavaAstNode[];
	for (const type of types) {
		if (result.length > 0) {
			result += '\n';
		}

		result += unparseTypeDeclaration(type);
	}

	yield result;
};
