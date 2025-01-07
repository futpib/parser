import { getParserName, setParserName, type Parser } from './parser.js';
import { ParserParsingFailedError } from './parserError.js';

export const createNegativeLookaheadParser = <Sequence>(
	childParser: Parser<unknown, Sequence>,
): Parser<void, Sequence> => {
	const negativeLookaheadParser: Parser<void, Sequence> = async parserContext => {
		const childParserContext = parserContext.lookahead();

		let childParserSuccess: boolean;

		try {
			await childParser(childParserContext);

			childParserSuccess = true;
		} catch (error) {
			if (!(error instanceof ParserParsingFailedError)) {
				throw error;
			}

			childParserSuccess = false;
		} finally {
			childParserContext.dispose();
		}

		parserContext.invariant(
			!childParserSuccess,
			'Negative lookahead assertion failed for child parser %s.',
			getParserName(childParser),
		);
	};

	setParserName(negativeLookaheadParser, `(?!${getParserName(childParser)})`);

	return negativeLookaheadParser;
};
