import { setParserName, type Parser } from './parser.js';
import { parserImplementationInvariant } from './parserImplementationInvariant.js';

export const createFixedLengthSequenceParser = <Sequence>(lengthInput: bigint | number) => {
	const length = BigInt(lengthInput);

	parserImplementationInvariant(length >= 0n, 'Length must be non-negative got %s.', length);

	const fixedLengthSequenceParser: Parser<Sequence, Sequence, unknown> = async parserContext => {
		const elements = [];

		for (let i = 0n; i < length; i++) {
			const element = await parserContext.read(0);

			elements.push(element);
		}

		return parserContext.from(elements);
	};

	setParserName(fixedLengthSequenceParser, `.{${length}}`);

	return fixedLengthSequenceParser;
};
