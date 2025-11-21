import { getParserName, type Parser, setParserName } from './parser.js';
import { isParserParsingFailedError } from './parserError.js';

export const createNonEmptyArrayParser = <ElementOutput, Sequence>(
	elementParser: Parser<ElementOutput, Sequence>,
): Parser<ElementOutput[], Sequence> => {
	const nonEmptyArrayParser: Parser<ElementOutput[], Sequence> = async parserContext => {
		const elements: ElementOutput[] = [];

		while (true) {
			const initialPosition = parserContext.position;
			// eslint-disable-next-line no-await-in-loop -- Sequential parsing is required
			const didParse = await parserContext.withLookahead(async elementParserContext => {
				try {
					const element = await elementParser(elementParserContext);
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
