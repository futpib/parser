
export type InputCompanion<InputChunk, InputElement> = {
	from(inputElements: InputElement[]): InputChunk;
	length(inputChunk: InputChunk): number;
	at(inputChunk: InputChunk, index: number): InputElement | undefined;
};

export const stringInputCompanion = new class StringInputCompanion implements InputCompanion<string, string> {
	from(inputElements: string[]): string {
		return inputElements.join('');
	}

	length(inputChunk: string): number {
		return inputChunk.length;
	}

	at(inputChunk: string, index: number): string | undefined {
		return inputChunk.at(index);
	}
}();

export const uint8ArrayInputCompanion = new class Uint8ArrayInputCompanion implements InputCompanion<Uint8Array, number> {
	from(inputElements: number[]): Uint8Array {
		return new Uint8Array(inputElements);
	}

	length(inputChunk: Uint8Array): number {
		return inputChunk.length;
	}

	at(inputChunk: Uint8Array, index: number): number | undefined {
		return inputChunk.at(index);
	}
}();
