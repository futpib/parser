import { InputChunkBuffer } from './inputChunkBuffer.js';
import { type InputCompanion } from './inputCompanion.js';

export type InputReader<InputChunk, InputElement> = {
	peek(offset: number): Promise<InputElement | undefined>;
	skip(offset: number): void;
};

export class InputReaderImplementation<InputChunk, InputElement> implements InputReader<InputChunk, InputElement> {
	private readonly _inputChunkBuffer: InputChunkBuffer<InputChunk, InputElement>;

	constructor(
		private readonly _inputCompanion: InputCompanion<InputChunk, InputElement>,
		private readonly _inputAsyncIterator: AsyncIterator<InputChunk>,
	) {
		this._inputChunkBuffer = new InputChunkBuffer<InputChunk, InputElement>(this._inputCompanion);
	}

	async peek(offset: number): Promise<InputElement | undefined> {
		while (true) {
			const inputElement = this._inputChunkBuffer.peek(offset);

			if (inputElement !== undefined) {
				return inputElement;
			}

			const inputIteratorResult = await this._inputAsyncIterator.next();

			if (inputIteratorResult.done) {
				return undefined;
			}

			this._inputChunkBuffer.push(inputIteratorResult.value);
		}
	}

	skip(offset: number) {
		this._inputChunkBuffer.skip(offset);
	}
}
