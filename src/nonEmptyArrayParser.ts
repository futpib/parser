import { getParserName, type Parser, setParserName } from './parser.js';
import { parseArrayElements } from './arrayParserHelper.js';

export const createNonEmptyArrayParser = <ElementOutput, Sequence>(
	elementParser: Parser<ElementOutput, Sequence>,
): Parser<ElementOutput[], Sequence> => {
	const nonEmptyArrayParser: Parser<ElementOutput[], Sequence> = async parserContext => {
		const elements = await parseArrayElements(
			parserContext,
			() => elementParser,
			{ returnOnNoMatch: false },
		);

		parserContext.invariant(
			elements.length > 0,
			'Expected elementParser (%s) to match at least once',
			getParserName(elementParser, 'anonymousNonEmptyArrayChild'),
		);

		return elements;
	};

	setParserName(nonEmptyArrayParser, getParserName(elementParser, 'anonymousNonEmptyArrayChild') + '+');

	return nonEmptyArrayParser;
};
