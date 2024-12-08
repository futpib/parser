import { inspect } from 'node:util';
import { setParserName, type Parser } from './parser.js';

export const createExactSequenceParser = <Sequence>(sequence: Sequence) => {
	const exactSequenceParser: Parser<Sequence, Sequence, unknown> = async parserContext => {
		const length = parserContext.length(sequence);

		for (let index = 0; index < length; index++) {
			const element = await parserContext.read(0);
			const expectedElement = parserContext.at(sequence, index);

			parserContext.invariant(
				element === expectedElement,
				'Expected "%s", got "%s", at index %s',
				expectedElement,
				element,
				index,
			);
		}

		return sequence;
	};

	setParserName(exactSequenceParser, inspect(sequence));

	return exactSequenceParser;
};
