import { getParserName, type Parser, setParserName } from './parser.js';
import { promiseCompose } from './promiseCompose.js';
import { createUnionParser } from './unionParser.js';

class Terminated<T> {
	constructor(
		public readonly value: T,
	) {}
}

export const createTerminatedArrayParser = <ElementOutput, TerminatorOutput, Sequence>(
	elementParser: Parser<ElementOutput, Sequence>,
	terminatorParser: Parser<unknown, Sequence>,
): Parser<[ElementOutput[], TerminatorOutput], Sequence> => {
	const wrappedTerminatorParser = promiseCompose(terminatorParser, terminatorValue => new Terminated(terminatorValue));

	setParserName(
		wrappedTerminatorParser,
		getParserName(terminatorParser, 'anonymousTerminator'),
	);

	const elementOrTerminatorParser = createUnionParser<ElementOutput | Terminated<TerminatorOutput>, Sequence>([
		elementParser,
		promiseCompose(terminatorParser, terminatorValue => new Terminated(terminatorValue)),
	]);

	const terminatedArrayParser: Parser<[ElementOutput[], TerminatorOutput], Sequence> = async parserContext => {
		const elements: ElementOutput[] = [];

		while (true) {
			const elementOrTerminator = await elementOrTerminatorParser(parserContext);

			if (elementOrTerminator instanceof Terminated) {
				return [ elements, elementOrTerminator.value ];
			}

			elements.push(elementOrTerminator);
		}
	};

	return terminatedArrayParser;
};
