import { setParserName, type Parser } from './parser.js';
import { inspect } from './inspect.js';

// Derive the base sequence type from a literal (e.g., 'foo' -> string, Uint8Array -> Uint8Array)
type DeriveBaseSequence<T> = T extends string ? string : T extends Uint8Array ? Uint8Array : T;

export const createExactSequenceNaiveParser = <const Output>(sequence: Output) => {
	type Sequence = DeriveBaseSequence<Output>;
	const exactSequenceParser: Parser<Output, Sequence, unknown> = async parserContext => {
		const length = parserContext.length(sequence as Sequence);

		for (let index = 0; index < length; index++) {
			const element = await parserContext.read(0);
			const expectedElement = parserContext.at(sequence as Sequence, index);

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

export const createExactSequenceParser = <const Output>(expectedSequence: Output) => {
	type Sequence = DeriveBaseSequence<Output>;
	const exactSequenceParser: Parser<Output, Sequence, unknown> = async parserContext => {
		const length = parserContext.length(expectedSequence as Sequence);

		const actualSequence = await parserContext.readSequence(0, length);

		parserContext.invariant(
			parserContext.equals(actualSequence, expectedSequence as Sequence),
			'Expected "%s", got "%s"',
			() => inspect(expectedSequence),
			() => inspect(actualSequence),
		);

		return expectedSequence;
	};

	setParserName(exactSequenceParser, inspect(expectedSequence));

	return exactSequenceParser;
};
