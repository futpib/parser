import invariant from 'invariant';
import { type InputCompanion } from './inputCompanion.js';
import { type InputReader } from './inputReader.js';
import { ParserUnexpectedEndOfInputError } from './parserError.js';

export type ParserContext<Sequence, Element> = {
	from(elements: Element[]): Sequence;
	length(sequence: Sequence): number;
	at(sequence: Sequence, index: number): Element | undefined;

	peek(offset: number): Promise<Element | undefined>;
	skip(offset: number): void;

	read(offset: number): Promise<Element>;

	lookahead(): ParserContext<Sequence, Element>;
	unlookahead(other: ParserContext<Sequence, Element>): void;
};

export class ParserContextImplementation<Sequence, Element> implements ParserContext<Sequence, Element> {
	constructor(
		private readonly _inputCompanion: InputCompanion<Sequence, Element>,
		private _inputReader: InputReader<Sequence, Element>,
	) {}

	from(elements: Element[]): Sequence {
		return this._inputCompanion.from(elements);
	}

	length(sequence: Sequence): number {
		return this._inputCompanion.length(sequence);
	}

	at(sequence: Sequence, index: number): Element | undefined {
		return this._inputCompanion.at(sequence, index);
	}

	peek(offset: number): Promise<Element | undefined> {
		return this._inputReader.peek(offset);
	}

	skip(offset: number) {
		this._inputReader.skip(offset);
	}

	async read(offset: number): Promise<Element> {
		const element = await this.peek(offset);

		if (element === undefined) {
			throw new ParserUnexpectedEndOfInputError();
		}

		this.skip(offset + 1);

		return element;
	}

	lookahead(): ParserContext<Sequence, Element> {
		return new ParserContextImplementation(this._inputCompanion, this._inputReader.lookahead());
	}

	unlookahead(other: ParserContext<Sequence, Element>) {
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
