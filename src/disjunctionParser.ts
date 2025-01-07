import { getParserName, setParserName, type Parser } from './parser.js';
import { ParserParsingFailedError } from './parserError.js';
import { parserImplementationInvariant } from './parserImplementationInvariant.js';

export const createDisjunctionParser = <
	Output,
	Sequence,
>(
	childParsers: Array<Parser<any, Sequence, any>>,
): Parser<Output, Sequence, unknown> => {
	parserImplementationInvariant(childParsers.length > 0, 'Disjunction parser must have at least one child parser.');

	const disjunctionParser: Parser<Output, Sequence, unknown> = async parserContext => {
		const parserParsingFailedErrors: ParserParsingFailedError[] = [];

		for (const childParser of childParsers) {
			const childParserContext = parserContext.lookahead({
				debugName: getParserName(childParser, 'anonymousDisjunctionChild'),
			});

			const [ childParserResult ] = await Promise.allSettled([ childParser(childParserContext) ]);

			if (childParserResult.status === 'fulfilled') {
				const successfulParserOutput = childParserResult.value;

				childParserContext.unlookahead();
				childParserContext.dispose();

				return successfulParserOutput;
			}

			childParserContext.dispose();

			const error = childParserResult.reason;

			if (error instanceof ParserParsingFailedError) {
				parserParsingFailedErrors.push(error);
			} else {
				throw error;
			}
		}

		parserContext.invariantJoin(
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
};
