
export type SymbolicExpressionAtom = { type: 'atom'; value: string };
export type SymbolicExpressionString = { type: 'string'; value: string };
export type SymbolicExpressionList = { type: 'list'; value: SymbolicExpression[] };
export type SymbolicExpressionQuote = { type: 'quote'; value: SymbolicExpression };
export type SymbolicExpressionQuasiquote = { type: 'quasiquote'; value: SymbolicExpression };
export type SymbolicExpressionUnquote = { type: 'unquote'; value: SymbolicExpression };
export type SymbolicExpressionUnquoteSplicing = { type: 'unquote-splicing'; value: SymbolicExpression };

export type SymbolicExpression =
	| SymbolicExpressionAtom
	| SymbolicExpressionString
	| SymbolicExpressionList
	| SymbolicExpressionQuote
	| SymbolicExpressionQuasiquote
	| SymbolicExpressionUnquote
	| SymbolicExpressionUnquoteSplicing;
