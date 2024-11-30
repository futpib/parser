import { allSettledStream } from './allSettledStream.js';
import { getParserName, setParserName, type Parser } from './parser.js';
import { type ParserContext } from './parserContext.js';
import { ParserParsingFailedError } from './parserError.js';
import { parserImplementationInvariant } from './parserImplementationInvariant.js';

export const createUnionParser = <
	Output,
	Sequence,
>(
	childParsers: Array<Parser<any, Sequence, any>>,
): Parser<Output, Sequence, unknown> => {
	parserImplementationInvariant(childParsers.length > 0, 'Union parser must have at least one child parser.');

	const unionParser: Parser<Output, Sequence, unknown> = async parserContext => {
		let runningChildParserContexts: Array<ParserContext<unknown, unknown>> = [];

		const childParserResults = allSettledStream(childParsers.map(childParser => {
			const childParserContext = parserContext.lookahead(getParserName(childParser, 'anonymousUnionChild'));

			runningChildParserContexts.push(childParserContext);

			const promise = childParser(childParserContext);

			return {
				promise,
				context: childParserContext,
			};
		}));

		const parserParsingFailedErrors: ParserParsingFailedError[] = [];
		const successfulParserOutputs: Output[] = [];
		const successfulParserContexts: Array<ParserContext<unknown, unknown>> = [];
		let didUnlookahead = false;

		for await (const childParserResult of childParserResults) {
			runningChildParserContexts = runningChildParserContexts.filter(
				runningChildParserContext => runningChildParserContext !== childParserResult.context,
			);

			if (childParserResult.status === 'fulfilled') {
				successfulParserOutputs.push(childParserResult.value);
				successfulParserContexts.push(childParserResult.context);
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
				runningChildParserContext.unlookahead();
			}
		}

		parserImplementationInvariant(
			successfulParserOutputs.length <= 1,
			[
				'Multiple union child parsers succeeded.',
				'Successful parser outputs, indented, separated by newlines:',
				'%s',
				'End of successful parser outputs.',
			],
			() => successfulParserOutputs.map(output => '  ' + JSON.stringify(output)).join('\n'),
		);

		parserContext.invariantJoin(
			successfulParserOutputs.length === 1,
			parserParsingFailedErrors,
			'No union child parser succeeded.',
		);

		const [ successfulParserContext ] = successfulParserContexts;

		if (!didUnlookahead) {
			successfulParserContext.unlookahead();
		}

		successfulParserContext.dispose();

		const [ successfulParserOutput ] = successfulParserOutputs;

		return successfulParserOutput;
	};

	const name = [
		'(',
		...childParsers.map(childParser => getParserName(childParser, 'anonymousUnionChild')).join('|'),
		')',
	].join('');

	return setParserName(unionParser, name);
};
