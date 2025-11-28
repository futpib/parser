import { getParserName, setParserName, type Parser, type ParserOutput, type ParserSequence } from './parser.js';

// Extract only parser values from an object (filter out literals)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ExtractParsers<T> = T[keyof T] & Parser<any, any, any>;

// Extract Sequence from an object of parsers (finds parser's sequence type, ignoring literals)
type InferSequenceFromParsers<T> = ParserSequence<ExtractParsers<T>>;

// Extract output type: Parser<O, S> → O, literal L → L
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ExtractOutputOrLiteral<P> = P extends Parser<any, any, any> ? ParserOutput<P> : P;

// Filter out underscore-prefixed keys
type OmitUnderscoreKeys<T> = {
	[K in keyof T as K extends `_${string}` ? never : K]: T[K]
};

// Result type for object parser
type ObjectParserOutput<Parsers extends Record<string, unknown>> = OmitUnderscoreKeys<{
	[K in keyof Parsers]: ExtractOutputOrLiteral<Parsers[K]>
}>;

export function createObjectParser<
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const Parsers extends Record<string, Parser<any, any, any> | unknown>,
>(
	parsers: Parsers,
): Parser<ObjectParserOutput<Parsers>, InferSequenceFromParsers<Parsers>> {
	type Sequence = InferSequenceFromParsers<Parsers>;

	const objectParser: Parser<ObjectParserOutput<Parsers>, Sequence> = async parserContext => {
		const result: Record<string, unknown> = {};

		for (const [key, parserOrLiteral] of Object.entries(parsers)) {
			let value: unknown;

			if (typeof parserOrLiteral === 'function') {
				// It's a parser - execute it
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				value = await (parserOrLiteral as Parser<unknown, any>)(parserContext);
			} else {
				// It's a literal - use directly
				value = parserOrLiteral;
			}

			if (!key.startsWith('_')) {
				result[key] = value;
			}
		}

		return result as ObjectParserOutput<Parsers>;
	};

	setParserName(
		objectParser,
		'{' + Object.keys(parsers).map(k => {
			const v = parsers[k];
			if (typeof v === 'function') {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				return k.startsWith('_') ? k : getParserName(v as Parser<unknown, any>, k);
			}

			return `${k}: ${JSON.stringify(v)}`;
		}).join(', ') + '}',
	);

	return objectParser;
}
