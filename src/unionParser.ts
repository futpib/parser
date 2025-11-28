import { allSettledStream } from './allSettledStream.js';
import { getParserName, setParserName, type Parser, type ParserOutput, type ParserSequence } from './parser.js';
import { type ParserContext } from './parserContext.js';
import { isParserParsingFailedError, ParserParsingFailedError } from './parserError.js';
import { parserImplementationInvariant } from './parserImplementationInvariant.js';

// Union all output types from an array of parsers
type UnionParserOutput<Parsers extends readonly unknown[]> = ParserOutput<Parsers[number]>;

// Infer Sequence from parser array
type InferSequenceFromParserArray<T extends readonly unknown[]> = ParserSequence<T[number]>;

const bigintReplacer = (_key: string, value: unknown) => {
	if (typeof value === 'bigint') {
		return `${value}n`;
	}

	return value;
};

export function createUnionParser<
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const Parsers extends readonly Parser<any, any, any>[],
>(
	childParsers: Parsers,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Parser<UnionParserOutput<Parsers>, InferSequenceFromParserArray<Parsers>> {
	parserImplementationInvariant(childParsers.length > 0, 'Union parser must have at least one child parser.');

	type TaskContext = {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		childParser: Parser<any, any, any>;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		childParserContext: ParserContext<any, any>;
	};

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const unionParser: Parser<any, any, any> = async parserContext => {
		let runningChildParserContexts: TaskContext[] = [];

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const createChildParserTask = (childParser: Parser<any, any, any>) => {
			const childParserContext = parserContext.lookahead({
				debugName: getParserName(childParser, 'anonymousUnionChild'),
			});

			const context: TaskContext = {
				childParser,
				childParserContext,
			};

			runningChildParserContexts.push(context);

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const getChildParserPromise = (async () => childParser(childParserContext) as Promise<any>);

			const promise = getChildParserPromise();

			return {
				promise,
				context,
			};
		};

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const childParserResults = allSettledStream<any, TaskContext>(childParsers.map(createChildParserTask));

		const parserParsingFailedErrors: ParserParsingFailedError[] = [];
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const successfulParserOutputs: any[] = [];
		const successfulTaskContexts: TaskContext[] = [];
		let didUnlookahead = false;

		for await (const childParserResult of childParserResults) {
			runningChildParserContexts = runningChildParserContexts.filter(runningChildParserContext => runningChildParserContext !== childParserResult.context);

			if (childParserResult.status === 'fulfilled') {
				successfulParserOutputs.push(childParserResult.value);
				successfulTaskContexts.push(childParserResult.context);
			} else {
				const error = childParserResult.reason;

				if (isParserParsingFailedError(error)) {
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
				runningChildParserContext.childParserContext.unlookahead();
			}
		}

		parserImplementationInvariant(
			successfulParserOutputs.length <= 1,
			[
				'Multiple union child parsers succeeded.',
				'Successful parser outputs, indented, separated by newlines:',
				'%s',
				'End of successful parser outputs.',
				'Successful parser names, indented, separated by newlines:',
				'%s',
				'End of successful parser names.',
			],
			() => successfulParserOutputs.map(output => '  ' + JSON.stringify(output, bigintReplacer)).join('\n'),
			() => successfulTaskContexts.map(taskContext => '  ' + getParserName(taskContext.childParser, 'anonymousUnionChild')).join('\n'),
		);

		parserContext.invariantJoin(
			successfulParserOutputs.length === 1,
			parserParsingFailedErrors,
			'No union child parser succeeded.',
		);

		const [ successfulParserContext ] = successfulTaskContexts;

		if (!didUnlookahead) {
			successfulParserContext.childParserContext.unlookahead();
		}

		successfulParserContext.childParserContext.dispose();

		const [ successfulParserOutput ] = successfulParserOutputs;

		return successfulParserOutput;
	};

	const name = [
		'(',
		...childParsers.map(childParser => getParserName(childParser, 'anonymousUnionChild')).join('|'),
		')',
	].join('');

	return setParserName(unionParser, name);
}
