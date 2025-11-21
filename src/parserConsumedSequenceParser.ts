import { createFixedLengthSequenceParser } from './fixedLengthSequenceParser.js';
import { getParserName, type Parser, setParserName } from './parser.js';
import { withLookahead } from './withLookahead.js';

export const createParserConsumedSequenceParser = <Output, Sequence>(
	childParser: Parser<Output, Sequence>,
): Parser<[Output, Sequence], Sequence> => {
	const parserConsumedSequenceParser: Parser<[Output, Sequence], Sequence> = async parserContext => {
		const initialPosition = parserContext.position;
		
		const [ value, consumedLength ] = await withLookahead(parserContext, async childParserContext => {
			const result = await childParser(childParserContext);
			const length = childParserContext.position - initialPosition;
			return [ result, length ] as const;
		});

		const consumedSequenceParser = createFixedLengthSequenceParser<Sequence>(consumedLength);
		const consumedSequence = await consumedSequenceParser(parserContext);

		return [ value, consumedSequence ];
	};

	setParserName(parserConsumedSequenceParser, `parserConsumedSequenceParser(${getParserName(childParser, 'anonymousParserConsumedSequenceParserChild')})`);

	return parserConsumedSequenceParser;
};
