import { getParserName, type Parser, setParserName } from './parser.js';

export const createQuantifierParser = <Output, Sequence>(
	childParser: Parser<Output, Sequence>,
	count: number,
): Parser<Output[], Sequence> => {
	const quantifierParser: Parser<Output[], Sequence> = async parserContext => {
		const elements: Output[] = [];

		for (let index = 0; index < count; index++) {
			elements.push(await childParser(parserContext));
		}

		return elements;
	};

	setParserName(quantifierParser, [
		getParserName(childParser, 'anonymousQuantifierChild'),
		'{',
		count,
		'}',
	].join(''));

	return quantifierParser;
};
