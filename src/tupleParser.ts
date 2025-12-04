import { getParserName, setParserName, type Parser, type ParserOutput, type ParserSequence } from './parser.js';

// Map tuple of parsers to tuple of their outputs
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TupleParserOutput<Parsers extends readonly Parser<any, any, any>[]> = {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	[K in keyof Parsers]: Parsers[K] extends Parser<any, any, any> ? ParserOutput<Parsers[K]> : never
};

// Infer Sequence from parser array
type InferSequenceFromParserArray<T extends readonly unknown[]> = ParserSequence<T[number]>;

export function createTupleParser<
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const Parsers extends readonly Parser<any, any, any>[],
>(
	parsers: Parsers,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Parser<TupleParserOutput<Parsers>, InferSequenceFromParserArray<Parsers>, any> {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const tupleParser: Parser<any, any, any> = async parserContext => {
		const values: unknown[] = [];

		for (const parser of parsers) {
			const value = await parser(parserContext);

			values.push(value);
		}

		return values;
	};

	setParserName(
		tupleParser,
		parsers.map(parser => '(' + getParserName(parser, 'anonymousTupleChild') + ')').join(''),
	);

	return tupleParser;
}
