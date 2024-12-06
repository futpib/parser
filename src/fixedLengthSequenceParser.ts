import { setParserName, type Parser } from './parser.js';
import { parserImplementationInvariant } from './parserImplementationInvariant.js';

export const createFixedLengthSequenceParser = <Sequence>(length: number) => {
	parserImplementationInvariant(length >= 0, 'Length must be non-negative got %s.', length);

	const fixedLengthSequenceParser: Parser<Sequence, Sequence, unknown> = async parserContext => {
		const elements = [];

		for (let i = 0; i < length; i++) {
			const element = await parserContext.read(0);

			elements.push(element);
		}

		return parserContext.from(elements);
	};

	setParserName(fixedLengthSequenceParser, `.{${length}}`);

	return fixedLengthSequenceParser;
};
