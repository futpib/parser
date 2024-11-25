import { type Parser } from './parser.js';
import { parserImplementationInvariant } from './parserImplementationInvariant.js';

export const createFixedLengthParser = <Sequence>(length: number): Parser<Sequence, Sequence, unknown> => {
	parserImplementationInvariant(length > 0, 'Length must be positive.');

	return async parserContext => {
		const elements = [];

		for (let i = 0; i < length; i++) {
			const element = await parserContext.read(0);

			elements.push(element);
		}

		return parserContext.from(elements);
	};
};
