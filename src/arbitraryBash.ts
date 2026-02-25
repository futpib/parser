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
	type BashAssignment,
} from './bash.js';

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
	}).filter(word =>
		word.parts.every((part, i) => {
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
		}),
	);

	// Always include value key (even if undefined) to match createObjectParser behavior
	const arbitraryBashAssignment: fc.Arbitrary<BashAssignment> = fc.record({
		name: arbitraryBashIdentifier,
		value: fc.option(arbitraryWord, { nil: undefined }),
	});

	// Always include fd key (even if undefined) to match createObjectParser behavior
	const arbitraryBashRedirect: fc.Arbitrary<BashRedirect> = fc.record({
		fd: fc.constant(undefined),
		operator: fc.oneof(
			fc.constant('>' as const),
			fc.constant('>>' as const),
			fc.constant('<' as const),
		),
		target: arbitraryWord,
	});

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

	const arbitraryBashCommandUnit: fc.Arbitrary<BashCommandUnit> = fc.oneof(
		{ weight: 5, arbitrary: arbitraryBashSimpleCommand as fc.Arbitrary<BashCommandUnit> },
		{ weight: 1, arbitrary: arbitraryBashSubshell as fc.Arbitrary<BashCommandUnit> },
		{ weight: 1, arbitrary: arbitraryBashBraceGroup as fc.Arbitrary<BashCommandUnit> },
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
