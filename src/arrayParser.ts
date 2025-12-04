import { getParserName, type Parser, setParserName } from './parser.js';
import { isParserParsingFailedError } from './parserError.js';

export const createArrayParser = <ElementOutput, Sequence>(
	elementParser: Parser<ElementOutput, Sequence>,
): Parser<ElementOutput[], Sequence> => {
	const arrayParser: Parser<ElementOutput[], Sequence> = async parserContext => {
		const elements: ElementOutput[] = [];

		while (true) {
			using elementParserContext = parserContext.lookahead();
			const initialPosition = elementParserContext.position;
			try {
				const element = await elementParser(elementParserContext);
				if (elementParserContext.position === initialPosition) {
					return elements;
				}

				elements.push(element);
				elementParserContext.unlookahead();
			} catch (error) {
				if (isParserParsingFailedError(error)) {
					return elements;
				}

				throw error;
			}
		}
	};

	setParserName(arrayParser, getParserName(elementParser, 'anonymousArrayChild') + '*');

	return arrayParser;
};
