import { type Parser } from './parser.js';
import { DeriveSequenceElement } from './sequence.js';

export const createExactElementParser = <
	Sequence,
	Element = DeriveSequenceElement<Sequence>,
>(element: Element): Parser<Element, Sequence, Element> => async parserContext => {
	const actualElement = await parserContext.peek(0);

	parserContext.invariant(
		actualElement === element,
		'Expected %s, got %s',
		element,
		actualElement,
	);

	parserContext.skip(1);

	return element;
};