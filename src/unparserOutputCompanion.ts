import { StringParserInputCompanion, Uint8ArrayParserInputCompanion } from "./parserInputCompanion.js";

export type UnparserOutputCompanion<Sequence, Element> = {
	is(value: unknown): value is Sequence;
	from(elements: Element[]): Sequence;
	concat(sequences: Sequence[]): Sequence;
	length(sequence: Sequence): number;
};

export class StringUnparserOutputCompanion extends StringParserInputCompanion implements UnparserOutputCompanion<string, string> {
	concat(sequences: string[]): string {
		return sequences.join('');
	}
}

export const stringUnparserOutputCompanion = new StringUnparserOutputCompanion();

export class Uint8ArrayUnparserOutputCompanion extends Uint8ArrayParserInputCompanion implements UnparserOutputCompanion<Uint8Array, number> {
	concat(sequences: Uint8Array[]): Uint8Array {
		return Buffer.concat(sequences);
	}
}

export const uint8ArrayUnparserOutputCompanion = new Uint8ArrayUnparserOutputCompanion();
