import { Arbitrary } from 'fast-check';
import { arbitrarilySlicedAsyncIterable } from './arbitrarilySlicedAsyncInterable.js';

export function arbitrarilySlicedAsyncIterator<Sliceable extends string | Uint8Array>(
	arbitrarySliceable: Arbitrary<Sliceable>,
): Arbitrary<[ Sliceable, AsyncIterator<Sliceable> ]> {
	return (
		arbitrarilySlicedAsyncIterable(arbitrarySliceable)
			.map(([ sliceable, asyncIterable ]) => {
				const asyncIterator_ = asyncIterable[Symbol.asyncIterator]();

				const asyncIterator = {
					next: asyncIterator_.next.bind(asyncIterator_),
					return: asyncIterator_.return?.bind(asyncIterator_),
					throw: asyncIterator_.throw?.bind(asyncIterator_),
					[Symbol.toStringTag]: 'ArbitrarilySlicedAsyncIterator ' + (asyncIterable as any)[Symbol.toStringTag],
				};

				return [
					sliceable,
					asyncIterator,
				]
			})
	);
}
