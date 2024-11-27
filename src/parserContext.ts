import invariant from 'invariant';
import { type InputCompanion } from './inputCompanion.js';
import { type InputReader } from './inputReader.js';
import { ParserUnexpectedEndOfInputError } from './parserError.js';

export type ParserContext<Sequence, Element> = {
	from(elements: Element[]): Sequence;
	length(sequence: Sequence): number;
	at(sequence: Sequence, index: number): Element | undefined;

	get position(): number;
	peek(offset: number): Promise<Element | undefined>;
	skip(offset: number): void;

	read(offset: number): Promise<Element>;

	lookahead(debugName?: string): ParserContext<Sequence, Element>;
	unlookahead(): void;
	dispose(): void;
};

let parserContextId = 0;

export class ParserContextImplementation<Sequence, Element> implements ParserContext<Sequence, Element> {
	private readonly _id = parserContextId ++;

	private _exclusiveChildParserContext: ParserContext<Sequence, Element> | undefined = undefined;

	constructor(
		private readonly _inputCompanion: InputCompanion<Sequence, Element>,
		private _inputReader: InputReader<Sequence, Element>,
		private _parentParserContext: ParserContextImplementation<Sequence, Element> | undefined = undefined,
		private readonly _debugName = '',
	) {}

	get [Symbol.toStringTag]() {
		return [
			'ParserContext',
			[
				this._debugName,
				'(',
				this._id,
				')',
			].join(''),
			this._inputReader.toString(),
		].join(' ');
	}

	from(elements: Element[]): Sequence {
		return this._inputCompanion.from(elements);
	}

	length(sequence: Sequence): number {
		return this._inputCompanion.length(sequence);
	}

	at(sequence: Sequence, index: number): Element | undefined {
		return this._inputCompanion.at(sequence, index);
	}

	get position() {
		return this._inputReader.position;
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

	lookahead(debugName?: string): ParserContext<Sequence, Element> {
		const lookaheadInputReader = this._inputReader.lookahead();

		if (this.position !== lookaheadInputReader.position) {
			debugger;
		}

		invariant(
			this.position === lookaheadInputReader.position,
			'lookahead this.position (%s) === lookaheadInputReader.position (%s)',
			this.position,
			lookaheadInputReader.position,
		);

		const lookaheadParserContext = new ParserContextImplementation(
			this._inputCompanion,
			lookaheadInputReader,
			this,
			[
				this._debugName,
				'(',
				this._id,
				')',
				'/',
				debugName,
			].join(''),
		);

		if (this.position !== lookaheadParserContext.position) {
			debugger;
		}

		invariant(
			this.position === lookaheadParserContext.position,
			'lookahead this.position (%s) === lookaheadParserContext.position (%s)',
			this.position,
			lookaheadParserContext.position,
		);

		return lookaheadParserContext;
	}

	unlookahead() {
		invariant(this._parentParserContext !== undefined, 'this._parentParserContext !== undefined');
		invariant(
			(
				this._parentParserContext._exclusiveChildParserContext === undefined
				|| this._parentParserContext._exclusiveChildParserContext === this
			),
			[
				'Parent\'s exclusive child must be undefined or this',
				'this: %s',
				'parent: %s',
				'parent.exclusiveChild: %s',
			].join('\n'),
			this.toString(),
			this._parentParserContext.toString(),
			this._parentParserContext._exclusiveChildParserContext?.toString(),
		);
		invariant(
			this._parentParserContext.position <= this.position,
			'unlookahead this._parentParserContext.position (%s) <= this.position (%s)',
			this._parentParserContext.position,
			this.position,
		);

		const offset = this._inputReader.position - this._parentParserContext._inputReader.position;

		this._parentParserContext.skip(offset);

		invariant(
			this._parentParserContext.position === this.position,
			'unlookahead this._parentParserContext.position (%s) === this.position (%s)',
			this._parentParserContext.position,
			this.position,
		);

		this._inputReader = this._parentParserContext._inputReader;
		this._parentParserContext._exclusiveChildParserContext = this;

		if (this._exclusiveChildParserContext) {
			this._exclusiveChildParserContext.unlookahead();
		}
	}

	dispose() {
		invariant(this._parentParserContext !== undefined, 'this._parentParserContext !== undefined');
		invariant(
			(
				this._parentParserContext._exclusiveChildParserContext === undefined
				|| this._parentParserContext._exclusiveChildParserContext === this
			),
			[
				'Parent\'s exclusive child must be undefined or this',
				'this: %s',
				'parent: %s',
				'parent.exclusiveChild: %s',
			].join('\n'),
			this.toString(),
			this._parentParserContext.toString(),
			this._parentParserContext._exclusiveChildParserContext?.toString(),
		);

		this._parentParserContext._exclusiveChildParserContext = undefined;
		this._parentParserContext = undefined;
	}
}
