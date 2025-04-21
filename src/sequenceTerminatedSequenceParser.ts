import { inspect } from "./inspect.js";
import { Parser, setParserName } from "./parser.js";
import { DeriveSequenceElement } from "./sequence.js";

function clamp(x: number, min: number, max: number) {
	return Math.max(min, Math.min(x, max));
}

export const createSequenceTerminatedSequenceParser = <Sequence, Element = DeriveSequenceElement<Sequence>>(
	terminatorSequence: Sequence,
	{
		consumeTerminator = true,
	}: {
		consumeTerminator?: boolean;
	} = {},
): Parser<Sequence, Sequence, Element> => {
	const elementTerminatedSequenceParser: Parser<Sequence, Sequence, Element> = async parserContext => {
		let window = 1;
		let nonEndOfInputWindow = 0;

		while (true) {
			const sequence = await parserContext.peekSequence(0, window);

			if (sequence === undefined) {
				window = clamp(
					Math.floor(window * 0.75),
					nonEndOfInputWindow + 1,
					window - 1,
				);

				parserContext.invariant(
					window !== nonEndOfInputWindow,
					'Unexpected end of input without terminated sequence',
				);

				continue;
			}

			nonEndOfInputWindow = Math.max(window, nonEndOfInputWindow);

			const terminatorIndex = parserContext.indexOfSubsequence(sequence, terminatorSequence);

			if (terminatorIndex === -1) {
				window = window * 2;

				continue;
			}

			const sequence_ = await parserContext.readSequence(0, terminatorIndex);

			if (consumeTerminator) {
				parserContext.skip(parserContext.length(terminatorSequence));
			}

			return sequence_;
		}
	};

	setParserName(elementTerminatedSequenceParser, `.*?${inspect(terminatorSequence)}`);

	return elementTerminatedSequenceParser;
};
