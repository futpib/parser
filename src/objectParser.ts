import { getParserName, setParserName, type Parser } from './parser.js';

// Infer Sequence type from a parser
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type InferSequence<T> = T extends Parser<any, infer S, any> ? S : never;

// Extract Sequence from an object of parsers (finds first parser's sequence type)
type InferSequenceFromParsers<T> = InferSequence<T[keyof T]>;

// Extract output type: Parser<O, S> → O, literal L → L
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ExtractOutput<P> = P extends Parser<infer O, any, any> ? O : P;

// Filter out underscore-prefixed keys
type OmitUnderscoreKeys<T> = {
	[K in keyof T as K extends `_${string}` ? never : K]: T[K]
};

// Result type for object parser
type ObjectParserOutput<Parsers extends Record<string, unknown>> = OmitUnderscoreKeys<{
	[K in keyof Parsers]: ExtractOutput<Parsers[K]>
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
