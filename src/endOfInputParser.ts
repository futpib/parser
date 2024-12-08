import { type Parser } from './parser.js';
import { type DeriveSequenceElement } from './sequence.js';

export const createEndOfInputParser = <Sequence, Element = DeriveSequenceElement<Sequence>>(): Parser<void, Sequence, Element> => async parserContext => {
	parserContext.invariant(
		await parserContext.peek(0) === undefined,
		'Expected end of input.',
	);
};

export const endOfInputParser = createEndOfInputParser<any, any>();
