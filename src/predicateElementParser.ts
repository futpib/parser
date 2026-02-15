import { setParserName, type Parser } from './parser.js';
import { type DeriveSequenceElement } from './sequence.js';

export const createPredicateElementParser = <Sequence, Element = DeriveSequenceElement<Sequence>>(
	predicate: (element: Element) => boolean,
): Parser<Element, Sequence, Element> => {
	const predicateElementParser: Parser<Element, Sequence, Element> = async parserContext => {
		const element = await parserContext.read(0);

		parserContext.invariant(
			predicate(element),
			'Element does not match predicate: %s',
			element,
		);

		return element;
	};

	setParserName(predicateElementParser, `createPredicateElementParser(${predicate.name || 'anonymous'})`);

	return predicateElementParser;
};
