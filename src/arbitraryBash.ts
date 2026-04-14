import * as fc from 'fast-check';
import {
	type BashWord,
	type BashWordPart,
	type BashWordPartLiteral,
	type BashWordPartSingleQuoted,
	type BashWordPartDoubleQuoted,
	type BashWordPartVariable,
	type BashWordPartVariableBraced,
	type BashWordPartArithmeticExpansion,
	type BashSimpleCommand,
	type BashSubshell,
	type BashBraceGroup,
	type BashCommandUnit,
	type BashPipeline,
	type BashCommandList,
	type BashRedirect,
	type BashHereDoc,
	type BashAssignment,
	type BashWhileLoop,
	type BashUntilLoop,
	type BashForInLoop,
	type BashForArithmeticLoop,
	type BashIfExpression,
	type BashCaseExpression,
	type BashCaseTerminator,
	type BashFunction,
} from './bash.js';

// Bash keywords that must not appear as plain identifiers/words in generated output
// (they would be treated as reserved at command-name position by the parser).
const bashReservedWordSet = new Set([
	'if', 'then', 'elif', 'else', 'fi',
	'while', 'until', 'do', 'done',
	'for', 'in', 'case', 'esac',
	'function',
]);

const arbitraryBashIdentifier: fc.Arbitrary<string> = fc.stringMatching(/^[a-zA-Z_][a-zA-Z0-9_]*$/);

// Safe unquoted literal: no shell special chars, no leading {/} or #, no = (would be parsed as assignment)
const arbitraryBashWordPartLiteral: fc.Arbitrary<BashWordPartLiteral> = fc.record({
	type: fc.constant('literal' as const),
	value: fc.stringMatching(/^[a-zA-Z0-9][a-zA-Z0-9._@%,:^~-]*$/),
});

// Single-quoted: no single quotes, no newlines inside (keep simple)
const arbitraryBashWordPartSingleQuoted: fc.Arbitrary<BashWordPartSingleQuoted> = fc.record({
	type: fc.constant('singleQuoted' as const),
	value: fc.stringMatching(/^[^'\n]*$/),
});

const arbitraryBashWordPartVariable: fc.Arbitrary<BashWordPartVariable> = fc.record({
	type: fc.constant('variable' as const),
	name: arbitraryBashIdentifier,
});

// variableBraced without operator/operand (always include the optional keys so deepEqual matches parser output)
const arbitraryBashWordPartVariableBraced: fc.Arbitrary<BashWordPartVariableBraced> = fc.record({
	type: fc.constant('variableBraced' as const),
	name: arbitraryBashIdentifier,
	operator: fc.constant(undefined),
	operand: fc.constant(undefined),
});

const arbitraryBashWordPartArithmeticExpansion: fc.Arbitrary<BashWordPartArithmeticExpansion> = fc.record({
	type: fc.constant('arithmeticExpansion' as const),
	expression: fc.stringMatching(/^[0-9+\- ]*$/),
});

// Identifiers that are NOT bash reserved words. Used for variable/function/loop names
// where a reserved word would either fail the parse or change its meaning.
const arbitrarySafeIdentifier: fc.Arbitrary<string> = arbitraryBashIdentifier
	.filter(name => !bashReservedWordSet.has(name));

type RecursiveArbitraries = {
	commandList: BashCommandList;
};

const recursiveArbitraries = fc.letrec<RecursiveArbitraries>(tie => {
	const arbitraryCommandList = tie('commandList') as fc.Arbitrary<BashCommandList>;

	// Double-quoted literal: no shell-special chars inside double quotes
	const arbitraryDoubleQuotedLiteral: fc.Arbitrary<BashWordPartLiteral> = fc.record({
		type: fc.constant('literal' as const),
		value: fc.stringMatching(/^[^"\\$`\n]+$/),
	});

	const arbitraryBashWordPartDoubleQuoted: fc.Arbitrary<BashWordPartDoubleQuoted> = fc.record({
		type: fc.constant('doubleQuoted' as const),
		parts: fc.array(
			fc.oneof(
				{ weight: 3, arbitrary: arbitraryDoubleQuotedLiteral as fc.Arbitrary<BashWordPart> },
				{ weight: 1, arbitrary: arbitraryBashWordPartVariable as fc.Arbitrary<BashWordPart> },
				{ weight: 1, arbitrary: arbitraryBashWordPartVariableBraced as fc.Arbitrary<BashWordPart> },
			),
			{ minLength: 1, maxLength: 3 },
		),
	}).filter(dq =>
		dq.parts.every((part, i) => {
			const next = dq.parts[i + 1];
			// Prevent adjacent literal parts (they merge when re-parsed)
			if (part.type === 'literal' && next !== undefined && next.type === 'literal') {
				return false;
			}

			// Prevent $var followed by literal starting with ident char (would be mis-parsed as one variable)
			if (part.type === 'variable' && next !== undefined && next.type === 'literal') {
				return next.value.length === 0 || !isIdentChar(next.value[0]!);
			}

			return true;
		}),
	);

	const arbitraryBashWordPartCommandSubstitution = fc.record({
		type: fc.constant('commandSubstitution' as const),
		command: arbitraryCommandList,
	});

	const arbitraryBashWordPart: fc.Arbitrary<BashWordPart> = fc.oneof(
		{ weight: 4, arbitrary: arbitraryBashWordPartLiteral as fc.Arbitrary<BashWordPart> },
		{ weight: 2, arbitrary: arbitraryBashWordPartSingleQuoted as fc.Arbitrary<BashWordPart> },
		{ weight: 2, arbitrary: arbitraryBashWordPartDoubleQuoted as fc.Arbitrary<BashWordPart> },
		{ weight: 2, arbitrary: arbitraryBashWordPartVariable as fc.Arbitrary<BashWordPart> },
		{ weight: 1, arbitrary: arbitraryBashWordPartVariableBraced as fc.Arbitrary<BashWordPart> },
		{ weight: 1, arbitrary: arbitraryBashWordPartArithmeticExpansion as fc.Arbitrary<BashWordPart> },
		{ weight: 1, arbitrary: arbitraryBashWordPartCommandSubstitution as fc.Arbitrary<BashWordPart> },
	);

	function isIdentChar(ch: string): boolean {
		return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch === '_';
	}

	const arbitraryWord: fc.Arbitrary<BashWord> = fc.record({
		parts: fc.array(arbitraryBashWordPart, { minLength: 1, maxLength: 2 }),
	}).filter(word => {
		// A single-literal word that happens to spell a reserved word would be rejected at
		// command-name position by the parser, breaking round-trip.
		if (word.parts.length === 1 && word.parts[0]!.type === 'literal'
			&& bashReservedWordSet.has((word.parts[0]! as BashWordPartLiteral).value)) {
			return false;
		}

		return word.parts.every((part, i) => {
			const next = word.parts[i + 1];
			// Prevent adjacent literal parts (they merge when re-parsed)
			if (part.type === 'literal' && next !== undefined && next.type === 'literal') {
				return false;
			}

			// Prevent $var followed by literal starting with ident char (would be mis-parsed as one variable)
			if (part.type === 'variable' && next !== undefined && next.type === 'literal') {
				return next.value.length === 0 || !isIdentChar(next.value[0]!);
			}

			return true;
		});
	});

	// Always include value key (even if undefined) to match createObjectParser behavior
	const arbitraryBashAssignment: fc.Arbitrary<BashAssignment> = fc.record({
		name: arbitraryBashIdentifier,
		value: fc.option(arbitraryWord, { nil: undefined }),
	});

	const arbitraryBashHereDoc: fc.Arbitrary<BashHereDoc> = fc.record({
		type: fc.constant('hereDoc' as const),
		delimiter: fc.stringMatching(/^[A-Z_][A-Z_0-9]*$/),
		content: fc.array(fc.stringMatching(/^[a-zA-Z0-9 .,!?_-]*$/), { minLength: 0, maxLength: 3 })
			.map(lines => lines.join('\n') + (lines.length > 0 ? '\n' : '')),
		quoted: fc.boolean(),
	}).filter(hd =>
		hd.delimiter.length > 0
		&& !hd.content.split('\n').some(line => line === hd.delimiter),
	);

	// Always include fd key (even if undefined) to match createObjectParser behavior
	const arbitraryBashWordRedirect: fc.Arbitrary<BashRedirect> = fc.record({
		fd: fc.constant(undefined),
		operator: fc.oneof(
			fc.constant('>' as const),
			fc.constant('>>' as const),
			fc.constant('<' as const),
		),
		target: arbitraryWord,
	});

	const arbitraryBashHereDocRedirect: fc.Arbitrary<BashRedirect> = fc.record({
		fd: fc.constant(undefined),
		operator: fc.constant('<<' as const),
		target: arbitraryBashHereDoc,
	});

	const arbitraryBashRedirect: fc.Arbitrary<BashRedirect> = fc.oneof(
		{ weight: 3, arbitrary: arbitraryBashWordRedirect },
		{ weight: 1, arbitrary: arbitraryBashHereDocRedirect },
	);

	const arbitraryBashSimpleCommandWithName: fc.Arbitrary<BashSimpleCommand> = fc.record({
		type: fc.constant('simple' as const),
		name: arbitraryWord,
		args: fc.array(arbitraryWord, { maxLength: 2 }),
		redirects: fc.array(arbitraryBashRedirect, { maxLength: 1 }),
		assignments: fc.array(arbitraryBashAssignment, { maxLength: 1 }),
	});

	// Commands with no name: only assignments and/or redirects (no args)
	const arbitraryBashSimpleCommandNoName: fc.Arbitrary<BashSimpleCommand> = fc.record({
		type: fc.constant('simple' as const),
		name: fc.constant(undefined),
		args: fc.constant([]),
		redirects: fc.array(arbitraryBashRedirect, { maxLength: 1 }),
		assignments: fc.array(arbitraryBashAssignment, { minLength: 1, maxLength: 2 }),
	});

	const arbitraryBashSimpleCommand: fc.Arbitrary<BashSimpleCommand> = fc.oneof(
		{ weight: 4, arbitrary: arbitraryBashSimpleCommandWithName },
		{ weight: 1, arbitrary: arbitraryBashSimpleCommandNoName },
	);

	const arbitraryBashSubshell: fc.Arbitrary<BashSubshell> = fc.record({
		type: fc.constant('subshell' as const),
		body: arbitraryCommandList,
	});

	// Brace group bodies need trailing ';' on last entry (required by "{ cmd; }" syntax)
	const arbitraryBraceGroupBody: fc.Arbitrary<BashCommandList> = arbitraryCommandList.map(list => {
		const entries = list.entries.map((entry, i) => {
			if (i === list.entries.length - 1 && entry.separator === undefined) {
				return { pipeline: entry.pipeline, separator: ';' as const };
			}

			return entry;
		});
		return { ...list, entries };
	});

	const arbitraryBashBraceGroup: fc.Arbitrary<BashBraceGroup> = fc.record({
		type: fc.constant('braceGroup' as const),
		body: arbitraryBraceGroupBody,
	});

	// Compound bodies (while/until/for body, if branch body & condition, else body)
	// must end with a separator so the closing keyword can be cleanly delimited.
	// Same shape as arbitraryBraceGroupBody.
	const arbitraryCompoundBody: fc.Arbitrary<BashCommandList> = arbitraryCommandList.map(list => {
		const entries = list.entries.map((entry, i) => {
			if (i === list.entries.length - 1 && entry.separator === undefined) {
				return { pipeline: entry.pipeline, separator: ';' as const };
			}

			return entry;
		});
		return { ...list, entries };
	});

	const arbitraryBashWhileLoop: fc.Arbitrary<BashWhileLoop> = fc.record({
		type: fc.constant('whileLoop' as const),
		condition: arbitraryCompoundBody,
		body: arbitraryCompoundBody,
	});

	const arbitraryBashUntilLoop: fc.Arbitrary<BashUntilLoop> = fc.record({
		type: fc.constant('untilLoop' as const),
		condition: arbitraryCompoundBody,
		body: arbitraryCompoundBody,
	});

	// For-in word: avoid words that would conflict with the `do` terminator or the `in` keyword.
	const arbitraryForInWord: fc.Arbitrary<BashWord> = arbitraryWord.filter(word => {
		if (word.parts.length === 1 && word.parts[0]!.type === 'literal') {
			const value = (word.parts[0]! as BashWordPartLiteral).value;
			if (value === 'do' || value === 'done' || value === 'in') {
				return false;
			}
		}

		return true;
	});

	const arbitraryBashForInLoop: fc.Arbitrary<BashForInLoop> = fc.record({
		type: fc.constant('forInLoop' as const),
		name: arbitrarySafeIdentifier,
		// undefined = no `in` clause; otherwise an explicit (possibly empty) word list
		words: fc.option(fc.array(arbitraryForInWord, { minLength: 0, maxLength: 2 }), { nil: undefined }),
		body: arbitraryCompoundBody,
	});

	// For-arithmetic init/condition/update: arithmetic-safe characters only.
	// Must not contain `;` or unbalanced `()` (parser reads to first bare `;` or `)`).
	const arbitraryArithSegment = fc.stringMatching(/^[a-z0-9_+\-*/<>= ]*$/);

	const arbitraryBashForArithmeticLoop: fc.Arbitrary<BashForArithmeticLoop> = fc.record({
		type: fc.constant('forArithmeticLoop' as const),
		init: arbitraryArithSegment,
		condition: arbitraryArithSegment,
		update: arbitraryArithSegment,
		body: arbitraryCompoundBody,
	});

	const arbitraryIfBranch: fc.Arbitrary<{ condition: BashCommandList; body: BashCommandList }> = fc.record({
		condition: arbitraryCompoundBody,
		body: arbitraryCompoundBody,
	});

	const arbitraryBashIfExpression: fc.Arbitrary<BashIfExpression> = fc.record({
		type: fc.constant('ifExpression' as const),
		branches: fc.array(arbitraryIfBranch, { minLength: 1, maxLength: 2 }),
		elseBody: fc.option(arbitraryCompoundBody, { nil: undefined }),
	});

	// Case patterns/word: avoid `esac` and `in` (would interfere with case structure parsing).
	const arbitraryCaseWord: fc.Arbitrary<BashWord> = arbitraryWord.filter(word => {
		if (word.parts.length === 1 && word.parts[0]!.type === 'literal') {
			const value = (word.parts[0]! as BashWordPartLiteral).value;
			if (value === 'esac' || value === 'in') {
				return false;
			}
		}

		return true;
	});

	// Case branch body: a list WITHOUT enforced trailing `;` (the terminator handles delimitation).
	const arbitraryCaseBranchBody: fc.Arbitrary<BashCommandList> = arbitraryCommandList.map(list => {
		const entries = list.entries.map((entry, i) => {
			if (i === list.entries.length - 1) {
				return { pipeline: entry.pipeline, separator: undefined };
			}

			return entry;
		});
		return { ...list, entries };
	});

	const arbitraryCaseTerminator: fc.Arbitrary<BashCaseTerminator> = fc.oneof(
		fc.constant(';;' as const),
		fc.constant(';&' as const),
		fc.constant(';;&' as const),
	);

	const arbitraryCaseBranch: fc.Arbitrary<BashCaseExpression['branches'][number]> = fc.record({
		patterns: fc.array(arbitraryCaseWord, { minLength: 1, maxLength: 2 }),
		body: fc.option(arbitraryCaseBranchBody, { nil: undefined }),
		// Always include a terminator (round-trip is unambiguous; trailing-terminator omission
		// is supported by the parser but not exercised by the arbitrary).
		terminator: arbitraryCaseTerminator,
	});

	const arbitraryBashCaseExpression: fc.Arbitrary<BashCaseExpression> = fc.record({
		type: fc.constant('caseExpression' as const),
		word: arbitraryCaseWord,
		branches: fc.array(arbitraryCaseBranch, { minLength: 0, maxLength: 2 }),
	});

	// Function body: a compound command (brace group or subshell). Bash actually allows any
	// compound command, but we keep the arbitrary narrow to avoid combinatorial blowup.
	const arbitraryFunctionBody: fc.Arbitrary<BashCommandUnit> = fc.oneof(
		arbitraryBashBraceGroup as fc.Arbitrary<BashCommandUnit>,
		arbitraryBashSubshell as fc.Arbitrary<BashCommandUnit>,
	);

	// Functions: at least one of `function` keyword or `()` must be present.
	const arbitraryBashFunction: fc.Arbitrary<BashFunction> = fc.record({
		type: fc.constant('function' as const),
		hasFunctionKeyword: fc.boolean(),
		hasParentheses: fc.boolean(),
		name: arbitrarySafeIdentifier,
		body: arbitraryFunctionBody,
	}).filter(fn => fn.hasFunctionKeyword || fn.hasParentheses);

	const arbitraryBashCommandUnit: fc.Arbitrary<BashCommandUnit> = fc.oneof(
		{ weight: 10, arbitrary: arbitraryBashSimpleCommand as fc.Arbitrary<BashCommandUnit> },
		{ weight: 1, arbitrary: arbitraryBashSubshell as fc.Arbitrary<BashCommandUnit> },
		{ weight: 1, arbitrary: arbitraryBashBraceGroup as fc.Arbitrary<BashCommandUnit> },
		{ weight: 1, arbitrary: arbitraryBashWhileLoop as fc.Arbitrary<BashCommandUnit> },
		{ weight: 1, arbitrary: arbitraryBashUntilLoop as fc.Arbitrary<BashCommandUnit> },
		{ weight: 1, arbitrary: arbitraryBashForInLoop as fc.Arbitrary<BashCommandUnit> },
		{ weight: 1, arbitrary: arbitraryBashForArithmeticLoop as fc.Arbitrary<BashCommandUnit> },
		{ weight: 1, arbitrary: arbitraryBashIfExpression as fc.Arbitrary<BashCommandUnit> },
		{ weight: 1, arbitrary: arbitraryBashCaseExpression as fc.Arbitrary<BashCommandUnit> },
		{ weight: 1, arbitrary: arbitraryBashFunction as fc.Arbitrary<BashCommandUnit> },
	);

	const arbitraryBashPipeline: fc.Arbitrary<BashPipeline> = fc.record({
		type: fc.constant('pipeline' as const),
		negated: fc.boolean(),
		commands: fc.array(arbitraryBashCommandUnit, { minLength: 1, maxLength: 2 }),
	});

	const commandListArbitrary: fc.Arbitrary<BashCommandList> = fc.record({
		type: fc.constant('list' as const),
		entries: fc.array(
			fc.record({
				pipeline: arbitraryBashPipeline,
				separator: fc.option(
					fc.oneof(
						fc.constant('&&' as const),
						fc.constant('||' as const),
						fc.constant(';' as const),
					),
					{ nil: undefined },
				),
			}),
			{ minLength: 1, maxLength: 2 },
		),
	}).map(list => {
		const entries = list.entries.map((entry, i) => {
			if (i < list.entries.length - 1 && entry.separator === undefined) {
				return { pipeline: entry.pipeline, separator: ';' as const };
			}

			return entry;
		});
		return { ...list, entries };
	});

	return {
		commandList: commandListArbitrary,
	};
});

export const arbitraryBashCommandList: fc.Arbitrary<BashCommandList> =
	recursiveArbitraries.commandList as fc.Arbitrary<BashCommandList>;
