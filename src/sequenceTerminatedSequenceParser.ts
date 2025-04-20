import { inspect } from "./inspect.js";
import { Parser, setParserName } from "./parser.js";
import { DeriveSequenceElement } from "./sequence.js";

export const createSequenceTerminatedSequenceParser = <Sequence, Element = DeriveSequenceElement<Sequence>>(
	terminatorSequence: Sequence,
	{
		consumeTerminator = true,
	}: {
		consumeTerminator?: boolean;
	} = {},
): Parser<Sequence, Sequence, Element> => {
	const elementTerminatedSequenceParser: Parser<Sequence, Sequence, Element> = async parserContext => {
		let start = 0;
		let window = 1;

		while (true) {
			const sequence = await parserContext.peekSequence(start, start + window);

			if (sequence === undefined) {
				window = Math.floor(window / 2);

				parserContext.invariant(!(start === 0 && window === 0), 'Unexpected end of input without terminated sequence');
				parserContext.invariant(window > 0, 'Unexpected end of input without terminator');

				continue;
			}

			const terminatorIndex = parserContext.indexOfSubsequence(sequence, terminatorSequence);

			if (terminatorIndex === -1) {
				start += window;
				window *= 2;

				continue;
			}

			const sequence_ = await parserContext.readSequence(0, start + terminatorIndex);

			if (consumeTerminator) {
				parserContext.skip(parserContext.length(terminatorSequence));
			}

			return sequence_;
		}
	};

	setParserName(elementTerminatedSequenceParser, `.*?${inspect(terminatorSequence)}`);

	return elementTerminatedSequenceParser;
};
