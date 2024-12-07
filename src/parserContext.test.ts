import test from 'ava';
import { ParserContextImplementation } from './parserContext.js';
import { stringInputCompanion } from './inputCompanion.js';
import { InputReaderImplementation } from './inputReader.js';
import { ParserUnexpectedEndOfInputError } from './parserError.js';

const commonParserContextArguments = [
	undefined,
	{
		debugName: 'root',
		errorJoinMode: 'all',
	},
] as const;

test('parserContext.read', async t => {
	const parserContext = new ParserContextImplementation(stringInputCompanion, new InputReaderImplementation(stringInputCompanion, (async function * () {
		yield '';
		yield 'abc';
		yield 'def';
		yield '';
		yield 'gh';
	})()), ...commonParserContextArguments);

	t.is(await parserContext.read(0), 'a');
	t.is(await parserContext.read(0), 'b');
	t.is(await parserContext.read(5), 'h');

	await t.throwsAsync(async () => parserContext.read(0), {
		instanceOf: ParserUnexpectedEndOfInputError,
	});
});

test('parserContext.lookahead', async t => {
	const parserContext = new ParserContextImplementation(stringInputCompanion, new InputReaderImplementation(stringInputCompanion, (async function * () {
		yield * 'abcdefgh';
	})()), ...commonParserContextArguments);

	const lookaheadContext1 = parserContext.lookahead();
	const lookaheadContext2 = parserContext.lookahead();
	const lookaheadContext3 = parserContext.lookahead({
		sliceEnd: 3,
	});

	t.is(await lookaheadContext3.peek(2), 'c');
	t.is(await lookaheadContext3.peek(3), undefined);
	t.is(await lookaheadContext3.read(0), 'a');
	t.is(await lookaheadContext3.read(0), 'b');
	t.is(await lookaheadContext3.read(0), 'c');
	t.is(await lookaheadContext3.peek(0), undefined);

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
	})()), ...commonParserContextArguments);

	const lookaheadContext = parserContext.lookahead();

	t.is(await parserContext.peek(0), 'a');
	t.is(await lookaheadContext.peek(0), 'a');

	t.is(await lookaheadContext.read(0), 'a');
	t.is(await parserContext.peek(0), 'a');
	t.is(await lookaheadContext.peek(0), 'b');

	lookaheadContext.unlookahead();

	t.is(await lookaheadContext.read(0), 'b');
	t.is(await lookaheadContext.read(0), 'c');
});

test('parserContext.unlookahead while peeking', async t => {
	const parserContext = new ParserContextImplementation(stringInputCompanion, new InputReaderImplementation(stringInputCompanion, (async function * () {
		yield * 'abcdefgh';
	})()), ...commonParserContextArguments);

	const lookaheadContext = parserContext.lookahead();

	parserContext.skip(1);
	lookaheadContext.skip(2);

	const peekPromise = lookaheadContext.peek(0);

	lookaheadContext.unlookahead();

	t.is(await peekPromise, 'c');
});

test('parserContext deep unlookahead normal order', async t => {
	const parserContext = new ParserContextImplementation(stringInputCompanion, new InputReaderImplementation(stringInputCompanion, (async function * () {
		yield * 'abcdefgh';
	})()), ...commonParserContextArguments);

	const child = parserContext.lookahead();

	t.is(await child.read(0), 'a');

	const grandchild = child.lookahead();

	t.is(await grandchild.read(0), 'b');

	grandchild.unlookahead();

	t.is(await child.read(0), 'c');

	child.unlookahead();

	t.is(await parserContext.read(0), 'd');
});

test('parserContext deep unlookahead weird order', async t => {
	const parserContext = new ParserContextImplementation(stringInputCompanion, new InputReaderImplementation(stringInputCompanion, (async function * () {
		yield * 'abcdefgh';
	})()), ...commonParserContextArguments);

	const child = parserContext.lookahead({
		debugName: 'child',
	});
	const grandchild = child.lookahead({
		debugName: 'grandchild',
	});
	const greatGrandchild = grandchild.lookahead({
		debugName: 'greatGrandchild',
	});

	t.is(await greatGrandchild.read(0), 'a');

	grandchild.unlookahead();

	child.unlookahead();

	greatGrandchild.unlookahead();

	t.is(await greatGrandchild.read(0), 'b');
	t.is(await grandchild.read(0), 'c');
	t.is(await child.read(0), 'd');
	t.is(await parserContext.read(0), 'e');
});
