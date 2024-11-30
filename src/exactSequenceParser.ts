import { type Parser } from './parser.js';
import { parserParsingInvariant } from './parserParsingInvariant.js';

export const createExactSequenceParser = <Sequence>(sequence: Sequence): Parser<Sequence, Sequence, unknown> => async parserContext => {
	const length = parserContext.length(sequence);

	for (let index = 0; index < length; index++) {
		const element = await parserContext.read(0);
		const expectedElement = parserContext.at(sequence, index);

		parserParsingInvariant(
			element === expectedElement,
			'Expected "%s", got "%s", at index %s',
			expectedElement,
			element,
			index,
		);
	}

	return sequence;
};
