import { setParserName, type Parser } from './parser.js';
import { parserImplementationInvariant } from './parserImplementationInvariant.js';

export const createFixedLengthSequenceParserNaive = <Sequence>(lengthInput: bigint | number) => {
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

const MAX_SAFE_INTEGER = BigInt(Number.MAX_SAFE_INTEGER);

export const createFixedLengthSequenceParser = <Sequence>(lengthInput: bigint | number) => {
	const length = BigInt(lengthInput);

	parserImplementationInvariant(length >= 0n, 'Length must be non-negative got %s.', length);

	const fixedLengthSequenceParser: Parser<Sequence, Sequence, unknown> = async parserContext => {
		const safeIntegerSequences: Sequence[] = [];
		let remainingLength = length;

		while (remainingLength > 0n) {
			const safeIntegerLength = length > MAX_SAFE_INTEGER ? Number.MAX_SAFE_INTEGER : Number(length);

			safeIntegerSequences.push(await parserContext.readSequence(0, safeIntegerLength));

			remainingLength -= BigInt(safeIntegerLength);
		}

		return parserContext.concat(safeIntegerSequences);
	};

	setParserName(fixedLengthSequenceParser, `.{${length}}`);

	return fixedLengthSequenceParser;
};
