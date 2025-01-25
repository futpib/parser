import { getParserName, setParserName, type Parser } from './parser.js';

export const createLookaheadParser = <Output, Sequence>(
	childParser: Parser<Output, Sequence>,
): Parser<Output, Sequence> => {
	const lookaheadParser: Parser<Output, Sequence> = async parserContext => {
		const childParserContext = parserContext.lookahead();

		try {
			return await childParser(childParserContext);
		} finally {
			childParserContext.dispose();
		}
	};

	setParserName(lookaheadParser, `(?=${getParserName(childParser)})`);

	return lookaheadParser;
};
