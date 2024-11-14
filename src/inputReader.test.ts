import test from 'ava';
import { InputReaderImplementation } from './inputReader.js';
import { stringInputCompanion } from './inputCompanion.js';

test('inputReader', async t => {
	const inputReader = new InputReaderImplementation(stringInputCompanion, (async function * () {
		yield '';
		yield 'abc';
		yield 'def';
		yield '';
		yield 'gh';
	})());

	t.is(await inputReader.peek(0), 'a');

	inputReader.skip(0);

	t.is(await inputReader.peek(1), 'b');

	inputReader.skip(1);

	t.is(await inputReader.peek(1), 'c');
	t.is(await inputReader.peek(2), 'd');
	t.is(await inputReader.peek(3), 'e');
	t.is(await inputReader.peek(4), 'f');
	t.is(await inputReader.peek(5), 'g');
	t.is(await inputReader.peek(6), 'h');
	t.is(await inputReader.peek(7), undefined);

	inputReader.skip(6);

	t.is(await inputReader.peek(0), 'h');
	t.is(await inputReader.peek(1), undefined);

	inputReader.skip(1);

	t.is(await inputReader.peek(0), undefined);

	inputReader.skip(0);

	t.is(await inputReader.peek(0), undefined);

	inputReader.skip(1);

	t.is(await inputReader.peek(0), undefined);
});
