export function toAsyncIterable<T>(value: AsyncIterator<T>): AsyncIterable<T> {
	return {
		[Symbol.asyncIterator]() {
			return value;
		},
	};
}
