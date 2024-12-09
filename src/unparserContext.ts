/* eslint-disable prefer-arrow-callback */

import { UnparserOutputCompanion } from "./unparserOutputCompanion.js";

export type UnparserContext<Sequence, Element> = {
	get position(): number;
};

export class UnparserContextImplementation<Sequence, Element> implements UnparserContext<Sequence, Element> {
	private _position = 0;

	constructor(
		private readonly _outputCompanion: UnparserOutputCompanion<Sequence, Element>,
	) {}

	get position() {
		return this._position;
	}

	handleYield(sequence: Sequence) {
		const length = this._outputCompanion.length(sequence);
		this._position += length;
	}
}
