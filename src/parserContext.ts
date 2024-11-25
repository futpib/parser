import invariant from 'invariant';
import { type InputCompanion } from './inputCompanion.js';
import { type InputReader } from './inputReader.js';
import { ParserUnexpectedEndOfInputError } from './parserError.js';

export type ParserContext<InputChunk, InputElement> = {
	from(inputElements: InputElement[]): InputChunk;
	length(inputChunk: InputChunk): number;
	at(inputChunk: InputChunk, index: number): InputElement | undefined;

	peek(offset: number): Promise<InputElement | undefined>;
	skip(offset: number): void;

	read(offset: number): Promise<InputElement>;

	lookahead(): ParserContext<InputChunk, InputElement>;
	unlookahead(other: ParserContext<InputChunk, InputElement>): void;
};

let idCounter = 0;

export class ParserContextImplementation<InputChunk, InputElement> implements ParserContext<InputChunk, InputElement> {
	constructor(
		private readonly _inputCompanion: InputCompanion<InputChunk, InputElement>,
		private _inputReader: InputReader<InputChunk, InputElement>,
	) {}

	private readonly _id = idCounter++;
	private _lastPeek0: InputElement | undefined;

	get [Symbol.toStringTag]() {
		return [
			'ParserContextImplementation',
			this._id,
			this._inputReader.position,
			JSON.stringify(this._lastPeek0),
		].join(' ');
	}

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
		const inputElement = await this._inputReader.peek(offset);

		if (offset === 0) {
			this._lastPeek0 = inputElement;
		}

		return inputElement;
	}

	skip(offset: number) {
		this._inputReader.skip(offset);
	}

	async read(offset: number): Promise<InputElement> {
		const inputElement = await this.peek(offset);

		if (inputElement === undefined) {
			throw new ParserUnexpectedEndOfInputError();
		}

		this.skip(offset + 1);

		return inputElement;
	}

	lookahead(): ParserContext<InputChunk, InputElement> {
		return new ParserContextImplementation(this._inputCompanion, this._inputReader.lookahead());
	}

	unlookahead(other: ParserContext<InputChunk, InputElement>) {
		invariant(other instanceof ParserContextImplementation, 'unlookahead other instanceof ParserContextImplementation');
		invariant(
			other._inputReader.position <= this._inputReader.position,
			'unlookahead other.position (%s) <= this.position (%s)',
			other._inputReader.position,
			this._inputReader.position,
		);

		const offset = this._inputReader.position - other._inputReader.position;

		other.skip(offset);

		invariant(
			other._inputReader.position === this._inputReader.position,
			'unlookahead other.position (%s) === this.position (%s)',
			other._inputReader.position,
			this._inputReader.position,
		);

		this._inputReader = other._inputReader;
	}
}
