import { getParserName, Parser, setParserName } from "./parser.js";
import { ParserParsingFailedError } from "./parserError.js";

export const createOptionalParser = <Output, Sequence>(
	childParser: Parser<Output, Sequence>,
): Parser<undefined | Output, Sequence> => {
	const optionalParser: Parser<undefined | Output, Sequence> = async parserContext => {
		const childParserContext = parserContext.lookahead();
		try {
			return await childParser(childParserContext);
		} catch (error) {
			if (error instanceof ParserParsingFailedError) {
				return undefined;
			}

			throw error;
		} finally {
			childParserContext.dispose();
		}
	};

	setParserName(optionalParser, getParserName(childParser, 'anonymousOptionalChild') + '?');

	return optionalParser;
}
