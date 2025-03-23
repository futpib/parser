import { getParserName, setParserName, type Parser } from './parser.js';

export const createParserAccessorParser = <Output, Sequence>(parserAccessor: () => Parser<Output, Sequence>): Parser<Output, Sequence> => {
	const parserAccessorParser: Parser<Output, Sequence> = async parserContext => {
		const parser = parserAccessor();

		setParserName(parserAccessorParser, `parserAccessorParser(${getParserName(parser, 'anonymousParserAccessor')})`);

		return parser(parserContext);
	};

	return parserAccessorParser;
}
