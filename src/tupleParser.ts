import { getParserName, setParserName, type Parser } from './parser.js';

export function createTupleParser<A, B, Sequence>([ parserA, parserB ]: [Parser<A, Sequence>, Parser<B, Sequence>]): Parser<[A, B], Sequence>;
export function createTupleParser<A, B, C, Sequence>([ parserA, parserB, parserC ]: [Parser<A, Sequence>, Parser<B, Sequence>, Parser<C, Sequence>]): Parser<[A, B, C], Sequence>;
export function createTupleParser<A, B, C, D, Sequence>([ parserA, parserB, parserC, parserD ]: [Parser<A, Sequence>, Parser<B, Sequence>, Parser<C, Sequence>, Parser<D, Sequence>]): Parser<[A, B, C, D], Sequence>;
export function createTupleParser<A, B, C, D, E, Sequence>([ parserA, parserB, parserC, parserD, parserE ]: [Parser<A, Sequence>, Parser<B, Sequence>, Parser<C, Sequence>, Parser<D, Sequence>, Parser<E, Sequence>]): Parser<[A, B, C, D, E], Sequence>;
export function createTupleParser<A, B, C, D, E, F, Sequence>([ parserA, parserB, parserC, parserD, parserE, parserF ]: [Parser<A, Sequence>, Parser<B, Sequence>, Parser<C, Sequence>, Parser<D, Sequence>, Parser<E, Sequence>, Parser<F, Sequence>]): Parser<[A, B, C, D, E, F], Sequence>;
export function createTupleParser<A, B, C, D, E, F, G, Sequence>([ parserA, parserB, parserC, parserD, parserE, parserF, parserG ]: [Parser<A, Sequence>, Parser<B, Sequence>, Parser<C, Sequence>, Parser<D, Sequence>, Parser<E, Sequence>, Parser<F, Sequence>, Parser<G, Sequence>]): Parser<[A, B, C, D, E, F, G], Sequence>;
export function createTupleParser<A, B, C, D, E, F, G, H, Sequence>([ parserA, parserB, parserC, parserD, parserE, parserF, parserG, parserH ]: [Parser<A, Sequence>, Parser<B, Sequence>, Parser<C, Sequence>, Parser<D, Sequence>, Parser<E, Sequence>, Parser<F, Sequence>, Parser<G, Sequence>, Parser<H, Sequence>]): Parser<[A, B, C, D, E, F, G, H], Sequence>;
export function createTupleParser<A, B, C, D, E, F, G, H, I, Sequence>([ parserA, parserB, parserC, parserD, parserE, parserF, parserG, parserH, parserI ]: [Parser<A, Sequence>, Parser<B, Sequence>, Parser<C, Sequence>, Parser<D, Sequence>, Parser<E, Sequence>, Parser<F, Sequence>, Parser<G, Sequence>, Parser<H, Sequence>, Parser<I, Sequence>]): Parser<[A, B, C, D, E, F, G, H, I], Sequence>;
export function createTupleParser<A, B, C, D, E, F, G, H, I, J, Sequence>([ parserA, parserB, parserC, parserD, parserE, parserF, parserG, parserH, parserI, parserJ ]: [Parser<A, Sequence>, Parser<B, Sequence>, Parser<C, Sequence>, Parser<D, Sequence>, Parser<E, Sequence>, Parser<F, Sequence>, Parser<G, Sequence>, Parser<H, Sequence>, Parser<I, Sequence>, Parser<J, Sequence>]): Parser<[A, B, C, D, E, F, G, H, I, J], Sequence>;
export function createTupleParser<A, B, C, D, E, F, G, H, I, J, K, Sequence>([ parserA, parserB, parserC, parserD, parserE, parserF, parserG, parserH, parserI, parserJ, parserK ]: [Parser<A, Sequence>, Parser<B, Sequence>, Parser<C, Sequence>, Parser<D, Sequence>, Parser<E, Sequence>, Parser<F, Sequence>, Parser<G, Sequence>, Parser<H, Sequence>, Parser<I, Sequence>, Parser<J, Sequence>, Parser<K, Sequence>]): Parser<[A, B, C, D, E, F, G, H, I, J, K], Sequence>;
export function createTupleParser<A, B, C, D, E, F, G, H, I, J, K, L, Sequence>([ parserA, parserB, parserC, parserD, parserE, parserF, parserG, parserH, parserI, parserJ, parserK, parserL ]: [Parser<A, Sequence>, Parser<B, Sequence>, Parser<C, Sequence>, Parser<D, Sequence>, Parser<E, Sequence>, Parser<F, Sequence>, Parser<G, Sequence>, Parser<H, Sequence>, Parser<I, Sequence>, Parser<J, Sequence>, Parser<K, Sequence>, Parser<L, Sequence>]): Parser<[A, B, C, D, E, F, G, H, I, J, K, L], Sequence>;
export function createTupleParser<A, B, C, D, E, F, G, H, I, J, K, L, M, Sequence>([ parserA, parserB, parserC, parserD, parserE, parserF, parserG, parserH, parserI, parserJ, parserK, parserL, parserM ]: [Parser<A, Sequence>, Parser<B, Sequence>, Parser<C, Sequence>, Parser<D, Sequence>, Parser<E, Sequence>, Parser<F, Sequence>, Parser<G, Sequence>, Parser<H, Sequence>, Parser<I, Sequence>, Parser<J, Sequence>, Parser<K, Sequence>, Parser<L, Sequence>, Parser<M, Sequence>]): Parser<[A, B, C, D, E, F, G, H, I, J, K, L, M], Sequence>;
export function createTupleParser<A, B, C, D, E, F, G, H, I, J, K, L, M, N, Sequence>([ parserA, parserB, parserC, parserD, parserE, parserF, parserG, parserH, parserI, parserJ, parserK, parserL, parserM, parserN ]: [Parser<A, Sequence>, Parser<B, Sequence>, Parser<C, Sequence>, Parser<D, Sequence>, Parser<E, Sequence>, Parser<F, Sequence>, Parser<G, Sequence>, Parser<H, Sequence>, Parser<I, Sequence>, Parser<J, Sequence>, Parser<K, Sequence>, Parser<L, Sequence>, Parser<M, Sequence>, Parser<N, Sequence>]): Parser<[A, B, C, D, E, F, G, H, I, J, K, L, M, N], Sequence>;
export function createTupleParser<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, Sequence>([ parserA, parserB, parserC, parserD, parserE, parserF, parserG, parserH, parserI, parserJ, parserK, parserL, parserM, parserN, parserO ]: [Parser<A, Sequence>, Parser<B, Sequence>, Parser<C, Sequence>, Parser<D, Sequence>, Parser<E, Sequence>, Parser<F, Sequence>, Parser<G, Sequence>, Parser<H, Sequence>, Parser<I, Sequence>, Parser<J, Sequence>, Parser<K, Sequence>, Parser<L, Sequence>, Parser<M, Sequence>, Parser<N, Sequence>, Parser<O, Sequence>]): Parser<[A, B, C, D, E, F, G, H, I, J, K, L, M, N, O], Sequence>;
export function createTupleParser<Sequence>(parsers: Array<Parser<unknown, Sequence>>): Parser<unknown[], Sequence> {
	const tupleParser: Parser<unknown[], Sequence> = async parserContext => {
		const values: unknown[] = [];

		for (const parser of parsers) {
			const value = await parser(parserContext);

			values.push(value);
		}

		return values;
	};

	setParserName(tupleParser, [
		'[',
		parsers.map(parser => getParserName(parser, 'anonymousTupleChild')).join(','),
		']',
	].join(''));

	return tupleParser;
}
