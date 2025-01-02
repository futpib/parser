import invariant from 'invariant';
import { type ParserInputCompanion } from './parserInputCompanion.js';

export type SequenceBuffer<Sequence, Element> = {
	push(sequence: Sequence): void;
	peek(offset: number): Element | undefined;
	peekSequence(start: number, end: number): Sequence | undefined;
	skip(offset: number): void;
};

export class SequenceBufferImplementation<Sequence, Element> implements SequenceBuffer<Sequence, Element> {
	private readonly _sequences: Sequence[] = [];
	private _indexInFirstSequence = 0;

	constructor(private readonly _parserInputCompanion: ParserInputCompanion<Sequence, Element>) {}

	get length() {
		return this._sequences.reduce(
			(sequenceLength, sequence) => sequenceLength + this._parserInputCompanion.length(sequence),
			0 - this._indexInFirstSequence,
		);
	}

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

	peekSequence(start: number, end: number): Sequence | undefined {
		invariant(start >= 0, 'Start must be non-negative.');
		invariant(end >= start, 'End must be greater than or equal to start.');

		let startIndex = this._indexInFirstSequence + start;
		let endIndex = this._indexInFirstSequence + end;

		const sequences: Sequence[] = [];

		for (const sequence of this._sequences) {
			const sequenceLength = this._parserInputCompanion.length(sequence);

			if (startIndex < sequenceLength) {
				const subsequence = this._parserInputCompanion.subsequence(
					sequence,
					Math.max(0, startIndex),
					Math.min(sequenceLength, endIndex),
				)
				sequences.push(subsequence);
			}

			startIndex -= sequenceLength;
			endIndex -= sequenceLength;

			if (endIndex <= 0) {
				break;
			}
		}

		return endIndex > 0 ? undefined : this._parserInputCompanion.concat(sequences);
	}

	skip(offset: number) {
		this._indexInFirstSequence += offset;
	}
}
