import test from 'ava';
import { LazyMessageError } from './lazyMessageError.js';

test('LazyMessageError works', t => {
	const error = new LazyMessageError([
		() => [
			'Line 1: %s',
			'Line 2: %s and %s.',
		],
		42,
		() => 'foo',
		true,
	]);

	error.computeMessage();

	t.is(
		error.message,
		'Line 1: 42\nLine 2: foo and true.',
	);
});
