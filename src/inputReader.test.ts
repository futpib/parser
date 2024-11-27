import test from 'ava';
import { InputReaderImplementation } from './inputReader.js';
import { stringInputCompanion } from './inputCompanion.js';
import { ParserImplementationError } from './parserError.js';

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

test('inputReader.peek concurrent', async t => {
	const inputReader = new InputReaderImplementation(stringInputCompanion, (async function * () {
		yield * 'abcdefgh';
	})());

	const peeks = await Promise.all([
		inputReader.peek(0),
		inputReader.peek(0),
		inputReader.peek(0),
		inputReader.peek(0),
		inputReader.peek(1),
		inputReader.peek(2),
		inputReader.peek(3),
		inputReader.peek(4),
		inputReader.peek(5),
		inputReader.peek(6),
		inputReader.peek(7),
	]);

	t.deepEqual(peeks, ['a', 'a', 'a', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
});

test('inputReader skip while peeking', async t => {
	const inputReader = new InputReaderImplementation(stringInputCompanion, (async function * () {
		yield * 'abcdefgh';
	})());

	const peekPromise = inputReader.peek(0);

	inputReader.skip(1);

	t.is(await peekPromise, 'a');
	t.is(await inputReader.peek(0), 'b');
});

test('inputReader.lookahead', async t => {
	let read = 0;

	const inputReader = new InputReaderImplementation(stringInputCompanion, (async function * () {
		for (const character of 'abcdefgh') {
			read++;
			yield character;
		}
	})());

	const lookahead0a = inputReader.lookahead();
	const lookahead0b = lookahead0a.lookahead();
	const lookahead0c = lookahead0b.lookahead();

	t.is(await inputReader.peek(0), 'a');
	t.is(await lookahead0a.peek(0), 'a');
	t.is(await lookahead0b.peek(0), 'a');
	t.is(await lookahead0c.peek(0), 'a');

	t.is(inputReader.position, 0);
	t.is(lookahead0a.position, 0);
	t.is(lookahead0b.position, 0);
	t.is(lookahead0c.position, 0);

	t.is(read, 1);

	t.is(await lookahead0b.peek(1), 'b');
	t.is(await inputReader.peek(0), 'a');

	t.is(read, 2);

	inputReader.skip(1);

	await t.throwsAsync(() => lookahead0a.peek(0), {
		instanceOf: ParserImplementationError,
	});
	await t.throwsAsync(() => lookahead0b.peek(0));
	await t.throwsAsync(() => lookahead0c.peek(0));

	const lookahead1a = inputReader.lookahead();
	const lookahead1b = inputReader.lookahead();

	t.is(await lookahead1a.peek(0), 'b');
	t.is(await lookahead1b.peek(0), 'b');

	t.is(lookahead1a.position, 1);
	t.is(lookahead1b.position, 1);

	lookahead1a.skip(1);

	t.is(await lookahead1a.peek(0), 'c');
	t.is(await lookahead1b.peek(0), 'b');

	t.is(lookahead1a.position, 2);
	t.is(lookahead1b.position, 1);

	const lookahead2a = lookahead1a.lookahead();
	const lookahead2b = lookahead1a.lookahead();

	lookahead2a.skip(1);

	t.is(await lookahead2a.peek(0), 'd');
	t.is(await lookahead2b.peek(0), 'c');

	t.is(lookahead2a.position, 3);
	t.is(lookahead2b.position, 2);

	t.is(read, 4);

	t.is(await inputReader.peek(0), 'b');

	t.is(inputReader.position, 1);

	inputReader.skip(1);

	t.is(await inputReader.peek(0), 'c');

	t.is(inputReader.position, 2);

	await t.throwsAsync(() => lookahead0a.peek(0));
	await t.throwsAsync(() => lookahead0b.peek(0));
	await t.throwsAsync(() => lookahead0c.peek(0));
	t.is(await lookahead1a.peek(0), 'c');
	await t.throwsAsync(() => lookahead1b.peek(0));
	t.is(await lookahead2a.peek(0), 'd');
	t.is(await lookahead2b.peek(0), 'c');

	t.is(lookahead0a.position, 0);
	t.is(lookahead0b.position, 0);
	t.is(lookahead0c.position, 0);
	t.is(lookahead1a.position, 2);
	t.is(lookahead1b.position, 1);
	t.is(lookahead2a.position, 3);
	t.is(lookahead2b.position, 2);
});

test('inputReader.lookahead concurrent', async t => {
	let read = 0;

	const inputReader = new InputReaderImplementation(stringInputCompanion, (async function * () {
		for (const character of 'abcdefgh') {
			read++;
			yield character;
		}
	})());

	const lookahead1 = inputReader.lookahead();
	const lookahead2 = inputReader.lookahead();
	const lookahead3 = inputReader.lookahead();

	const peeks = await Promise.all([
		lookahead1.peek(0),
		lookahead2.peek(0),
		lookahead3.peek(0),
	]);

	const positions = [
		lookahead1.position,
		lookahead2.position,
		lookahead3.position,
	];

	t.deepEqual(peeks, ['a', 'a', 'a']);
	t.deepEqual(positions, [0, 0, 0]);
	t.is(read, 1);
});

test('inputReader.lookahead skip position', async t => {
	let read = 0;

	const inputReader = new InputReaderImplementation(stringInputCompanion, (async function * () {
		for (const character of 'abcdefgh') {
			read++;
			yield character;
		}
	})());

	inputReader.skip(1);

	const lookahead = inputReader.lookahead();

	lookahead.skip(1);

	const lookahead1 = lookahead.lookahead();

	lookahead1.skip(1);

	t.is(inputReader.position, 1);
	t.is(lookahead.position, 2);
	t.is(lookahead1.position, 3);

	t.is(await inputReader.peek(0), 'b');
	t.is(await lookahead.peek(0), 'c');
	t.is(await lookahead1.peek(0), 'd');
});
