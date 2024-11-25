
export type InputCompanion<Sequence, Element> = {
	from(elements: Element[]): Sequence;
	length(sequence: Sequence): number;
	at(sequence: Sequence, index: number): Element | undefined;
};

export const stringInputCompanion = new class StringInputCompanion implements InputCompanion<string, string> {
	from(elements: string[]): string {
		return elements.join('');
	}

	length(sequence: string): number {
		return sequence.length;
	}

	at(sequence: string, index: number): string | undefined {
		return sequence.at(index);
	}
}();

export const uint8ArrayInputCompanion = new class Uint8ArrayInputCompanion implements InputCompanion<Uint8Array, number> {
	from(elements: number[]): Uint8Array {
		return new Uint8Array(elements);
	}

	length(sequence: Uint8Array): number {
		return sequence.length;
	}

	at(sequence: Uint8Array, index: number): number | undefined {
		return sequence.at(index);
	}
}();
