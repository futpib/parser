import { type InputCompanion } from './inputCompanion.js';
import { InputReaderImplementation } from './inputReader.js';
import { type ParserContext, ParserContextImplementation } from './parserContext.js';
import { DeriveSequenceElement } from './sequence.js';

export type Parser<
	Output,
	Sequence,
	Element = DeriveSequenceElement<Sequence>,
> = (parserContext: ParserContext<Sequence, Element>) => Promise<Output>;

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
}

export async function runParser<
	Output,
	Sequence,
	Element = DeriveSequenceElement<Sequence>,
>(
	parser: Parser<Output, Sequence, Element>,
	inputAsyncIterator: AsyncIterator<Sequence>,
	inputCompanion: InputCompanion<Sequence, Element>,
	options: RunParserOptions<Output, Sequence, Element> = {},
): Promise<Output> {
	const inputReader = new InputReaderImplementation<Sequence, Element>(inputCompanion, inputAsyncIterator);
	const parserContext = new ParserContextImplementation<Sequence, Element>(inputCompanion, inputReader, undefined, 'root', options);

	return parser(parserContext);
}
