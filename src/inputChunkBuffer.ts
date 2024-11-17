import invariant from 'invariant';
import { type InputCompanion } from './inputCompanion.js';

export class InputChunkBuffer<InputChunk, InputElement> {
	private readonly _inputChunks: InputChunk[] = [];
	private _indexInFirstInputChunk = 0;

	constructor(private readonly _inputCompanion: InputCompanion<InputChunk, InputElement>) {}

	push(inputChunk: InputChunk) {
		this._inputChunks.push(inputChunk);

		while (this._inputChunks.length > 0) {
			const firstInputChunk = this._inputChunks[0];
			const firstInputChunkLength = this._inputCompanion.length(firstInputChunk);

			if (firstInputChunkLength === 0) {
				this._inputChunks.shift();
				continue;
			}

			if (this._indexInFirstInputChunk < firstInputChunkLength) {
				break;
			}

			this._inputChunks.shift();
			this._indexInFirstInputChunk -= firstInputChunkLength;
		}
	}

	peek(offset: number): InputElement | undefined {
		invariant(offset >= 0, 'Offset must be non-negative.');

		let index = this._indexInFirstInputChunk + offset;

		for (const inputChunk of this._inputChunks) {
			const inputChunkLength = this._inputCompanion.length(inputChunk);

			if (index < inputChunkLength) {
				return this._inputCompanion.at(inputChunk, index);
			}

			index -= inputChunkLength;
		}

		return undefined;
	}

	skip(offset: number) {
		this._indexInFirstInputChunk += offset;
	}
}
