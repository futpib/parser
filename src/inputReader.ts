import PromiseMutex from 'p-mutex';
import invariant from 'invariant';
import { type SequenceBuffer, SequenceBufferImplementation } from './sequenceBuffer.js';
import { type ParserInputCompanion } from './parserInputCompanion.js';
import { parserImplementationInvariant } from './parserImplementationInvariant.js';

export type InputReader<Sequence, Element> = {
	get position(): number;

	peek(offset: number): Promise<Element | undefined>;
	peekSequence(start: number, end: number): Promise<Sequence | undefined>;
	skip(offset: number): void;

	lookahead(): InputReader<Sequence, Element>;
};

let inputReaderId = 0;

export class InputReaderImplementation<Sequence, Element> implements InputReader<Sequence, Element> {
	private readonly _id = inputReaderId++;

	private _position = 0;
	private _uncommitedSkipOffset = 0;

	private readonly _promiseMutex = new PromiseMutex();

	private readonly _sequenceBuffer: SequenceBuffer<Sequence, Element>;

	constructor(
		private readonly _parserInputCompanion: ParserInputCompanion<Sequence, Element>,
		private readonly _inputAsyncIterator: AsyncIterator<Sequence>,
	) {
		this._sequenceBuffer = new SequenceBufferImplementation<Sequence, Element>(this._parserInputCompanion);
	}

	get [Symbol.toStringTag]() {
		return [
			'InputReader',
			this._id,
			this.position,
		].join(' ');
	}

	get position() {
		return this._position;
	}

	async peek(offset: number): Promise<Element | undefined> {
		parserImplementationInvariant(offset >= 0, 'offset >= 0');

		offset += this._uncommitedSkipOffset;

		const element = this._sequenceBuffer.peek(offset);

		if (element !== undefined) {
			return element;
		}

		return this._promiseMutex.withLock(async () => {
			while (true) {
				const element = this._sequenceBuffer.peek(offset);

				if (element !== undefined) {
					return element;
				}

				const inputIteratorResult = await this._inputAsyncIterator.next();

				if (inputIteratorResult.done) {
					return undefined;
				}

				parserImplementationInvariant(
					this._parserInputCompanion.is(inputIteratorResult.value),
					[
						'Input iterator result value (%s) is of unexpected type.',
						'Expected a sequence (a chunk of input) recognized by the input companion (%s).',
						'You may have provided a wrong input companion for the input.',
					],
					inputIteratorResult.value,
					this._parserInputCompanion.constructor.name,
				);

				this._sequenceBuffer.push(inputIteratorResult.value);
			}
		});
	}

	async peekSequence(start: number, end: number): Promise<Sequence | undefined> {
		parserImplementationInvariant(start >= 0, 'start >= 0');
		parserImplementationInvariant(end >= start, 'end >= start');

		const sequence = this._sequenceBuffer.peekSequence(start, end);

		if (sequence !== undefined) {
			return sequence;
		}

		const lastElement = await this.peek(Math.max(0, end - 1));

		if (lastElement === undefined) {
			return undefined;
		}

		return this._sequenceBuffer.peekSequence(start, end);
	}

	skip(offset: number) {
		parserImplementationInvariant(offset >= 0, 'offset >= 0');

		this._position += offset;

		if (this._promiseMutex.isLocked) {
			this._uncommitedSkipOffset += offset;
		} else {
			this._sequenceBuffer.skip(offset + this._uncommitedSkipOffset);
			this._uncommitedSkipOffset = 0;
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

	get [Symbol.toStringTag]() {
		return [
			'InputReaderLookahead',
			this._inputReader.toString(),
			this.position,
		].join(' ');
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

	async peekSequence(start: number, end: number): Promise<Sequence | undefined> {
		const inputReaderMovedForward = this._inputReader.position - this._initialInputReaderPosition;

		this._initialInputReaderPosition = this._inputReader.position;
		this._offset -= inputReaderMovedForward;

		return this._inputReader.peekSequence(this._offset + start, this._offset + end);
	}

	skip(offset: number) {
		parserImplementationInvariant(offset >= 0, 'offset >= 0');

		this._offset += offset;
	}

	lookahead(): InputReader<Sequence, Element> {
		const lookahead = new InputReaderLookaheadImplementation(this._inputReader);

		const offset = this.position - lookahead.position;

		lookahead.skip(offset);

		invariant(
			this.position === lookahead.position,
			'this.position (%s) === lookahead.position (%s)',
			this.position,
			lookahead.position,
		);

		return lookahead;
	}
}
