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
	type BashAssignment,
	type BashCommand,
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

function unparseRedirect(redirect: BashRedirect): string {
	let result = '';
	if (redirect.fd !== undefined) {
		result += String(redirect.fd);
	}

	result += redirect.operator;
	if ('type' in redirect.target && redirect.target.type === 'hereDoc') {
		result += redirect.target.delimiter;
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

	if (redirectParts) {
		return wordParts ? wordParts + ' ' + redirectParts : redirectParts;
	}

	return wordParts;
}

function unparseCommandUnit(unit: BashCommandUnit): string {
	switch (unit.type) {
		case 'simple':
			return unparseSimpleCommand(unit);

		case 'subshell':
			return '(' + unparseCommand(unit.body) + ')';

		case 'braceGroup':
			return '{ ' + unparseCommand(unit.body) + ' }';
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
