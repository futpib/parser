import { getParserName, setParserName, type Parser } from './parser.js';

export const createLookaheadParser = <Output, Sequence>(
	childParser: Parser<Output, Sequence>,
): Parser<Output, Sequence> => {
	const lookaheadParser: Parser<Output, Sequence> = async parserContext => {
		using childParserContext = parserContext.lookahead();

		return childParser(childParserContext);
	};

	setParserName(lookaheadParser, `(?=${getParserName(childParser)})`);

	return lookaheadParser;
};
