import type * as estree from 'estree';
import * as acorn from 'acorn';
import { type Parser } from './parser.js';
import { promiseCompose } from './promiseCompose.js';
import { createRegExpParser } from './regexpParser.js';

type PositionalFields = 'loc' | 'range' | 'start' | 'end' | 'leadingComments' | 'trailingComments' | 'comments' | 'innerComments';

export type StripMeta<T> =
	T extends Array<infer U> ? Array<StripMeta<U>> :
		T extends object ? { [K in Exclude<keyof T, PositionalFields>]: StripMeta<T[K]> } :
			T;

export type JavaScriptProgram = StripMeta<estree.Program>;

function stripMeta(node: unknown): unknown {
	if (node === null || node === undefined) {
		return node;
	}

	if (typeof node !== 'object') {
		return node;
	}

	if (Array.isArray(node)) {
		return node.map(element => stripMeta(element));
	}

	const result: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(node)) {
		if (
			key === 'loc'
			|| key === 'range'
			|| key === 'start'
			|| key === 'end'
			|| key === 'raw'
			|| key === 'leadingComments'
			|| key === 'trailingComments'
			|| key === 'comments'
			|| key === 'innerComments'
		) {
			continue;
		}

		result[key] = stripMeta(value);
	}

	return result;
}

export const javaScriptProgramParser: Parser<JavaScriptProgram, string> = promiseCompose(
	createRegExpParser(/[\s\S]*/),
	match => {
		const ast = acorn.parse(match[0], { ecmaVersion: 'latest', sourceType: 'script' });
		return stripMeta(ast) as JavaScriptProgram;
	},
);
