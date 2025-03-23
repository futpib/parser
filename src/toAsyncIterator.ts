import invariant from "invariant";

function isAsyncIterable<T>(value: any): value is AsyncIterable<T> {
	return value && typeof value[Symbol.asyncIterator] === 'function';
}

function isIterable<T>(value: any): value is Iterable<T> {
	return value && typeof value[Symbol.iterator] === 'function';
}

function isIterator<T>(value: any): value is Iterator<T> {
	return value && typeof value.next === 'function';
}

function iteratorToAsyncIterator<T>(iterator: Iterator<T>): AsyncIterator<T> {
	return {
		next: async () => iterator.next(),
	};
}

export function toAsyncIterator<T>(value: AsyncIterator<T> | AsyncIterable<T> | Iterable<T> | T): AsyncIterator<T> {
	if (
		typeof value === 'string'
		|| value instanceof Uint8Array
	) {
		return (async function * () {
			yield value as any;
		})();
	}

	if (isAsyncIterable(value)) {
		return value[Symbol.asyncIterator]();
	}

	if (isIterable(value)) {
		return iteratorToAsyncIterator(value[Symbol.iterator]());
	}

	if (isIterator<T>(value)) {
		return iteratorToAsyncIterator(value);
	}

	invariant(
		false,
		'Value must be an async iterator, async iterable, iterable or iterator got %s.',
		value,
	);
}
