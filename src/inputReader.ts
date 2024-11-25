import PromiseMutex from 'p-mutex';
import { SequenceBuffer, SequenceBufferImplementation } from './sequenceBuffer.js';
import { type InputCompanion } from './inputCompanion.js';
import { parserImplementationInvariant } from './parserImplementationInvariant.js';

export type InputReader<Sequence, Element> = {
	get position(): number;

	peek(offset: number): Promise<Element | undefined>;
	skip(offset: number): void;

	lookahead(): InputReader<Sequence, Element>;
};

export class InputReaderImplementation<Sequence, Element> implements InputReader<Sequence, Element> {
	private _position = 0;
	private _queuedSkipOffset = 0;

	private readonly _promiseMutex = new PromiseMutex();

	private readonly _sequenceBuffer: SequenceBuffer<Sequence, Element>;

	constructor(
		private readonly _inputCompanion: InputCompanion<Sequence, Element>,
		private readonly _inputAsyncIterator: AsyncIterator<Sequence>,
	) {
		this._sequenceBuffer = new SequenceBufferImplementation<Sequence, Element>(this._inputCompanion);
	}

	get position() {
		return this._position;
	}

	async peek(offset: number): Promise<Element | undefined> {
		parserImplementationInvariant(offset >= 0, 'offset >= 0');

		offset += this._queuedSkipOffset;

		const element = this._sequenceBuffer.peek(offset);

		if (element !== undefined) {
			return element;
		}

		return this._promiseMutex.withLock(async () => {
			const element = await (async () => {
				while (true) {
					const element = this._sequenceBuffer.peek(offset);

					if (element !== undefined) {
						return element;
					}

					const inputIteratorResult = await this._inputAsyncIterator.next();

					if (inputIteratorResult.done) {
						return undefined;
					}

					this._sequenceBuffer.push(inputIteratorResult.value);
				}
			})();

			this._sequenceBuffer.skip(this._queuedSkipOffset);
			this._queuedSkipOffset = 0;

			return element;
		});
	}

	skip(offset: number) {
		parserImplementationInvariant(offset >= 0, 'offset >= 0');

		this._position += offset;

		if (this._promiseMutex.isLocked) {
			this._queuedSkipOffset += offset;
		} else {
			this._sequenceBuffer.skip(offset);
		}
	}

	lookahead(): InputReader<Sequence, Element> {
		return new InputReaderLookaheadImplementation(this);
	}
}

class InputReaderLookaheadImplementation<Sequence, Element> implements InputReader<Sequence, Element> {
	private _initialInputReaderPosition = 0;
	private _offset = 0;

	constructor(
		private readonly _inputReader: InputReaderImplementation<Sequence, Element>,
	) {
		this._initialInputReaderPosition = this._inputReader.position;
	}

	get position() {
		return this._initialInputReaderPosition + this._offset;
	}

	async peek(offset: number): Promise<Element | undefined> {
		const inputReaderMovedForward = this._inputReader.position - this._initialInputReaderPosition;

		this._initialInputReaderPosition = this._inputReader.position;
		this._offset -= inputReaderMovedForward;

		return this._inputReader.peek(this._offset + offset);
	}

	skip(offset: number) {
		parserImplementationInvariant(offset >= 0, 'offset >= 0');

		this._offset += offset;
	}

	lookahead(): InputReader<Sequence, Element> {
		const lookahead = new InputReaderLookaheadImplementation(this._inputReader);

		lookahead.skip(this._offset);

		return lookahead;
	}
}
