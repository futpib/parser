import { createFixedLengthSequenceParser } from './fixedLengthSequenceParser.js';
import { getParserName, type Parser, setParserName } from './parser.js';

export const createParserConsumedSequenceParser = <Output, Sequence>(
	childParser: Parser<Output, Sequence>,
): Parser<[Output, Sequence], Sequence> => {
	const parserConsumedSequenceParser: Parser<[Output, Sequence], Sequence> = async parserContext => {
		const initialPosition = parserContext.position;

		let value: Output;
		let consumedLength: number;
		{
			using childParserContext = parserContext.lookahead();
			value = await childParser(childParserContext);
			consumedLength = childParserContext.position - initialPosition;
		}

		const consumedSequenceParser = createFixedLengthSequenceParser<Sequence>(consumedLength);
		const consumedSequence = await consumedSequenceParser(parserContext);

		return [ value, consumedSequence ];
	};

	setParserName(parserConsumedSequenceParser, `parserConsumedSequenceParser(${getParserName(childParser, 'anonymousParserConsumedSequenceParserChild')})`);

	return parserConsumedSequenceParser;
};
