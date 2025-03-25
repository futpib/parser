import { Class } from 'type-fest';
import { type ParserInputCompanion } from './parserInputCompanion.js';
import { InputReaderImplementation } from './inputReader.js';
import { type ParserContext, ParserContextImplementation } from './parserContext.js';
import { type DeriveSequenceElement } from './sequence.js';
import { ParserError } from './parserError.js';
import { toAsyncIterator } from './toAsyncIterator.js';

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

	const ParserContext = options.parserContextClass ?? ParserContextImplementation;

	const parserContext = new ParserContext<Sequence, Element>(parserInputCompanion, inputReader, undefined, {
		...options,
		debugName: 'root',
	});

	try {
		return await parser(parserContext);
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
