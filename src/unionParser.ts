import { allSettledStream } from './allSettledStream.js';
import { type Parser } from './parser.js';
import { ParserContext } from './parserContext.js';
import { ParserParsingFailedError } from './parserError.js';
import { parserImplementationInvariant } from './parserImplementationInvariant.js';
import { parserParsingInvariant } from './parserParsingInvariant.js';

export const createUnionParser = <
	Output,
	Sequence,
>(
	childParsers: Parser<any, Sequence, any>[],
): Parser<Output, Sequence, unknown> => {
	parserImplementationInvariant(childParsers.length > 0, 'Union parser must have at least one child parser.');

	return async parserContext => {
		let runningChildParserContexts: ParserContext<unknown, unknown>[] = [];

		const childParserResults = allSettledStream(childParsers.map(childParser => {
			const childParserContext = parserContext.lookahead();

			runningChildParserContexts.push(childParserContext);

			const promise = childParser(childParserContext);

			return {
				promise,
				context: childParserContext,
			};
		}));

		const parserParsingFailedErrors: ParserParsingFailedError[] = [];
		const successfulParserOutputs: Output[] = [];
		let didUnlookahead = false;

		for await (const childParserResult of childParserResults) {
			runningChildParserContexts = runningChildParserContexts.filter(
				runningChildParserContext => runningChildParserContext !== childParserResult.context,
			);

			if (childParserResult.status === 'fulfilled') {
				successfulParserOutputs.push(childParserResult.value);
			} else {
				const error = childParserResult.reason;

				if (error instanceof ParserParsingFailedError) {
					parserParsingFailedErrors.push(error);
				} else {
					throw error;
				}
			}

			if (
				runningChildParserContexts.length === 1
				&& successfulParserOutputs.length === 0
			) {
				parserImplementationInvariant(!didUnlookahead, 'Union parser unlookaheaded multiple times.');
				didUnlookahead = true;
				const [ runningChildParserContext ] = runningChildParserContexts;
				runningChildParserContext.unlookahead(parserContext);
			}
		}

		parserImplementationInvariant(
			successfulParserOutputs.length <= 1,
			'Multiple union child parsers succeeded.',
		);

		parserParsingInvariant(
			successfulParserOutputs.length === 1,
			[
				'No union child parser succeeded.',
				'Parsing errors, indented, separated by newlines:',
				'%s',
				'End of parsing errors.',
			],
			parserParsingFailedErrors
				.flatMap(error => error.stack?.split('\n'))
				.map(line => '  ' + line)
				.join('\n'),
		);

		const [ successfulParserOutput ] = successfulParserOutputs;

		return successfulParserOutput
	};
};
