import { createFixedLengthSequenceParser } from "./fixedLengthSequenceParser.js";
import { Parser } from "./parser.js";

export const createParserConsumedSequenceParser = <Output, Sequence>(
	childParser: Parser<Output, Sequence>,
): Parser<[Output, Sequence], Sequence> => async parserContext => {
	const initialPosition = parserContext.position;
	const childParserContext = parserContext.lookahead();
	let value: Output;
	let consumedLength: number;
	try {
		value = await childParser(childParserContext);
		consumedLength = childParserContext.position - initialPosition;
	} finally {
		childParserContext.dispose();
	}
	const consumedSequenceParser = createFixedLengthSequenceParser<Sequence>(consumedLength);
	const consumedSequence = await consumedSequenceParser(parserContext);
	return [value, consumedSequence];
}