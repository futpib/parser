import { getParserName, type Parser, setParserName } from './parser.js';
import { isParserParsingFailedError, ParserParsingFailedError } from './parserError.js';
import { parserImplementationInvariant } from './parserImplementationInvariant.js';
import { promiseCompose } from './promiseCompose.js';
import { createUnionParser } from './unionParser.js';

class Terminated<T> {
	constructor(public readonly value: T) {}
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

	const elementOrTerminatorParser = createUnionParser([
		elementParser,
		promiseCompose(terminatorParser, terminatorValue => new Terminated(terminatorValue)),
	]);

	const terminatedArrayParserNaive: Parser<[ElementOutput[], TerminatorOutput], Sequence> = async parserContext => {
		const elements: ElementOutput[] = [];

		while (true) {
			const elementOrTerminator = await elementOrTerminatorParser(parserContext);

			if (elementOrTerminator instanceof Terminated) {
				return [ elements, elementOrTerminator.value ];
			}

			elements.push(elementOrTerminator);
		}
	};

	setParserName(terminatedArrayParserNaive, `${getParserName(elementParser, 'anonymousElement')}*?${getParserName(terminatorParser, 'anonymousTerminator')}`);

	return terminatedArrayParserNaive;
};

export const createTerminatedArrayParser = <ElementOutput, TerminatorOutput, Sequence>(
	elementParser: Parser<ElementOutput, Sequence>,
	terminatorParser: Parser<TerminatorOutput, Sequence>,
): Parser<[ElementOutput[], TerminatorOutput], Sequence> => {
	const terminatedArrayParser: Parser<[ElementOutput[], TerminatorOutput], Sequence> = async parserContext => {
		const elements: ElementOutput[] = [];

		while (true) {
			const terminatorParserContext = parserContext.lookahead({
				debugName: getParserName(terminatorParser, 'anonymousTerminator'),
			});

			try {
				const terminatorValue = await terminatorParser(terminatorParserContext);

				const elementParserContext = parserContext.lookahead({
					debugName: getParserName(elementParser, 'anonymousElement'),
				});

				try {
					await elementParser(elementParserContext);

					parserImplementationInvariant(
						false,
						[
							'Both element and terminator parsers matched.',
							'Element parser: %s',
							'Terminator parser: %s',
						],
						getParserName(elementParser, 'anonymousElement'),
						getParserName(terminatorParser, 'anonymousTerminator'),
					);
				} catch (error) {
					if (!(isParserParsingFailedError(error))) {
						throw error;
					}
				} finally {
					elementParserContext.dispose();
				}

				terminatorParserContext.unlookahead();

				return [ elements, terminatorValue ];
			} catch (error) {
				if (!(isParserParsingFailedError(error))) {
					throw error;
				}
			} finally {
				terminatorParserContext.dispose();
			}

			const element = await elementParser(parserContext);

			elements.push(element);
		}
	};

	setParserName(terminatedArrayParser, `${getParserName(elementParser, 'anonymousElement')}*?${getParserName(terminatorParser, 'anonymousTerminator')}`);

	return terminatedArrayParser;
};

export const createTerminatedArrayParserUnsafe = <ElementOutput, TerminatorOutput, Sequence>(
	elementParser: Parser<ElementOutput, Sequence>,
	terminatorParser: Parser<TerminatorOutput, Sequence>,
): Parser<[ElementOutput[], TerminatorOutput], Sequence> => {
	const terminatedArrayParserUnsafe: Parser<[ElementOutput[], TerminatorOutput], Sequence> = async parserContext => {
		const elements: ElementOutput[] = [];

		while (true) {
			const terminatorParserContext = parserContext.lookahead({
				debugName: getParserName(terminatorParser, 'anonymousTerminator'),
			});

			try {
				const terminatorValue = await terminatorParser(terminatorParserContext);

				terminatorParserContext.unlookahead();

				return [ elements, terminatorValue ];
			} catch (error) {
				if (!(isParserParsingFailedError(error))) {
					throw error;
				}
			} finally {
				terminatorParserContext.dispose();
			}

			const element = await elementParser(parserContext);

			elements.push(element);
		}
	};

	setParserName(terminatedArrayParserUnsafe, `${getParserName(elementParser, 'anonymousElement')}*?${getParserName(terminatorParser, 'anonymousTerminator')}`);

	return terminatedArrayParserUnsafe;
};
