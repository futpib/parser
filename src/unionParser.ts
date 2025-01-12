import { allSettledStream } from './allSettledStream.js';
import { getParserName, setParserName, type Parser } from './parser.js';
import { type ParserContext } from './parserContext.js';
import { ParserParsingFailedError } from './parserError.js';
import { parserImplementationInvariant } from './parserImplementationInvariant.js';
import { DeriveSequenceElement } from './sequence.js';

const bigintReplacer = (_key: string, value: unknown) => {
	if (typeof value === 'bigint') {
		return `${value}n`;
	}

	return value;
};

export const createUnionParser = <
	Output,
	Sequence,
	Element = DeriveSequenceElement<Sequence>,
>(
	childParsers: Array<Parser<unknown, Sequence, Element>>,
): Parser<Output, Sequence, Element> => {
	parserImplementationInvariant(childParsers.length > 0, 'Union parser must have at least one child parser.');

	const unionParser: Parser<Output, Sequence, Element> = async parserContext => {
		let runningChildParserContexts: Array<ParserContext<Sequence, Element>> = [];

		const childParserResults = allSettledStream<Output, ParserContext<Sequence, Element>>(childParsers.map(childParser => {
			const childParserContext = parserContext.lookahead({
				debugName: getParserName(childParser, 'anonymousUnionChild'),
			});

			runningChildParserContexts.push(childParserContext);

			const promise = (async () => childParser(childParserContext) as Promise<Output>)();

			return {
				promise,
				context: childParserContext,
			};
		}));

		const parserParsingFailedErrors: ParserParsingFailedError[] = [];
		const successfulParserOutputs: Output[] = [];
		const successfulParserContexts: Array<ParserContext<Sequence, Element>> = [];
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
			() => successfulParserOutputs.map(output => '  ' + JSON.stringify(output, bigintReplacer)).join('\n'),
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
