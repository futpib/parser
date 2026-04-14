// Word: a single argument/token (may contain expansions)
export type BashWord = {
	parts: BashWordPart[];
};

export type BashWordPart =
	| BashWordPartLiteral
	| BashWordPartSingleQuoted
	| BashWordPartDoubleQuoted
	| BashWordPartVariable
	| BashWordPartVariableBraced
	| BashWordPartCommandSubstitution
	| BashWordPartBacktickSubstitution
	| BashWordPartArithmeticExpansion
	| BashWordPartProcessSubstitution;

export type BashWordPartLiteral = {
	type: 'literal';
	value: string;
};

export type BashWordPartSingleQuoted = {
	type: 'singleQuoted';
	value: string;
};

export type BashWordPartDoubleQuoted = {
	type: 'doubleQuoted';
	parts: BashWordPart[];
};

export type BashWordPartVariable = {
	type: 'variable';
	name: string;
};

export type BashWordPartVariableBraced = {
	type: 'variableBraced';
	name: string;
	operator?: string;
	operand?: BashWord;
};

export type BashWordPartCommandSubstitution = {
	type: 'commandSubstitution';
	command: BashCommand;
};

export type BashWordPartBacktickSubstitution = {
	type: 'backtickSubstitution';
	command: BashCommand;
};

export type BashWordPartArithmeticExpansion = {
	type: 'arithmeticExpansion';
	expression: string;
};

export type BashWordPartProcessSubstitution = {
	type: 'processSubstitution';
	direction: '<' | '>';
	command: BashCommand;
};

// Redirect: file descriptor operations
export type BashRedirect = {
	fd?: number;
	operator: '>' | '>>' | '<' | '<<' | '<<<' | '>&' | '<&' | '>|';
	target: BashWord | BashHereDoc;
};

export type BashHereDoc = {
	type: 'hereDoc';
	delimiter: string;
	content: string;
	quoted: boolean;
};

// Assignment
export type BashAssignment = {
	name: string;
	value?: BashWord;
};

// Simple command: name + args + redirects
export type BashSimpleCommand = {
	type: 'simple';
	name?: BashWord;
	args: BashWord[];
	redirects: BashRedirect[];
	assignments: BashAssignment[];
};

// Compound commands (structural syntax only)
export type BashSubshell = {
	type: 'subshell';
	body: BashCommand;
};

export type BashBraceGroup = {
	type: 'braceGroup';
	body: BashCommand;
};

// While loop: while condition; do body; done
export type BashWhileLoop = {
	type: 'whileLoop';
	condition: BashCommand;
	body: BashCommand;
};

// Until loop: until condition; do body; done
export type BashUntilLoop = {
	type: 'untilLoop';
	condition: BashCommand;
	body: BashCommand;
};

// For-in loop: for name [in words]; do body; done
// words === undefined means no `in` clause (iterates over positional params)
export type BashForInLoop = {
	type: 'forInLoop';
	name: string;
	words?: BashWord[];
	body: BashCommand;
};

// C-style for loop: for (( init; condition; update )); do body; done
// init/condition/update may be empty strings
export type BashForArithmeticLoop = {
	type: 'forArithmeticLoop';
	init: string;
	condition: string;
	update: string;
	body: BashCommand;
};

// If/elif/else chain: first branch is `if`, remaining branches are `elif`
export type BashIfExpression = {
	type: 'ifExpression';
	branches: {
		condition: BashCommand;
		body: BashCommand;
	}[];
	elseBody?: BashCommand;
};

// Case branch terminator: ;; (break), ;& (fall-through), ;;& (test next patterns)
export type BashCaseTerminator = ';;' | ';&' | ';;&';

// Case statement: case word in [pattern1 | pattern2 ...) body terminator]... esac
export type BashCaseExpression = {
	type: 'caseExpression';
	word: BashWord;
	branches: {
		patterns: BashWord[];
		body?: BashCommand;
		terminator?: BashCaseTerminator;
	}[];
};

// Function declaration. Three surface forms:
//   function NAME { body; }          -> hasFunctionKeyword=true,  hasParentheses=false
//   function NAME() { body; }        -> hasFunctionKeyword=true,  hasParentheses=true
//   NAME() { body; }                 -> hasFunctionKeyword=false, hasParentheses=true
// Body must be a compound command (brace group, subshell, loop, conditional, etc.).
export type BashFunction = {
	type: 'function';
	hasFunctionKeyword: boolean;
	hasParentheses: boolean;
	name: string;
	body: BashCommandUnit;
};

export type BashCommandUnit =
	| BashSimpleCommand
	| BashSubshell
	| BashBraceGroup
	| BashWhileLoop
	| BashUntilLoop
	| BashForInLoop
	| BashForArithmeticLoop
	| BashIfExpression
	| BashCaseExpression
	| BashFunction;

// Pipeline: cmd1 | cmd2 | cmd3
export type BashPipeline = {
	type: 'pipeline';
	negated: boolean;
	commands: BashCommandUnit[];
};

export type BashCommandListSeparator = '&&' | '||' | ';' | '&' | '\n';

// Command list: pipelines connected by && || ; &
export type BashCommandList = {
	type: 'list';
	entries: {
		pipeline: BashPipeline;
		separator?: BashCommandListSeparator;
	}[];
};

// Top-level
export type BashCommand = BashCommandList;
export type BashScript = BashCommand;
