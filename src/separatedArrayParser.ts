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
			const initialPosition = parserContext.position;

			// eslint-disable-next-line no-await-in-loop, @typescript-eslint/no-loop-func -- Sequential parsing is required, parser variable is intentionally captured
			const didParse = await parserContext.withLookahead(async elementParserContext => {
				try {
					const element = await parser(elementParserContext);

					if (elementParserContext.position === initialPosition) {
						return false;
					}

					elements.push(element);
					elementParserContext.unlookahead();
					return true;
				} catch (error) {
					if (isParserParsingFailedError(error)) {
						return false;
					}

					throw error;
				}
			});

			if (!didParse) {
				break;
			}

			parser = separatorThenElementParser;
		}

		return elements;
	};

	setParserName(separatedArrayParser, getParserName(elementParser, 'anonymousSeparatedArrayChild') + '*');

	return separatedArrayParser;
};
