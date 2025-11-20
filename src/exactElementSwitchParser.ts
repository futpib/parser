import invariant from "invariant";
import { getParserName, Parser, setParserName } from "./parser.js";
import { parserImplementationInvariant } from "./parserImplementationInvariant.js";
import { DeriveSequenceElement } from "./sequence.js";

export const createElementSwitchParser = <
	Output,
	Sequence,
	Element = DeriveSequenceElement<Sequence>,
>(
	childParsers: Map<Element, Parser<unknown, Sequence, Element>>,
	defaultParser?: Parser<unknown, Sequence, Element>,
): Parser<Output, Sequence, Element> => {
	parserImplementationInvariant(childParsers.size > 0, 'Element switch parser must have at least one child parser.');

	const elementSwitchParser: Parser<Output, Sequence, Element> = async parserContext => {
		const currentElement = await parserContext.peek(0);

		parserContext.invariant(currentElement !== undefined, 'Unexpected end of input.');
		invariant(currentElement !== undefined, 'Unexpected end of input.');

		const childParser = childParsers.get(currentElement) ?? defaultParser;

		parserContext.invariant(childParser, `No child parser found for element: ${String(currentElement)}`);

		const childParserOutput = await childParser!(parserContext) as Output;

		return childParserOutput;
	};

	const name = [
		'elementSwitch(',
		...Array.from(childParsers.entries()).map(
			([ element, childParser ]) => `${String(element)}=>${getParserName(childParser, 'anonymousElementSwitchChild')}`,
		),
		defaultParser ? `|default=>${getParserName(defaultParser, 'anonymousElementSwitchDefaultChild')}` : '',
		')',
	].join('');

	return setParserName(elementSwitchParser, name);
}
