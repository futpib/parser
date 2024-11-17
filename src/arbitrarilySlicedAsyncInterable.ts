import { inspect } from 'node:util';
import * as fc from 'fast-check';
import { type Arbitrary } from 'fast-check';
import invariant from 'invariant';

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
): Arbitrary<[ Sliceable, AsyncIterable<Sliceable> ]> {
	return (
		fc.tuple(arbitrarySliceable, fc.array(fc.nat(), { minLength: 1 }))
			.map(([ sliceable, sliceSizes ]) => {
				let start = 0;

				const slices = sliceSizes.map(sliceSize => {
					const slice = sliceable.slice(start, start + sliceSize) as Sliceable;
					start += sliceSize;
					return slice;
				});

				slices.push(sliceable.slice(start) as Sliceable);

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

				const asyncIterable = {
					async * [Symbol.asyncIterator]() {
						yield * slices;
					},
					[Symbol.toStringTag]: 'ArbitrarilySlicedAsyncIterable ' + JSON.stringify(slices),
				};

				return [ sliceable, asyncIterable ];
			})
	);
}
