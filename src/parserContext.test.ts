import test from 'ava';
import { ParserContextImplementation } from './parserContext.js';
import { stringInputCompanion } from './inputCompanion.js';
import { InputReaderImplementation } from './inputReader.js';
import { ParserUnexpectedEndOfInputError } from './parserError.js';

test('parserContext.read', async t => {
	const parserContext = new ParserContextImplementation(stringInputCompanion, new InputReaderImplementation(stringInputCompanion, (async function * () {
		yield '';
		yield 'abc';
		yield 'def';
		yield '';
		yield 'gh';
	})()));

	t.is(await parserContext.read(0), 'a');
	t.is(await parserContext.read(0), 'b');
	t.is(await parserContext.read(5), 'h');

	await t.throwsAsync(() => parserContext.read(0), {
		instanceOf: ParserUnexpectedEndOfInputError,
	});
});

test('parserContext.lookahead', async t => {
	const parserContext = new ParserContextImplementation(stringInputCompanion, new InputReaderImplementation(stringInputCompanion, (async function * () {
		yield * 'abcdefgh';
	})()));

	const lookaheadContext1 = parserContext.lookahead();
	const lookaheadContext2 = parserContext.lookahead();

	t.is(await parserContext.peek(0), 'a');
	t.is(await lookaheadContext1.peek(0), 'a');
	t.is(await lookaheadContext2.peek(0), 'a');

	t.is(await lookaheadContext1.read(0), 'a');
	t.is(await parserContext.peek(0), 'a');
	t.is(await lookaheadContext1.peek(0), 'b');
	t.is(await lookaheadContext2.peek(0), 'a');

	t.is(await parserContext.read(0), 'a');
});

test('parserContext.unlookahead', async t => {
	const parserContext = new ParserContextImplementation(stringInputCompanion, new InputReaderImplementation(stringInputCompanion, (async function * () {
		yield * 'abcdefgh';
	})()));

	const lookaheadContext = parserContext.lookahead();

	t.is(await parserContext.peek(0), 'a');
	t.is(await lookaheadContext.peek(0), 'a');

	t.is(await lookaheadContext.read(0), 'a');
	t.is(await parserContext.peek(0), 'a');
	t.is(await lookaheadContext.peek(0), 'b');

	lookaheadContext.unlookahead(parserContext);

	t.is(await lookaheadContext.read(0), 'b');
	t.is(await lookaheadContext.read(0), 'c');
});

test('parserContext.unlookahead while peeking', async t => {
	const parserContext = new ParserContextImplementation(stringInputCompanion, new InputReaderImplementation(stringInputCompanion, (async function * () {
		yield * 'abcdefgh';
	})()));

	const lookaheadContext = parserContext.lookahead();

	parserContext.skip(1);
	lookaheadContext.skip(2);

	const peekPromise = lookaheadContext.peek(0);

	lookaheadContext.unlookahead(parserContext);

	t.is(await peekPromise, 'c');
});
