import { getParserName, type Parser, setParserName } from './parser.js';
import { type DeriveSequenceElement } from './sequence.js';

export const createElementTerminatedArrayParserUnsafe = <ElementOutput, Sequence, Element = DeriveSequenceElement<Sequence>>(
	elementParser: Parser<ElementOutput, Sequence>,
	terminatorElement: Element,
): Parser<ElementOutput[], Sequence> => {
	const elementTerminatedArrayParserUnsafe: Parser<ElementOutput[], Sequence> = async parserContext => {
		const elements: ElementOutput[] = [];

		while (true) {
			const inputElement = await parserContext.peek(0);

			if (inputElement === terminatorElement) {
				parserContext.skip(1);

				break;
			}

			const element = await elementParser(parserContext);

			elements.push(element);
		}

		return elements;
	};

	setParserName(elementTerminatedArrayParserUnsafe, `${getParserName(elementParser, 'anonymousElement')}*?${JSON.stringify(terminatorElement)}`);

	return elementTerminatedArrayParserUnsafe;
};
