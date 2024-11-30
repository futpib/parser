import { type Parser } from './parser.js';

export function createTupleParser<A, B, Sequence>([ parserA, parserB ]: [Parser<A, Sequence>, Parser<B, Sequence>]): Parser<[A, B], Sequence>;
export function createTupleParser<A, B, C, Sequence>([ parserA, parserB, parserC ]: [Parser<A, Sequence>, Parser<B, Sequence>, Parser<C, Sequence>]): Parser<[A, B, C], Sequence>;
export function createTupleParser<Sequence>(parsers: Array<Parser<unknown, Sequence>>): Parser<unknown[], Sequence> {
	return async parserContext => {
		const values: unknown[] = [];

		for (const parser of parsers) {
			const value = await parser(parserContext);

			values.push(value);
		}

		return values;
	};
}