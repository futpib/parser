
export type ParserInputCompanion<Sequence, Element> = {
	is(value: unknown): value is Sequence;
	from(elements: Element[]): Sequence;
	concat(sequences: Sequence[]): Sequence;
	length(sequence: Sequence): number;
	at(sequence: Sequence, index: number): Element | undefined;
	subsequence(sequence: Sequence, start: number, end: number): Sequence;
	indexOf(sequence: Sequence, element: Element, fromIndex?: number): number;
	indexOfSubsequence(sequence: Sequence, subsequence: Sequence, fromIndex?: number): number;
	equals(sequenceA: Sequence, sequenceB: Sequence): boolean;
};

export class StringParserInputCompanion implements ParserInputCompanion<string, string> {
	is(value: unknown): value is string {
		return typeof value === 'string';
	}

	from(elements: string[]): string {
		return elements.join('');
	}

	concat(sequences: string[]): string {
		return sequences.join('');
	}

	length(sequence: string): number {
		return sequence.length;
	}

	at(sequence: string, index: number): string | undefined {
		return sequence.at(index);
	}

	subsequence(sequence: string, start: number, end: number): string {
		return sequence.slice(start, end);
	}

	indexOf(sequence: string, element: string, fromIndex?: number): number {
		return sequence.indexOf(element, fromIndex);
	}

	indexOfSubsequence(sequence: string, subsequence: string, fromIndex?: number): number {
		return sequence.indexOf(subsequence, fromIndex);
	}

	equals(sequenceA: string, sequenceB: string): boolean {
		return sequenceA === sequenceB;
	}
}

export const stringParserInputCompanion = new StringParserInputCompanion();

export class Uint8ArrayParserInputCompanion implements ParserInputCompanion<Uint8Array, number> {
	is(value: unknown): value is Uint8Array {
		return value instanceof Uint8Array;
	}

	from(elements: number[]): Uint8Array {
		return new Uint8Array(elements);
	}

	concat(sequences: Uint8Array[]): Uint8Array {
		return new Uint8Array(Buffer.concat(sequences));
	}

	length(sequence: Uint8Array): number {
		return sequence.length;
	}

	at(sequence: Uint8Array, index: number): number | undefined {
		return sequence.at(index);
	}

	subsequence(sequence: Uint8Array, start: number, end: number): Uint8Array {
		return sequence.subarray(start, end);
	}

	indexOf(sequence: Uint8Array, element: number, fromIndex?: number): number {
		return sequence.indexOf(element, fromIndex);
	}

	indexOfSubsequence(sequence: Uint8Array, subsequence: Uint8Array, fromIndex?: number): number {
		return Buffer.from(sequence).indexOf(Buffer.from(subsequence), fromIndex);
	}

	equals(sequenceA: Uint8Array, sequenceB: Uint8Array): boolean {
		if (sequenceA.length !== sequenceB.length) {
			return false;
		}

		for (let index = 0; index < sequenceA.length; index++) {
			if (sequenceA[index] !== sequenceB[index]) {
				return false;
			}
		}

		return true;
	}
}

export const uint8ArrayParserInputCompanion = new Uint8ArrayParserInputCompanion();
