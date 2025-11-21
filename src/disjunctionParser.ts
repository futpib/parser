import { getParserName, setParserName, type Parser } from './parser.js';
import { isParserParsingFailedError, ParserParsingFailedError } from './parserError.js';
import { parserImplementationInvariant } from './parserImplementationInvariant.js';
import { promiseSettled } from './promiseSettled.js';
import { type DeriveSequenceElement } from './sequence.js';

export const createDisjunctionParser = <
	Output,
	Sequence,
	Element = DeriveSequenceElement<Sequence>,
>(
	childParsers: Array<Parser<unknown, Sequence, Element>>,
): Parser<Output, Sequence, Element> => {
	parserImplementationInvariant(childParsers.length > 0, 'Disjunction parser must have at least one child parser.');

	const disjunctionParser: Parser<Output, Sequence, Element> = async parserContext => {
		const parserParsingFailedErrors: ParserParsingFailedError[] = [];

		for (const childParser of childParsers) {
			const childParserContext = parserContext.lookahead({
				debugName: getParserName(childParser, 'anonymousDisjunctionChild'),
			});

			const childParserResult = await promiseSettled<Output>(childParser(childParserContext) as Promise<Output>);

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
};
