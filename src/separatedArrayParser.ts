import { getParserName, type Parser, setParserName } from './parser.js';
import { isParserParsingFailedError } from './parserError.js';
import { promiseCompose } from './promiseCompose.js';
import { createTupleParser } from './tupleParser.js';

export const createSeparatedArrayParser = <ElementOutput, Sequence>(
	elementParser: Parser<ElementOutput, Sequence>,
	separatorParser: Parser<unknown, Sequence>,
): Parser<ElementOutput[], Sequence> => {
	const separatorThenElementParser: Parser<ElementOutput, Sequence> = promiseCompose(
		createTupleParser([
			separatorParser,
			elementParser,
		]),
		([ , element ]) => element,
	);

	const separatedArrayParser: Parser<ElementOutput[], Sequence> = async parserContext => {
		let parser = elementParser;

		const elements: ElementOutput[] = [];

		while (true) {
			const elementParserContext = parserContext.lookahead();
			const initialPosition = elementParserContext.position;

			try {
				const element = await parser(elementParserContext);

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
			} finally {
				elementParserContext.dispose();
			}

			parser = separatorThenElementParser;
		}

		return elements;
	};

	setParserName(separatedArrayParser, getParserName(elementParser, 'anonymousSeparatedArrayChild') + '*');

	return separatedArrayParser;
};
