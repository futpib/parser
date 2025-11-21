import { type Parser } from './parser.js';
import { isParserParsingFailedError } from './parserError.js';

/**
 * Helper function that implements the common array parsing loop pattern.
 * Used to reduce code duplication across arrayParser, nonEmptyArrayParser,
 * separatedArrayParser, and separatedNonEmptyArrayParser.
 *
 * @param parserContext - The parser context to use
 * @param getParser - Function that returns the parser to use for each iteration (may vary for separated arrays)
 * @param options - Configuration options
 * @returns Array of parsed elements
 */
export const parseArrayElements = async <ElementOutput, Sequence>(
	parserContext: Parameters<Parser<ElementOutput[], Sequence>>[0],
	getParser: (iterationIndex: number) => Parser<ElementOutput, Sequence>,
	options: {
		/**
		 * Whether to return immediately when no elements match (arrayParser behavior)
		 * vs. breaking and continuing to post-processing (nonEmptyArrayParser behavior)
		 */
		readonly returnOnNoMatch?: boolean;
	} = {},
): Promise<ElementOutput[]> => {
	const { returnOnNoMatch = false } = options;
	const elements: ElementOutput[] = [];
	let iterationIndex = 0;

	while (true) {
		const elementParser = getParser(iterationIndex);
		const elementParserContext = parserContext.lookahead();
		const initialPosition = elementParserContext.position;

		try {
			const element = await elementParser(elementParserContext);
			if (elementParserContext.position === initialPosition) {
				if (returnOnNoMatch) {
					return elements;
				}

				break;
			}

			elements.push(element);
			elementParserContext.unlookahead();
		} catch (error) {
			if (isParserParsingFailedError(error)) {
				if (returnOnNoMatch) {
					return elements;
				}

				break;
			}

			throw error;
		} finally {
			elementParserContext.dispose();
		}

		iterationIndex++;
	}

	return elements;
};
