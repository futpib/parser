import { getParserName, type Parser, setParserName } from './parser.js';
import { isParserParsingFailedError, ParserParsingFailedError } from './parserError.js';

export const createNonEmptyArrayParser = <ElementOutput, Sequence>(
	elementParser: Parser<ElementOutput, Sequence>,
): Parser<ElementOutput[], Sequence> => {
	const nonEmptyArrayParser: Parser<ElementOutput[], Sequence> = async parserContext => {
		const elements: ElementOutput[] = [];

		while (true) {
			using elementParserContext = parserContext.lookahead();
			const initialPosition = elementParserContext.position;
			try {
				const element = await elementParser(elementParserContext);
				if (elementParserContext.position === initialPosition) {
					break;
				}

				elements.push(element);
				elementParserContext.unlookahead();
			} catch (error) {
				if (isParserParsingFailedError(error)) {
					break;
				}

				throw error;
			}
		}

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
