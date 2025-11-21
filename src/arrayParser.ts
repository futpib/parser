import { getParserName, type Parser, setParserName } from './parser.js';
import { parseArrayElements } from './arrayParserHelper.js';

export const createArrayParser = <ElementOutput, Sequence>(
	elementParser: Parser<ElementOutput, Sequence>,
): Parser<ElementOutput[], Sequence> => {
	const arrayParser: Parser<ElementOutput[], Sequence> = async parserContext => {
		return parseArrayElements(
			parserContext,
			() => elementParser,
			{ returnOnNoMatch: true },
		);
	};

	setParserName(arrayParser, getParserName(elementParser, 'anonymousArrayChild') + '*');

	return arrayParser;
};
