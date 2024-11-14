import { InputCompanion } from "./inputCompanion.js";
import { InputReader, InputReaderImplementation } from "./inputReader.js";

type DeriveInputElement<InputChunk> = (
	InputChunk extends string
		? string
		: (
			InputChunk extends Uint8Array
				? number
				: never
		)
);

export type Parser<
	Output,
	InputChunk,
	InputElement = DeriveInputElement<InputChunk>,
> = (inputReader: InputReader<InputChunk, InputElement>) => Promise<Output>;

export function runParser<
	Output,
	InputChunk,
	InputElement = DeriveInputElement<InputChunk>,
>(
	parser: Parser<Output, InputChunk, InputElement>,
	inputAsyncIterator: AsyncIterator<InputChunk>,
	inputCompanion: InputCompanion<InputChunk, InputElement>,
): Promise<Output> {
	const inputReader = new InputReaderImplementation<InputChunk, InputElement>(inputCompanion, inputAsyncIterator);

	return parser(inputReader);
}
