import { getParserName, type Parser, setParserName } from './parser.js';
import { ParserParsingFailedError } from './parserError.js';
import { parserImplementationInvariant } from './parserImplementationInvariant.js';
import { promiseCompose } from './promiseCompose.js';
import { createUnionParser } from './unionParser.js';

class Terminated<T> {
	constructor(
		public readonly value: T,
	) {}
}

export const createTerminatedArrayParserNaive = <ElementOutput, TerminatorOutput, Sequence>(
	elementParser: Parser<ElementOutput, Sequence>,
	terminatorParser: Parser<TerminatorOutput, Sequence>,
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

export const createTerminatedArrayParser = <ElementOutput, TerminatorOutput, Sequence>(
	elementParser: Parser<ElementOutput, Sequence>,
	terminatorParser: Parser<TerminatorOutput, Sequence>,
): Parser<[ElementOutput[], TerminatorOutput], Sequence> => {
	const terminatedArrayParser: Parser<[ElementOutput[], TerminatorOutput], Sequence> = async parserContext => {
		const elements: ElementOutput[] = [];

		while (true) {
			const terminatorParserContext = parserContext.lookahead();

			try {
				const terminatorValue = await terminatorParser(terminatorParserContext);

				try {
					await elementParser(parserContext);

					parserImplementationInvariant(
						false,
						'Both element and terminator parsers matched.',
					);
				} catch (error) {
					if (!(error instanceof ParserParsingFailedError)) {
						throw error;
					}
				}

				terminatorParserContext.unlookahead();

				return [ elements, terminatorValue ];
			} catch (error) {
				if (!(error instanceof ParserParsingFailedError)) {
					throw error;
				}
			} finally {
				terminatorParserContext.dispose();
			}

			const element = await elementParser(parserContext);

			elements.push(element);
		}
	};

	return terminatedArrayParser;
};
