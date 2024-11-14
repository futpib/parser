
export interface InputCompanion<InputChunk, InputElement> {
	length(inputChunk: InputChunk): number;
	at(inputChunk: InputChunk, index: number): InputElement | undefined;
}

export const stringInputCompanion = new class StringInputCompanion implements InputCompanion<string, string> {
	length(inputChunk: string): number {
		return inputChunk.length;
	}

	at(inputChunk: string, index: number): string | undefined {
		return inputChunk.at(index);
	}
};

export const uint8ArrayInputCompanion = new class Uint8ArrayInputCompanion implements InputCompanion<Uint8Array, number> {
	length(inputChunk: Uint8Array): number {
		return inputChunk.length;
	}

	at(inputChunk: Uint8Array, index: number): number | undefined {
		return inputChunk.at(index);
	}
};
