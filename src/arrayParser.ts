import { getParserName, Parser, setParserName } from "./parser.js";
import { ParserParsingFailedError } from "./parserError.js";

export const createArrayParser = <ElementOutput, Sequence>(
	elementParser: Parser<ElementOutput, Sequence>,
): Parser<ElementOutput[], Sequence> => {
	const arrayParser: Parser<ElementOutput[], Sequence> = async parserContext => {
		const elements: ElementOutput[] = [];

		while (true) {
			const elementParserContext = parserContext.lookahead();
			const initialPosition = elementParserContext.position;
			try {
				const element = await elementParser(elementParserContext);
				if (elementParserContext.position === initialPosition) {
					return elements;
				}
				elements.push(element);
				elementParserContext.unlookahead();
			} catch (error) {
				if (error instanceof ParserParsingFailedError) {
					return elements;
				}

				throw error;
			} finally {
				elementParserContext.dispose();
			}
		}
	};

	setParserName(arrayParser, getParserName(elementParser, 'anonymousArrayChild') + '*');

	return arrayParser;
};
