import { type Parser } from './parser.js';
import { parserImplementationInvariant } from './parserImplementationInvariant.js';

export const createFixedLengthParser = <InputChunk>(length: number): Parser<InputChunk, InputChunk, unknown> => {
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
