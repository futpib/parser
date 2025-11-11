import { type Parser, setParserName } from './parser.js';
import { parserImplementationInvariant } from './parserImplementationInvariant.js';

export const createSkipToParser = (offset: number): Parser<void, Uint8Array> => {
	const skipToParser: Parser<void, Uint8Array> = parserContext => {
		const length = offset - parserContext.position;

		parserImplementationInvariant(length >= 0, 'Skip length must be positive, got %s (position: %s)', length, parserContext.position);

		parserContext.skip(length);
	};

	setParserName(skipToParser, `createSkipToParser(${offset})`);

	return skipToParser;
};
