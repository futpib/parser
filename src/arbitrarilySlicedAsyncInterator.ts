import { type Arbitrary } from 'fast-check';
import { arbitrarilySlicedAsyncIterable } from './arbitrarilySlicedAsyncInterable.js';

export function arbitrarilySlicedAsyncIterator<Sliceable extends string | Uint8Array>(arbitrarySliceable: Arbitrary<Sliceable>): Arbitrary<[ Sliceable, AsyncIterator<Sliceable> ]> {
	return (
		arbitrarilySlicedAsyncIterable(arbitrarySliceable)
			.map(([ sliceable, asyncIterable ]) => {
				const asyncIterator_ = asyncIterable[Symbol.asyncIterator]();

				const asyncIterableWithTag = asyncIterable as AsyncIterable<Sliceable> & { [Symbol.toStringTag]?: string };

				const asyncIterator = {
					next: asyncIterator_.next.bind(asyncIterator_),
					return: asyncIterator_.return?.bind(asyncIterator_),
					throw: asyncIterator_.throw?.bind(asyncIterator_),
					[Symbol.toStringTag]: 'ArbitrarilySlicedAsyncIterator ' + (asyncIterableWithTag[Symbol.toStringTag] ?? ''),
				};

				return [
					sliceable,
					asyncIterator,
				];
			})
	);
}
