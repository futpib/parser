import { Class } from 'type-fest';
import { type ParserInputCompanion } from './parserInputCompanion.js';
import { InputReaderImplementation } from './inputReader.js';
import { type ParserContext, ParserContextImplementation } from './parserContext.js';
import { type DeriveSequenceElement } from './sequence.js';
import { ParserError, ParserUnexpectedRemainingInputError } from './parserError.js';
import { toAsyncIterator } from './toAsyncIterator.js';
import { inputReaderStateCompanion } from './inputReaderState.js';

export type Parser<
	Output,
	Sequence,
	Element = DeriveSequenceElement<Sequence>,
> = (parserContext: ParserContext<Sequence, Element>) => Output | Promise<Output>;

export function getParserName(parser: Parser<any, any, any>, default_ = 'anonymous'): string {
	return parser.name || default_;
}

export function setParserName<
	Output,
	Sequence,
	Element = DeriveSequenceElement<Sequence>,
>(parser: Parser<Output, Sequence, Element>, name: string): Parser<Output, Sequence, Element> {
	Object.defineProperty(parser, 'name', {
		value: name,
	});

	return parser;
}

const originalParserByClone = new WeakMap<Parser<any, any, any>, Parser<any, any, any>>();

export function cloneParser<
	Output,
	Sequence,
	Element = DeriveSequenceElement<Sequence>,
>(
	parser: Parser<Output, Sequence, Element>,
): Parser<Output, Sequence, Element> {
	const originalParser = originalParserByClone.get(parser) ?? parser;

	const clone: Parser<Output, Sequence, Element> = (parserContext) => {
		return originalParser(parserContext);
	};

	setParserName(clone, getParserName(parser));

	originalParserByClone.set(clone, originalParser);

	return clone;
}

export type RunParserOptions<
	Output,
	Sequence,
	Element = DeriveSequenceElement<Sequence>,
> = {
	errorJoinMode?: 'none' | 'deepest' | 'furthest' | 'all';
	parserContextClass?: Class<ParserContext<Sequence, Element>>;
};

export type RunParserWithRemainingInputResult<
	Output,
	Sequence,
	Element = DeriveSequenceElement<Sequence>,
> = {
	output: Output;
	position: number;
	remainingInput: undefined | AsyncIterable<Sequence>;
};

async function withEnrichedParserError<
	Output,
	Sequence,
	Element = DeriveSequenceElement<Sequence>,
>(
	parserContext: ParserContext<Sequence, Element>,
	inputReader: InputReaderImplementation<Sequence, Element>,
	f: () => Promise<Output>,
): Promise<Output> {
	try {
		return await f();
	} catch (error) {
		if (error instanceof ParserError) {
			if (error.position === undefined) {
				error.position = parserContext.position;
			}

			if (error.inputReaderSate === undefined) {
				error.inputReaderSate = inputReader.toInputReaderState();
			}
		}

		throw error;
	}
}

type RunParserInternalResult<
	Output,
	Sequence,
	Element = DeriveSequenceElement<Sequence>,
> = {
	outputPromise: Promise<Output>;
	parserContext: ParserContext<Sequence, Element>;
	inputReader: InputReaderImplementation<Sequence, Element>;
};

function runParserInternal<
	Output,
	Sequence,
	Element = DeriveSequenceElement<Sequence>,
>(
	parser: Parser<Output, Sequence, Element>,
	input: AsyncIterator<Sequence> | AsyncIterable<Sequence> | Iterable<Sequence> | Sequence,
	parserInputCompanion: ParserInputCompanion<Sequence, Element>,
	options: RunParserOptions<Output, Sequence, Element> = {},
): RunParserInternalResult<Output, Sequence, Element> {
	const inputAsyncIterator = toAsyncIterator(input);

	const inputReader = new InputReaderImplementation<Sequence, Element>(parserInputCompanion, inputAsyncIterator);

	const ParserContext = options.parserContextClass ?? ParserContextImplementation;

	const parserContext = new ParserContext<Sequence, Element>(parserInputCompanion, inputReader, undefined, {
		...options,
		debugName: 'root',
	});

	const outputPromise = (async () => {
		try {
			return await parser(parserContext);
		} finally {
			await parserContext.peek(0);
		}
	})();

	return {
		outputPromise,
		parserContext,
		inputReader,
	};
}

export async function runParserWithRemainingInput<
	Output,
	Sequence,
	Element = DeriveSequenceElement<Sequence>,
>(
	parser: Parser<Output, Sequence, Element>,
	input: AsyncIterator<Sequence> | AsyncIterable<Sequence> | Iterable<Sequence> | Sequence,
	parserInputCompanion: ParserInputCompanion<Sequence, Element>,
	options: RunParserOptions<Output, Sequence, Element> = {},
): Promise<RunParserWithRemainingInputResult<Output, Sequence, Element>> {
	const {
		outputPromise,
		parserContext,
		inputReader,
	} = runParserInternal(parser, input, parserInputCompanion, options);

	return await withEnrichedParserError(parserContext, inputReader, async () => {
		const output = await outputPromise;

		const inputReaderState = inputReader.toInputReaderState();

		const remainingInput = (
			inputReaderStateCompanion.isDone(inputReaderState)
				? undefined
				: inputReaderStateCompanion.toRemainingInputAsyncIterator(inputReaderState)
		);

		return {
			output,
			position: parserContext.position,
			remainingInput,
		};
	});
}

export async function runParser<
	Output,
	Sequence,
	Element = DeriveSequenceElement<Sequence>,
>(
	parser: Parser<Output, Sequence, Element>,
	input: AsyncIterator<Sequence> | AsyncIterable<Sequence> | Iterable<Sequence> | Sequence,
	parserInputCompanion: ParserInputCompanion<Sequence, Element>,
	options: RunParserOptions<Output, Sequence, Element> = {},
): Promise<Output> {
	const {
		outputPromise,
		parserContext,
		inputReader,
	} = runParserInternal(parser, input, parserInputCompanion, options);

	return await withEnrichedParserError(parserContext, inputReader, async () => {
		const output = await outputPromise;

		const inputReaderState = inputReader.toInputReaderState();

		if (!inputReaderStateCompanion.isDone(inputReaderState)) {
			throw new ParserUnexpectedRemainingInputError('Unexpected remaining input', 0, parserContext.position);
		}

		return output;
	});
}
