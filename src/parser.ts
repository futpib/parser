import { type InputCompanion } from './inputCompanion.js';
import { InputReaderImplementation } from './inputReader.js';
import { type ParserContext, ParserContextImplementation } from './parserContext.js';

type DeriveElement<Sequence> = (
	Sequence extends string
		? string
		: (
			Sequence extends Uint8Array
				? number
				: never
		)
);

export type Parser<
	Output,
	Sequence,
	Element = DeriveElement<Sequence>,
> = (parserContext: ParserContext<Sequence, Element>) => Promise<Output>;

export async function runParser<
	Output,
	Sequence,
	Element = DeriveElement<Sequence>,
>(
	parser: Parser<Output, Sequence, Element>,
	inputAsyncIterator: AsyncIterator<Sequence>,
	inputCompanion: InputCompanion<Sequence, Element>,
): Promise<Output> {
	const inputReader = new InputReaderImplementation<Sequence, Element>(inputCompanion, inputAsyncIterator);
	const parserContext = new ParserContextImplementation<Sequence, Element>(inputCompanion, inputReader, undefined, 'root');

	return parser(parserContext);
}
