import { getParserName, Parser, setParserName } from "./parser.js";
import { ParserParsingFailedError } from "./parserError.js";

export const createSliceBoundedParser = <Output, Sequence>(
	childParser: Parser<Output, Sequence>,
	sliceEnd: number,
): Parser<undefined | Output, Sequence> => {
	const sliceBoundedParser: Parser<undefined | Output, Sequence> = async parserContext => {
		const childParserContext = parserContext.lookahead({
			sliceEnd,
		});

		try {
			const value = await childParser(childParserContext);
			childParserContext.unlookahead();
			return value;
		} catch (error) {
			if (error instanceof ParserParsingFailedError) {
				return undefined;
			}

			throw error;
		} finally {
			childParserContext.dispose();
		}
	};

	setParserName(sliceBoundedParser, getParserName(childParser, 'anonymousSliceBoundedChild') + '?');

	return sliceBoundedParser;
}
