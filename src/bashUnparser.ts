import { type Unparser } from './unparser.js';
import {
	type BashWord,
	type BashWordPart,
	type BashSimpleCommand,
	type BashSubshell,
	type BashBraceGroup,
	type BashCommandUnit,
	type BashPipeline,
	type BashCommandList,
	type BashRedirect,
	type BashHereDoc,
	type BashAssignment,
	type BashCommand,
	type BashWhileLoop,
	type BashUntilLoop,
	type BashForInLoop,
	type BashForArithmeticLoop,
	type BashIfExpression,
	type BashCaseExpression,
	type BashFunction,
} from './bash.js';

function isIdentChar(ch: string): boolean {
	return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch === '_';
}

function nextPartStartsWithIdentChar(parts: BashWordPart[], index: number): boolean {
	const next = parts[index + 1];
	if (next === undefined) {
		return false;
	}

	if (next.type === 'literal') {
		return next.value.length > 0 && isIdentChar(next.value[0]!);
	}

	return false;
}

function unparseWord(word: BashWord): string {
	return word.parts.map((part, i) => unparseWordPartInContext(part, word.parts, i)).join('');
}

function unparseWordPartInContext(part: BashWordPart, parts: BashWordPart[], index: number): string {
	return unparseWordPart(part);
}

function unparseWordPart(part: BashWordPart): string {
	switch (part.type) {
		case 'literal':
			return escapeLiteral(part.value);

		case 'singleQuoted':
			return "'" + part.value + "'";

		case 'doubleQuoted':
			return '"' + part.parts.map(p => unparseDoubleQuotedPart(p)).join('') + '"';

		case 'variable':
			return '$' + part.name;

		case 'variableBraced': {
			let result = '${' + part.name;
			if (part.operator !== undefined) {
				result += part.operator;
				if (part.operand !== undefined) {
					result += unparseWord(part.operand);
				}
			}

			result += '}';
			return result;
		}

		case 'commandSubstitution':
			return '$( ' + unparseCommand(part.command) + ' )';

		case 'backtickSubstitution':
			return '`' + unparseCommand(part.command) + '`';

		case 'arithmeticExpansion':
			return '$((' + part.expression + '))';

		case 'processSubstitution':
			return part.direction + '(' + unparseCommand(part.command) + ')';
	}
}

function unparseDoubleQuotedPart(part: BashWordPart): string {
	switch (part.type) {
		case 'literal': {
			let result = '';
			for (const ch of part.value) {
				if (ch === '\\' || ch === '$' || ch === '`' || ch === '"') {
					result += '\\' + ch;
				} else {
					result += ch;
				}
			}

			return result;
		}

		default:
			return unparseWordPart(part);
	}
}

function escapeLiteral(value: string): string {
	let result = '';
	for (const ch of value) {
		if (' \t\n|&;<>()$`"\' \\'.includes(ch) || ch === '{' || ch === '}' || ch === '#') {
			result += '\\' + ch;
		} else {
			result += ch;
		}
	}

	return result;
}

function unparseHereDocDelimiter(hereDoc: BashHereDoc): string {
	if (hereDoc.quoted) {
		return "'" + hereDoc.delimiter + "'";
	}

	return hereDoc.delimiter;
}

function unparseRedirect(redirect: BashRedirect): string {
	let result = '';
	if (redirect.fd !== undefined) {
		result += String(redirect.fd);
	}

	result += redirect.operator;
	if ('type' in redirect.target && redirect.target.type === 'hereDoc') {
		result += unparseHereDocDelimiter(redirect.target);
	} else {
		result += unparseWord(redirect.target as BashWord);
	}

	return result;
}

function unparseAssignment(assignment: BashAssignment): string {
	let result = assignment.name + '=';
	if (assignment.value !== undefined) {
		result += unparseWord(assignment.value);
	}

	return result;
}

function collectHereDocBodies(cmd: BashSimpleCommand): string {
	let result = '';
	for (const redirect of cmd.redirects) {
		if ('type' in redirect.target && redirect.target.type === 'hereDoc') {
			result += '\n' + redirect.target.content + redirect.target.delimiter + '\n';
		}
	}

	return result;
}

function unparseSimpleCommand(cmd: BashSimpleCommand): string {
	const parts: string[] = [];

	for (const assignment of cmd.assignments) {
		parts.push(unparseAssignment(assignment));
	}

	if (cmd.name !== undefined) {
		parts.push(unparseWord(cmd.name));
	}

	for (const arg of cmd.args) {
		parts.push(unparseWord(arg));
	}

	const wordParts = parts.join(' ');
	const redirectParts = cmd.redirects.map(r => unparseRedirect(r)).join(' ');
	const hereDocBodies = collectHereDocBodies(cmd);

	let result: string;
	if (redirectParts) {
		result = wordParts ? wordParts + ' ' + redirectParts : redirectParts;
	} else {
		result = wordParts;
	}

	return result + hereDocBodies;
}

// Conditions and bodies of while/until/if are command lists whose last entry must end
// with `;` (or `\n`) so the keyword that follows (`do`, `then`, `elif`, `else`, `fi`, `done`)
// is correctly delimited. The arbitrary generator enforces this; here we just emit a single
// space as the connector — the trailing separator inside the list provides the actual `;`.

function unparseWhileLoop(loop: BashWhileLoop): string {
	return 'while ' + unparseCommand(loop.condition) + ' do ' + unparseCommand(loop.body) + ' done';
}

function unparseUntilLoop(loop: BashUntilLoop): string {
	return 'until ' + unparseCommand(loop.condition) + ' do ' + unparseCommand(loop.body) + ' done';
}

function unparseForInLoop(loop: BashForInLoop): string {
	let result = 'for ' + loop.name;
	if (loop.words !== undefined) {
		result += ' in';
		for (const word of loop.words) {
			result += ' ' + unparseWord(word);
		}
	}

	// The for-header doesn't carry its own `;`, so we add one here before `do`.
	result += '; do ' + unparseCommand(loop.body) + ' done';
	return result;
}

function unparseForArithmeticLoop(loop: BashForArithmeticLoop): string {
	return 'for ((' + loop.init + ';' + loop.condition + ';' + loop.update + ')); do '
		+ unparseCommand(loop.body) + ' done';
}

function unparseIfExpression(expr: BashIfExpression): string {
	let result = 'if ';
	for (let i = 0; i < expr.branches.length; i++) {
		const branch = expr.branches[i]!;
		if (i > 0) {
			result += ' elif ';
		}

		result += unparseCommand(branch.condition) + ' then ' + unparseCommand(branch.body);
	}

	if (expr.elseBody !== undefined) {
		result += ' else ' + unparseCommand(expr.elseBody);
	}

	result += ' fi';
	return result;
}

function unparseCaseExpression(expr: BashCaseExpression): string {
	let result = 'case ' + unparseWord(expr.word) + ' in';
	for (const branch of expr.branches) {
		result += ' ' + branch.patterns.map(p => unparseWord(p)).join(' | ') + ')';
		if (branch.body !== undefined) {
			result += ' ' + unparseCommand(branch.body);
		}

		if (branch.terminator !== undefined) {
			result += ' ' + branch.terminator;
		}
	}

	result += ' esac';
	return result;
}

function unparseFunction(fn: BashFunction): string {
	let result = '';
	if (fn.hasFunctionKeyword) {
		result += 'function ';
	}

	result += fn.name;
	if (fn.hasParentheses) {
		result += '()';
	}

	result += ' ' + unparseCommandUnit(fn.body);
	return result;
}

function unparseCommandUnit(unit: BashCommandUnit): string {
	switch (unit.type) {
		case 'simple':
			return unparseSimpleCommand(unit);

		case 'subshell':
			return '(' + unparseCommand(unit.body) + ')';

		case 'braceGroup':
			return '{ ' + unparseCommand(unit.body) + ' }';

		case 'whileLoop':
			return unparseWhileLoop(unit);

		case 'untilLoop':
			return unparseUntilLoop(unit);

		case 'forInLoop':
			return unparseForInLoop(unit);

		case 'forArithmeticLoop':
			return unparseForArithmeticLoop(unit);

		case 'ifExpression':
			return unparseIfExpression(unit);

		case 'caseExpression':
			return unparseCaseExpression(unit);

		case 'function':
			return unparseFunction(unit);
	}
}

function unparsePipeline(pipeline: BashPipeline): string {
	let result = '';
	if (pipeline.negated) {
		result += '! ';
	}

	result += pipeline.commands.map(cmd => unparseCommandUnit(cmd)).join(' | ');
	return result;
}

function unparseCommand(command: BashCommand): string {
	return unparseCommandList(command);
}

function unparseCommandList(list: BashCommandList): string {
	let result = '';
	for (let i = 0; i < list.entries.length; i++) {
		const entry = list.entries[i]!;
		if (i > 0) {
			result += ' ';
		}

		result += unparsePipeline(entry.pipeline);
		if (entry.separator !== undefined) {
			result += entry.separator;
		}
	}

	return result;
}

export const bashScriptUnparser: Unparser<BashCommand, string> = async function * (command) {
	yield unparseCommand(command);
};
