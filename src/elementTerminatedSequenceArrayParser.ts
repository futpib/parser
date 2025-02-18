import { Parser, setParserName } from "./parser.js";
import { DeriveSequenceElement } from "./sequence.js";

export const createElementTerminatedSequenceArrayParser = <Sequence, Element = DeriveSequenceElement<Sequence>>(
	terminatorElement: Element,
): Parser<Sequence[], Sequence, Element> => {
	const elementTerminatedSequenceArrayParser: Parser<Sequence[], Sequence, Element> = async parserContext => {
		const sequences: Sequence[] = [];

		let start = 0;
		let window = 1;

		while (true) {
			const sequence = await parserContext.peekSequence(start, start + window);

			if (sequence === undefined) {
				window = Math.floor(window / 2);

				if (start === 0 && window === 0) {
					break;
				}

				parserContext.invariant(window > 0, 'Unexpected end of input without terminator');

				continue;
			}

			const terminatorIndex = parserContext.indexOf(sequence, terminatorElement);

			if (terminatorIndex === -1) {
				start += window;
				window *= 2;

				continue;
			}

			const sequence_ = await parserContext.readSequence(0, start + terminatorIndex);

			parserContext.skip(1);

			sequences.push(sequence_);

			start = 0;
		}

		return sequences;
	};

	setParserName(elementTerminatedSequenceArrayParser, `(.*?${JSON.stringify(terminatorElement)})*`);

	return elementTerminatedSequenceArrayParser;
};
