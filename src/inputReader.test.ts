import test from 'ava';
import { InputReaderImplementation } from './inputReader.js';
import { stringParserInputCompanion } from './parserInputCompanion.js';
import { ParserImplementationError } from './parserError.js';
import { toAsyncIterable } from './toAsyncIterable.js';
import { InputReaderState } from './inputReaderState.js';

test('inputReader', async t => {
	const inputReader = new InputReaderImplementation(stringParserInputCompanion, (async function * () {
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

test('inputReader peekSequence', async t => {
	const inputReader = new InputReaderImplementation(stringParserInputCompanion, (async function * () {
		yield '';
		yield 'abc';
		yield 'def';
		yield '';
		yield 'gh';
	})());

	t.is(await inputReader.peekSequence(0, 0), '');
	t.is(await inputReader.peekSequence(0, 1), 'a');

	inputReader.skip(0);

	t.is(await inputReader.peekSequence(1, 2), 'b');

	inputReader.skip(1);

	t.is(await inputReader.peekSequence(1, 7), 'bcdefgh'.slice(1, 7));
	t.is(await inputReader.peekSequence(1, 8), undefined);

	inputReader.skip(6);

	t.is(await inputReader.peekSequence(0, 0), '');
	t.is(await inputReader.peekSequence(0, 1), 'h');
	t.is(await inputReader.peekSequence(1, 2), undefined);
	t.is(await inputReader.peekSequence(2, 2), undefined);

	inputReader.skip(1);

	t.is(await inputReader.peekSequence(0, 0), '');
	t.is(await inputReader.peekSequence(0, 1), undefined);
	t.is(await inputReader.peekSequence(1, 1), undefined);

	inputReader.skip(0);

	t.is(await inputReader.peekSequence(0, 0), '');
	t.is(await inputReader.peekSequence(0, 1), undefined);
	t.is(await inputReader.peekSequence(1, 1), undefined);

	inputReader.skip(1);

	t.is(await inputReader.peekSequence(0, 0), undefined);
	t.is(await inputReader.peekSequence(0, 1), undefined);
	t.is(await inputReader.peekSequence(1, 1), undefined);
});

test('inputReader.peek concurrent', async t => {
	const inputReader = new InputReaderImplementation(stringParserInputCompanion, (async function * () {
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

	t.deepEqual(peeks, [ 'a', 'a', 'a', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h' ]);
});

test('inputReader.peekSequence concurrent', async t => {
	const inputReader = new InputReaderImplementation(stringParserInputCompanion, (async function * () {
		yield * 'abcdefgh';
	})());

	const peeks = await Promise.all([1, 2, 3].flatMap(length => [
		inputReader.peekSequence(0, 0 + length),
		inputReader.peekSequence(0, 0 + length),
		inputReader.peekSequence(0, 0 + length),
		inputReader.peekSequence(0, 0 + length),
		inputReader.peekSequence(1, 1 + length),
		inputReader.peekSequence(2, 2 + length),
		inputReader.peekSequence(3, 3 + length),
		inputReader.peekSequence(4, 4 + length),
		inputReader.peekSequence(5, 5 + length),
		inputReader.peekSequence(6, 6 + length),
		inputReader.peekSequence(7, 7 + length),
	]));

	t.deepEqual(peeks, [
		'a',
		'a',
		'a',
		'a',
		'b',
		'c',
		'd',
		'e',
		'f',
		'g',
		'h',

		'ab',
		'ab',
		'ab',
		'ab',
		'bc',
		'cd',
		'de',
		'ef',
		'fg',
		'gh',
		undefined,

		'abc',
		'abc',
		'abc',
		'abc',
		'bcd',
		'cde',
		'def',
		'efg',
		'fgh',
		undefined,
		undefined,
	]);
});

test('inputReader skip while peeking', async t => {
	const inputReader = new InputReaderImplementation(stringParserInputCompanion, (async function * () {
		yield * 'abcdefgh';
	})());

	const peekPromise = inputReader.peek(0);

	inputReader.skip(1);

	const peekAfterSkipPromise = inputReader.peek(0);
	const peekSequenceAfterSkipPromise = inputReader.peekSequence(0, 5);

	t.is(await peekPromise, 'a');
	t.is(await inputReader.peek(0), 'b');

	t.is(await peekAfterSkipPromise, 'b');
	t.is(await peekSequenceAfterSkipPromise, 'bcdef');
});

test('inputReader skip while peeking sequence', async t => {
	const inputReader = new InputReaderImplementation(stringParserInputCompanion, (async function * () {
		yield * 'abcdefgh';
	})());

	const peekPromise = inputReader.peekSequence(1, 5);

	inputReader.skip(1);

	const peekAfterSkipPromise = inputReader.peek(0);
	const peekSequenceAfterSkipPromise = inputReader.peekSequence(0, 4);

	t.is(await peekPromise, 'bcde', 'peekPromise');
	t.is(await inputReader.peekSequence(0, 4), 'bcde', 'inputReader.peekSequence(0, 4)');

	t.is(await peekAfterSkipPromise, 'b', 'peekAfterSkipPromise');
	t.is(await peekSequenceAfterSkipPromise, 'bcde', 'peekSequenceAfterSkipPromise');
});

test('inputReader.lookahead', async t => {
	let read = 0;

	const inputReader = new InputReaderImplementation(stringParserInputCompanion, (async function * () {
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

	await t.throwsAsync(async () => lookahead0a.peek(0), {
		instanceOf: ParserImplementationError,
	});
	await t.throwsAsync(async () => lookahead0b.peek(0));
	await t.throwsAsync(async () => lookahead0c.peek(0));

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

	await t.throwsAsync(async () => lookahead0a.peek(0));
	await t.throwsAsync(async () => lookahead0b.peek(0));
	await t.throwsAsync(async () => lookahead0c.peek(0));
	t.is(await lookahead1a.peek(0), 'c');
	await t.throwsAsync(async () => lookahead1b.peek(0));
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

	const inputReader = new InputReaderImplementation(stringParserInputCompanion, (async function * () {
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

	t.deepEqual(peeks, [ 'a', 'a', 'a' ]);
	t.deepEqual(positions, [ 0, 0, 0 ]);
	t.is(read, 1);
});

test('inputReader.lookahead skip position', async t => {
	let read = 0;

	const inputReader = new InputReaderImplementation(stringParserInputCompanion, (async function * () {
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

const END_OF_CONSUMED_SEQUENCES = Symbol('END_OF_CONSUMED_SEQUENCES');
const END_OF_BUFFERED_SEQUENCES = Symbol('END_OF_BUFFERED_SEQUENCES');

async function inputReaderStateToArray<Sequence>({
	unconsumedBufferedSequences,
	consumedBufferedSequences,
	unbufferedSequences,
}: InputReaderState<Sequence>): Promise<(Sequence | typeof END_OF_CONSUMED_SEQUENCES | typeof END_OF_BUFFERED_SEQUENCES)[]> {
	const unconsumedBufferedSequencesArray = unconsumedBufferedSequences.slice();
	const consumedBufferedSequencesArray = consumedBufferedSequences.slice();

	const unbufferedSequencesArray = [];
	if (unbufferedSequences) {
		for await (const sequence of toAsyncIterable(unbufferedSequences)) {
			unbufferedSequencesArray.push(sequence);
		}
	}

	return [
		...consumedBufferedSequencesArray,
		END_OF_CONSUMED_SEQUENCES,
		...unconsumedBufferedSequencesArray,
		END_OF_BUFFERED_SEQUENCES,
		...unbufferedSequencesArray,
	];
}

const inputReaderStateMacro = test.macro({
	title: (providedTitle, input: readonly string[], position: number) =>
		providedTitle ?? `inputReader.toInputReaderState ${JSON.stringify({ input, position })}`,
	async exec(t, input: readonly string[], position: number, expected: readonly (string | symbol)[]) {
		const inputReader = new InputReaderImplementation(stringParserInputCompanion, (async function * () {
			yield * input;
		})());

		inputReader.skip(position);
		await inputReader.peek(0);

		const actual = await inputReaderStateToArray(inputReader.toInputReaderState());

		t.deepEqual(actual, expected);
	},
});

test(inputReaderStateMacro, [ '', 'abc', 'def', '', 'gh' ], 0, [ END_OF_CONSUMED_SEQUENCES, 'abc', END_OF_BUFFERED_SEQUENCES, 'def', '', 'gh' ]);
test(inputReaderStateMacro, [ '', 'abc', 'def', '', 'gh' ], 1, [ 'a', END_OF_CONSUMED_SEQUENCES, 'bc', END_OF_BUFFERED_SEQUENCES, 'def', '', 'gh' ]);
test(inputReaderStateMacro, [ '', 'abc', 'def', '', 'gh' ], 2, [ 'ab', END_OF_CONSUMED_SEQUENCES, 'c', END_OF_BUFFERED_SEQUENCES, 'def', '', 'gh' ]);
test(inputReaderStateMacro, [ '', 'abc', 'def', '', 'gh' ], 3, [ END_OF_CONSUMED_SEQUENCES, 'def', END_OF_BUFFERED_SEQUENCES, '', 'gh' ]);
test(inputReaderStateMacro, [ '', 'abc', 'def', '', 'gh' ], 4, [ 'd', END_OF_CONSUMED_SEQUENCES, 'ef', END_OF_BUFFERED_SEQUENCES, '', 'gh' ]);
test(inputReaderStateMacro, [ '', 'abc', 'def', '', 'gh' ], 8, [ END_OF_CONSUMED_SEQUENCES, END_OF_BUFFERED_SEQUENCES ]);
