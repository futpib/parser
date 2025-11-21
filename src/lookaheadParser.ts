import { getParserName, setParserName, type Parser } from './parser.js';
import { withLookahead } from './withLookahead.js';

export const createLookaheadParser = <Output, Sequence>(
	childParser: Parser<Output, Sequence>,
): Parser<Output, Sequence> => {
	const lookaheadParser: Parser<Output, Sequence> = async parserContext =>
		withLookahead(parserContext, childParser);

	setParserName(lookaheadParser, `(?=${getParserName(childParser)})`);

	return lookaheadParser;
};
