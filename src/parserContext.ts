import { type InputCompanion } from './inputCompanion.js';
import { type InputReader } from './inputReader.js';

export type ParserContext<InputChunk, InputElement> = {
	from(inputElements: InputElement[]): InputChunk;
	length(inputChunk: InputChunk): number;
	at(inputChunk: InputChunk, index: number): InputElement | undefined;

	peek(offset: number): Promise<InputElement | undefined>;
	skip(offset: number): void;
};

export class ParserContextImplementation<InputChunk, InputElement> implements ParserContext<InputChunk, InputElement> {
	constructor(
		private readonly _inputCompanion: InputCompanion<InputChunk, InputElement>,
		private readonly _inputReader: InputReader<InputChunk, InputElement>,
	) {}

	from(inputElements: InputElement[]): InputChunk {
		return this._inputCompanion.from(inputElements);
	}

	length(inputChunk: InputChunk): number {
		return this._inputCompanion.length(inputChunk);
	}

	at(inputChunk: InputChunk, index: number): InputElement | undefined {
		return this._inputCompanion.at(inputChunk, index);
	}

	async peek(offset: number): Promise<InputElement | undefined> {
		return this._inputReader.peek(offset);
	}

	skip(offset: number) {
		this._inputReader.skip(offset);
	}
}
