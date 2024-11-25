import test from 'ava';
import { allSettledStream } from './allSettledStream.js';

test('allSettledStream', async t => {
	const stream = allSettledStream<number, number | string>([
		{
			delay: 10,
			context: 1,
		},
		{
			delay: 10,
			context: 'a',
		},
		{
			delay: 20,
			context: 2,
		},
		{
			delay: 20,
			context: 'b',
		},
		{
			delay: 0,
			context: 3,
		},
		{
			delay: 0,
			context: 'c',
		},
		{
			delay: 40,
			context: 4,
		},
		{
			delay: 40,
			context: 'd',
		},
	].map(({ delay, context }) => ({
		promise: new Promise<number>((resolve, reject) => {
			setTimeout(() => {
				if (typeof context === 'number') {
					resolve(context);
				} else {
					reject(context);
				}
			}, delay);
		}),
		context,
	})));

	const results: any[] = [];

	for await (const value of stream) {
		results.push(value);
	}

	t.snapshot(results);
	t.is(results.length, 8);
});
