import { getParserName, type Parser, setParserName } from './parser.js';
import { ParserParsingFailedError } from './parserError.js';
import { promiseCompose } from './promiseCompose.js';
import { createTupleParser } from './tupleParser.js';

export const createSeparatedNonEmptyArrayParser = <ElementOutput, Sequence>(
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

	const separatedNonEmptyArrayParser: Parser<ElementOutput[], Sequence> = async parserContext => {
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
				if (error instanceof ParserParsingFailedError) {
					break;
				}

				throw error;
			} finally {
				elementParserContext.dispose();
			}

			parser = separatorThenElementParser
		}

		parserContext.invariant(
			elements.length > 0,
			'Expected elementParser (%s) to match at least once',
			getParserName(elementParser, 'anonymousSeparatedNonEmptyArrayChild'),
		);

		return elements;
	};

	setParserName(separatedNonEmptyArrayParser, getParserName(elementParser, 'anonymousSeparatedNonEmptyArrayChild') + '+');

	return separatedNonEmptyArrayParser;
};