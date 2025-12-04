import { getParserName, type Parser, setParserName } from './parser.js';
import { isParserParsingFailedError, ParserParsingFailedError } from './parserError.js';

export const createOptionalParser = <Output, Sequence>(
	childParser: Parser<Output, Sequence>,
): Parser<undefined | Output, Sequence> => {
	const optionalParser: Parser<undefined | Output, Sequence> = async parserContext => {
		using childParserContext = parserContext.lookahead();

		try {
			const value = await childParser(childParserContext);
			childParserContext.unlookahead();
			return value;
		} catch (error) {
			if (isParserParsingFailedError(error)) {
				return undefined;
			}

			throw error;
		}
	};

	setParserName(optionalParser, getParserName(childParser, 'anonymousOptionalChild') + '?');

	return optionalParser;
};
