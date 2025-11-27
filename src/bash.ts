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
	| BashWordPartArithmeticExpansion;

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

export type BashCommandUnit = BashSimpleCommand | BashSubshell | BashBraceGroup;

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
