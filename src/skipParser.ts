import { type Parser } from './parser.js';
import { parserImplementationInvariant } from './parserImplementationInvariant.js';

export const createSkipParser = <Sequence>(length: number): Parser<undefined, Sequence, unknown> => {
	parserImplementationInvariant(length > 0, 'Length must be positive.');

	return async parserContext => {
		parserContext.skip(length);

		return undefined;
	};
};
