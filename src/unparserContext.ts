/* eslint-disable prefer-arrow-callback */

import { Unparser, UnparserResult } from "./unparser.js";
import { UnparserOutputCompanion } from "./unparserOutputCompanion.js";
import { unparserImplementationInvariant } from "./unparserImplementationInvariant.js";
import { parserImplementationInvariant } from "./parserImplementationInvariant.js";

export type UnparserContext<Sequence, Element> = {
	get position(): number;

	writeLater(length: number): AsyncIterable<WriteLater<Sequence, Element>, WriteLater<Sequence, Element>>;
	writeEarlier<Input>(
		writeLater: WriteLater<Sequence, Element>,
		unparser: Unparser<Input, Sequence, Element>,
		input: Input,
	): AsyncIterable<WriteEarlier<Sequence, Element>, void>;
};

export class WriteLater<Sequence, Element> extends Error {
	name = 'WriteLater';

	constructor (
		private readonly _position: number,
		private readonly _length: number,
	) {
		super(`(position: ${_position}, length: ${_length})`);
	}

	get position() {
		return this._position;
	}

	get positionEnd() {
		return this._position + this._length;
	}

	get length() {
		return this._length;
	}
}

export class WriteEarlier<Sequence, Element> {
	constructor(
		public readonly writeLater: WriteLater<Sequence, Element>,
		public readonly unparserResult: UnparserResult<Sequence, Element>,
		public readonly unparserContext: UnparserContext<Sequence, Element>,
	) {}
}

export class UnparserContextImplementation<Sequence, Element> implements UnparserContext<Sequence, Element> {
	private _position: number;

	constructor(
		private readonly _outputCompanion: UnparserOutputCompanion<Sequence, Element>,
		position = 0,
	) {
		this._position = position;
	}

	get position() {
		return this._position;
	}

	async * writeLater(length: number): AsyncIterable<WriteLater<Sequence, Element>, WriteLater<Sequence, Element>> {
		parserImplementationInvariant(
			length >= 0,
			'Length of WriteLater must be non-negative, got %s.',
			length,
		);

		const writeLater = new WriteLater<Sequence, Element>(this._position, length);
		yield writeLater;
		return writeLater;
	}

	async * writeEarlier<Input>(
		writeLater: WriteLater<Sequence, Element>,
		unparser: Unparser<Input, Sequence, Element>,
		input: Input,
	): AsyncIterable<WriteEarlier<Sequence, Element>, void> {
		const unparserContext = new UnparserContextImplementation(this._outputCompanion, writeLater.position);
		yield new WriteEarlier(
			writeLater,
			(async function * () {
				const startPosition = unparserContext.position;

				yield * unparser(input, unparserContext);

				const endPosition = unparserContext.position;
				const writtenLength = endPosition - startPosition;

				unparserImplementationInvariant(
					writtenLength === writeLater.length,
					[
						'WriteEarlier was supposed to write %s elements but wrote %s elements instead.',
						'Corresponding WriteLater stack (this is where it was created): %s',
						'End of corresponding WriteEarlier stack.',
					],
					writeLater.length,
					writtenLength,
					writeLater.stack,
				);
			})(),
			unparserContext,
		);
	}

	handleYield(
		value:
			| Sequence
			| WriteLater<Sequence, Element>
			| WriteEarlier<Sequence, Element>
		,
	) {
		if (value instanceof WriteEarlier) {
			return;
		}

		if (value instanceof WriteLater) {
			this._position += value.length;
			return;
		}

		const length = this._outputCompanion.length(value);
		this._position += length;
	}
}
