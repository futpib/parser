import * as fc from 'fast-check';
import { type Arbitrary } from 'fast-check';
import invariant from 'invariant';
import { inspect } from './inspect.js';

function concat<Sliceable extends string | Uint8Array>(slices: Sliceable[]): Sliceable {
	const firstSlice = slices.at(0);

	if (firstSlice instanceof Uint8Array) {
		return Buffer.concat(slices as Uint8Array[]) as unknown as Sliceable;
	}

	return slices.join('') as Sliceable;
}

function equals<Sliceable extends string | Uint8Array>(a: Sliceable, b: Sliceable): boolean {
	if (a instanceof Uint8Array) {
		return Buffer.compare(a, b as Uint8Array) === 0;
	}

	return a === b;
}

export function arbitrarilySlicedAsyncIterable<Sliceable extends string | Uint8Array>(
	arbitrarySliceable: Arbitrary<Sliceable>,
	{
		minSlices = 1,
	}: {
		minSlices?: number,
	} = {},
): Arbitrary<[ Sliceable, AsyncIterable<Sliceable> ]> {
	return (
		fc.tuple(arbitrarySliceable, fc.array(fc.nat(), { minLength: Math.max(1, minSlices) }))
			.map(([ sliceable, sliceSizes ]) => {
				let start = 0;

				const slices = sliceSizes.map(sliceSize => {
					const slice = sliceable.slice(start, start + sliceSize) as Sliceable;
					start += sliceSize;
					return slice;
				});

				const lastSlice = sliceable.slice(start) as Sliceable;

				if (lastSlice.length > 0) {
					slices.push(lastSlice);
				}

				const concatenated = concat(slices);

				invariant(
					equals(concatenated, sliceable),
					[
						'Slices do not concatenate to the original sliceable.',
						'Original sliceable: %s.',
						'Concatenated slices: %s.',
						'Slice sizes: %s.',
						'Slices: %s.',
					].join('\n'),
					inspect(sliceable),
					inspect(concatenated),
					inspect(sliceSizes),
					inspect(slices),
				);

				const asyncIterable: AsyncIterable<Sliceable> & {
					[Symbol.toStringTag]: string;
				} = {
					async * [Symbol.asyncIterator]() {
						yield * slices;
					},
					[Symbol.toStringTag]: 'ArbitrarilySlicedAsyncIterable ' + slices.length + ' ' + JSON.stringify(slices),
				};

				return [ sliceable, asyncIterable ];
			})
	);
}
