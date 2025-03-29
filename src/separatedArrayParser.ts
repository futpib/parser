import { getParserName, type Parser, setParserName } from './parser.js';
import { ParserParsingFailedError } from './parserError.js';

export const createSeparatedArrayParser = <ElementOutput, Sequence>(
	elementParser: Parser<ElementOutput, Sequence>,
	separatorParser: Parser<unknown, Sequence>,
): Parser<ElementOutput[], Sequence> => {
	const separatedArrayParser: Parser<ElementOutput[], Sequence> = async parserContext => {
		const elements: ElementOutput[] = [];

		while (true) {
			const elementParserContext = parserContext.lookahead();
			const initialPosition = elementParserContext.position;

			try {
				const element = await elementParser(elementParserContext);

				if (elementParserContext.position === initialPosition) {
					break;
				}

				elements.push(element);
				elementParserContext.unlookahead();
			} catch (error) {
				if (error instanceof ParserParsingFailedError) {
					break;
				}

				throw error;
			} finally {
				elementParserContext.dispose();
			}

			const separatorParserContext = parserContext.lookahead();

			try {
				await separatorParser(separatorParserContext);

				separatorParserContext.unlookahead();
			} catch (error) {
				if (error instanceof ParserParsingFailedError) {
					break;
				}

				throw error;
			} finally {
				separatorParserContext.dispose();
			}
		}

		return elements;
	};

	setParserName(separatedArrayParser, getParserName(elementParser, 'anonymousSeparatedArrayChild') + '*');

	return separatedArrayParser;
};
