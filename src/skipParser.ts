import { setParserName, type Parser } from './parser.js';
import { parserImplementationInvariant } from './parserImplementationInvariant.js';

export const createSkipParser = <Sequence>(length: number): Parser<void, Sequence, unknown> => {
	parserImplementationInvariant(length > 0, 'Length must be positive.');

	const skipParser: Parser<void, Sequence, unknown> = parserContext => {
		parserContext.skip(length);
	};

	setParserName(skipParser, `createSkipParser(${length})`);

	return skipParser;
};
