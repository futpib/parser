import { getParserName, type Parser } from './parser.js';
import { ParserParsingFailedError } from './parserError.js';

export const createNegativeLookaheadParser = <Sequence>(
	childParser: Parser<unknown, Sequence>,
): Parser<void, Sequence> => async parserContext => {
	const childParserContext = parserContext.lookahead();
	try {
		await childParser(childParserContext);
		parserContext.invariant(
			false,
			'Negative lookahead assertion failed for child parser %s.',
			getParserName(childParser),
		);
	} catch (error) {
		if (error instanceof ParserParsingFailedError) {
			return;
		}

		throw error;
	} finally {
		childParserContext.dispose();
	}
};
