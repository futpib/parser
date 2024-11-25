import invariant from 'invariant';
import { type InputCompanion } from './inputCompanion.js';

export interface SequenceBuffer<Sequence, Element> {
	push(sequence: Sequence): void;
	peek(offset: number): Element | undefined;
	skip(offset: number): void;
}

export class SequenceBufferImplementation<Sequence, Element> implements SequenceBuffer<Sequence, Element> {
	private readonly _sequences: Sequence[] = [];
	private _indexInFirstSequence = 0;

	constructor(private readonly _inputCompanion: InputCompanion<Sequence, Element>) {}

	push(sequence: Sequence) {
		this._sequences.push(sequence);

		while (this._sequences.length > 0) {
			const firstSequence = this._sequences[0];
			const firstSequenceLength = this._inputCompanion.length(firstSequence);

			if (firstSequenceLength === 0) {
				this._sequences.shift();
				continue;
			}

			if (this._indexInFirstSequence < firstSequenceLength) {
				break;
			}

			this._sequences.shift();
			this._indexInFirstSequence -= firstSequenceLength;
		}
	}

	peek(offset: number): Element | undefined {
		invariant(offset >= 0, 'Offset must be non-negative.');

		let index = this._indexInFirstSequence + offset;

		for (const sequence of this._sequences) {
			const sequenceLength = this._inputCompanion.length(sequence);

			if (index < sequenceLength) {
				return this._inputCompanion.at(sequence, index);
			}

			index -= sequenceLength;
		}

		return undefined;
	}

	skip(offset: number) {
		this._indexInFirstSequence += offset;
	}
}
