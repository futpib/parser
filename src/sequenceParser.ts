import { Parser } from "./parser.js";

export function createSequenceParser<A, B, Sequence>([parserA, parserB]: [Parser<A, Sequence>, Parser<B, Sequence>]): Parser<[A, B], Sequence>;
export function createSequenceParser<A, B, C, Sequence>([parserA, parserB, parserC]: [Parser<A, Sequence>, Parser<B, Sequence>, Parser<C, Sequence>]): Parser<[A, B, C], Sequence>;
export function createSequenceParser<Sequence>(parsers: Parser<unknown, Sequence>[]): Parser<unknown[], Sequence> {
	return async inputContext => {
		const values: unknown[] = [];

		for (const parser of parsers) {
			const value = await parser(inputContext);

			values.push(value);
		}

		return values as unknown[];
	};
}
