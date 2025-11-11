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

test('allSettledStream reader cancel', async t => {
	const stream = allSettledStream<number, number>([
		10,
		20,
		0,
		40,
		30,
	].map(delay => ({
		promise: new Promise<number>(resolve => {
			setTimeout(() => {
				resolve(delay);
			}, delay);
		}),
		context: delay,
	})));

	const results: any[] = [];

	for await (const value of stream) {
		results.push(value);

		if (value.context === 30) {
			break;
		}
	}

	await new Promise<void>(resolve => {
		setTimeout(resolve, 50);
	});

	stream.cancel();

	for await (const value of stream) {
		t.fail();
		results.push(value);
	}

	t.deepEqual(results.map(({ context }) => context), [ 0, 10, 20, 30 ]);
});
