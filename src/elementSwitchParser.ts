import invariant from "invariant";
import { getParserName, Parser, ParserOutput, ParserSequence, setParserName } from "./parser.js";
import { parserImplementationInvariant } from "./parserImplementationInvariant.js";

// Output type: union of child parser outputs and default parser output (if present)
type ElementSwitchOutput<
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	ChildParser extends Parser<any, any, any>,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	DefaultParser extends Parser<any, any, any> | undefined,
> = ParserOutput<ChildParser> | (DefaultParser extends undefined ? never : ParserOutput<NonNullable<DefaultParser>>);

export function createElementSwitchParser<
	Element,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	ChildParser extends Parser<any, any, Element>,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	DefaultParser extends Parser<any, any, Element> | undefined = undefined,
>(
	childParsers: Map<Element, ChildParser>,
	defaultParser?: DefaultParser,
): Parser<ElementSwitchOutput<ChildParser, DefaultParser>, ParserSequence<ChildParser>, Element> {
	parserImplementationInvariant(childParsers.size > 0, 'Element switch parser must have at least one child parser.');

	type Output = ElementSwitchOutput<ChildParser, DefaultParser>;
	type Sequence = ParserSequence<ChildParser>;

	const elementSwitchParser: Parser<Output, Sequence, Element> = async parserContext => {
		const currentElement = await parserContext.peek(0);

		parserContext.invariant(currentElement !== undefined, 'Unexpected end of input.');
		invariant(currentElement !== undefined, 'Unexpected end of input.');

		const childParser = childParsers.get(currentElement) ?? defaultParser;

		parserContext.invariant(childParser, `No child parser found for element: ${String(currentElement)}`);

		return childParser!(parserContext) as Promise<Output>;
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
