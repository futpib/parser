import PromiseMutex from 'p-mutex';
import { InputChunkBuffer, InputChunkBufferImplementation } from './inputChunkBuffer.js';
import { type InputCompanion } from './inputCompanion.js';
import { parserImplementationInvariant } from './parserImplementationInvariant.js';

export type InputReader<InputChunk, InputElement> = {
	get position(): number;

	peek(offset: number): Promise<InputElement | undefined>;
	skip(offset: number): void;

	lookahead(): InputReader<InputChunk, InputElement>;
};

export class InputReaderImplementation<InputChunk, InputElement> implements InputReader<InputChunk, InputElement> {
	private _position = 0;
	private _queuedSkipOffset = 0;

	private readonly _promiseMutex = new PromiseMutex();

	private readonly _inputChunkBuffer: InputChunkBuffer<InputChunk, InputElement>;

	constructor(
		private readonly _inputCompanion: InputCompanion<InputChunk, InputElement>,
		private readonly _inputAsyncIterator: AsyncIterator<InputChunk>,
	) {
		this._inputChunkBuffer = new InputChunkBufferImplementation<InputChunk, InputElement>(this._inputCompanion);
	}

	get position() {
		return this._position;
	}

	async peek(offset: number): Promise<InputElement | undefined> {
		parserImplementationInvariant(offset >= 0, 'offset >= 0');

		offset += this._queuedSkipOffset;

		const inputElement = this._inputChunkBuffer.peek(offset);

		if (inputElement !== undefined) {
			return inputElement;
		}

		return this._promiseMutex.withLock(async () => {
			const inputElement = await (async () => {
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
			})();

			this._inputChunkBuffer.skip(this._queuedSkipOffset);
			this._queuedSkipOffset = 0;

			return inputElement;
		});
	}

	skip(offset: number) {
		parserImplementationInvariant(offset >= 0, 'offset >= 0');

		this._position += offset;

		if (this._promiseMutex.isLocked) {
			this._queuedSkipOffset += offset;
		} else {
			this._inputChunkBuffer.skip(offset);
		}
	}

	lookahead(): InputReader<InputChunk, InputElement> {
		return new InputReaderLookaheadImplementation(this);
	}
}

class InputReaderLookaheadImplementation<InputChunk, InputElement> implements InputReader<InputChunk, InputElement> {
	private _initialInputReaderPosition = 0;
	private _offset = 0;

	constructor(
		private readonly _inputReader: InputReaderImplementation<InputChunk, InputElement>,
	) {
		this._initialInputReaderPosition = this._inputReader.position;
	}

	get position() {
		return this._initialInputReaderPosition + this._offset;
	}

	async peek(offset: number): Promise<InputElement | undefined> {
		const inputReaderMovedForward = this._inputReader.position - this._initialInputReaderPosition;

		this._initialInputReaderPosition = this._inputReader.position;
		this._offset -= inputReaderMovedForward;

		return this._inputReader.peek(this._offset + offset);
	}

	skip(offset: number) {
		parserImplementationInvariant(offset >= 0, 'offset >= 0');

		this._offset += offset;
	}

	lookahead(): InputReader<InputChunk, InputElement> {
		const lookahead = new InputReaderLookaheadImplementation(this._inputReader);

		lookahead.skip(this._offset);

		return lookahead;
	}
}
