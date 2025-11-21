import { getParserName, setParserName, type Parser } from './parser.js';
import { isParserParsingFailedError } from './parserError.js';
import { withLookahead } from './withLookahead.js';

export const createNegativeLookaheadParser = <Sequence>(
	childParser: Parser<unknown, Sequence>,
): Parser<void, Sequence> => {
	const negativeLookaheadParser: Parser<void, Sequence> = async parserContext => {
		const childParserSuccess = await withLookahead(parserContext, async childParserContext => {
			try {
				await childParser(childParserContext);
				return true;
			} catch (error) {
				if (!isParserParsingFailedError(error)) {
					throw error;
				}

				return false;
			}
		});

		parserContext.invariant(
			!childParserSuccess,
			'Negative lookahead assertion failed for child parser %s.',
			getParserName(childParser),
		);
	};

	setParserName(negativeLookaheadParser, `(?!${getParserName(childParser)})`);

	return negativeLookaheadParser;
};
