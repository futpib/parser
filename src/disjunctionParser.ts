import { getParserName, setParserName, type Parser, type ParserOutput, type ParserSequence } from './parser.js';
import { isParserParsingFailedError, ParserParsingFailedError } from './parserError.js';
import { parserImplementationInvariant } from './parserImplementationInvariant.js';
import { promiseSettled } from './promiseSettled.js';

// Union all output types from an array of parsers
type DisjunctionParserOutput<Parsers extends readonly unknown[]> = ParserOutput<Parsers[number]>;

// Infer Sequence from parser array
type InferSequenceFromParserArray<T extends readonly unknown[]> = ParserSequence<T[number]>;

export function createDisjunctionParser<
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const Parsers extends readonly Parser<any, any, any>[],
>(
	childParsers: Parsers,
): Parser<DisjunctionParserOutput<Parsers>, InferSequenceFromParserArray<Parsers>> {
	parserImplementationInvariant(childParsers.length > 0, 'Disjunction parser must have at least one child parser.');

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const disjunctionParser: Parser<any, any, any> = async parserContext => {
		const parserParsingFailedErrors: ParserParsingFailedError[] = [];

		for (const childParser of childParsers) {
			const childParserContext = parserContext.lookahead({
				debugName: getParserName(childParser, 'anonymousDisjunctionChild'),
			});

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const childParserResult = await promiseSettled<any>(childParser(childParserContext) as Promise<any>);

			if (childParserResult.status === 'fulfilled') {
				const successfulParserOutput = childParserResult.value;

				childParserContext.unlookahead();
				childParserContext.dispose();

				return successfulParserOutput;
			}

			childParserContext.dispose();

			const error = childParserResult.reason;

			if (isParserParsingFailedError(error)) {
				parserParsingFailedErrors.push(error);
			} else {
				throw error;
			}
		}

		return parserContext.invariantJoin(
			false,
			parserParsingFailedErrors,
			'No disjunction child parser succeeded.',
		);
	};

	const name = [
		'(',
		...childParsers.map(childParser => getParserName(childParser, 'anonymousDiscjunctionChild')).join('|'),
		')',
	].join('');

	return setParserName(disjunctionParser, name);
}
