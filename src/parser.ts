import invariant from 'invariant';
import { type ParserInputCompanion } from './parserInputCompanion.js';
import { InputReaderImplementation } from './inputReader.js';
import { type ParserContext, ParserContextImplementation } from './parserContext.js';
import { type DeriveSequenceElement } from './sequence.js';
import { ParserError } from './parserError.js';

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

export type RunParserOptions<
	Output,
	Sequence,
	Element = DeriveSequenceElement<Sequence>,
> = {
	errorJoinMode?: 'none' | 'deepest' | 'furthest' | 'all';
};

function isAsyncIterable<T>(value: any): value is AsyncIterable<T> {
	return value && typeof value[Symbol.asyncIterator] === 'function';
}

function isIterable<T>(value: any): value is Iterable<T> {
	return value && typeof value[Symbol.iterator] === 'function';
}

function isIterator<T>(value: any): value is Iterator<T> {
	return value && typeof value.next === 'function';
}

function iteratorToAsyncIterator<T>(iterator: Iterator<T>): AsyncIterator<T> {
	return {
		next: async () => iterator.next(),
	};
}

function toAsyncIterator<T>(value: AsyncIterator<T> | AsyncIterable<T> | Iterable<T> | T): AsyncIterator<T> {
	if (
		typeof value === 'string'
		|| value instanceof Uint8Array
	) {
		return (async function * () {
			yield value as any;
		})();
	}

	if (isAsyncIterable(value)) {
		return value[Symbol.asyncIterator]();
	}

	if (isIterable(value)) {
		return iteratorToAsyncIterator(value[Symbol.iterator]());
	}

	if (isIterator<T>(value)) {
		return iteratorToAsyncIterator(value);
	}

	invariant(
		false,
		'Value must be an async iterator, async iterable, iterable or iterator got %s.',
		value,
	);
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
	const inputAsyncIterator = toAsyncIterator(input);

	const inputReader = new InputReaderImplementation<Sequence, Element>(parserInputCompanion, inputAsyncIterator);
	const parserContext = new ParserContextImplementation<Sequence, Element>(parserInputCompanion, inputReader, undefined, {
		...options,
		debugName: 'root',
	});

	try {
		return await parser(parserContext);
	} catch (error) {
		if (
			error instanceof ParserError
				&& error.position === undefined
		) {
			error.position = parserContext.position;
		}

		throw error;
	}
}
