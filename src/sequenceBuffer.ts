import invariant from 'invariant';
import { type ParserInputCompanion } from './parserInputCompanion.js';

export type SequenceBuffer<Sequence, Element> = {
	push(sequence: Sequence): void;
	peek(offset: number): Element | undefined;
	skip(offset: number): void;
};

export class SequenceBufferImplementation<Sequence, Element> implements SequenceBuffer<Sequence, Element> {
	private readonly _sequences: Sequence[] = [];
	private _indexInFirstSequence = 0;

	constructor(private readonly _parserInputCompanion: ParserInputCompanion<Sequence, Element>) {}

	push(sequence: Sequence) {
		this._sequences.push(sequence);

		while (this._sequences.length > 0) {
			const firstSequence = this._sequences[0];
			const firstSequenceLength = this._parserInputCompanion.length(firstSequence);

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
			const sequenceLength = this._parserInputCompanion.length(sequence);

			if (index < sequenceLength) {
				return this._parserInputCompanion.at(sequence, index);
			}

			index -= sequenceLength;
		}

		return undefined;
	}

	skip(offset: number) {
		this._indexInFirstSequence += offset;
	}
}
