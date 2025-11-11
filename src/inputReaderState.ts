export type InputReaderState<Sequence> = {
	position: number;
	consumedBufferedSequences: Sequence[];
	unconsumedBufferedSequences: Sequence[];
	unbufferedSequences: undefined | AsyncIterator<Sequence>;
};

export const inputReaderStateCompanion = {
	isDone<Sequence>({
		unconsumedBufferedSequences,
		unbufferedSequences,
	}: InputReaderState<Sequence>): boolean {
		return (
			unconsumedBufferedSequences.length === 0
			&& unbufferedSequences === undefined
		);
	},

	async * toRemainingInputAsyncIterator<Sequence>({
		unconsumedBufferedSequences,
		unbufferedSequences,
	}: InputReaderState<Sequence>): AsyncIterable<Sequence> {
		yield * unconsumedBufferedSequences;

		if (unbufferedSequences !== undefined) {
			yield * {
				[Symbol.asyncIterator]() {
					return unbufferedSequences;
				},
			};
		}
	},
};
