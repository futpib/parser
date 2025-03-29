import { inspect } from 'node:util';
import { setParserName, type Parser } from './parser.js';

export const createExactSequenceNaiveParser = <Sequence>(sequence: Sequence) => {
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

export const createExactSequenceParser = <Sequence>(expectedSequence: Sequence) => {
	const exactSequenceParser: Parser<Sequence, Sequence, unknown> = async parserContext => {
		const length = parserContext.length(expectedSequence);

		const actualSequence = await parserContext.readSequence(0, length);

		parserContext.invariant(
			parserContext.equals(actualSequence, expectedSequence),
			'Expected "%s", got "%s"',
			expectedSequence,
			actualSequence,
		);

		return expectedSequence;
	};

	setParserName(exactSequenceParser, inspect(expectedSequence));

	return exactSequenceParser;
};
