import test from 'ava';
import { createArrayParser } from './arrayParser.js';
import { createElementParser } from './elementParser.js';
import { createTupleParser } from './tupleParser.js';
import { createSliceBoundedParser } from './sliceBoundedParser.js';
import { runParser, runParserWithRemainingInput } from './parser.js';
import { stringParserInputCompanion } from './parserInputCompanion.js';
import { createExactElementParser } from './exactElementParser.js';
import { stringFromAsyncIterable } from './stringFromAsyncIterable.js';

const anythingParser = createArrayParser(createElementParser<string>());

test('sliceBoundedParser', async t => {
	const parser = createTupleParser([
		createElementParser<string>(),
		createSliceBoundedParser(anythingParser, 2),
		createElementParser(),
	]);

	const result = await runParser(parser, 'abba', stringParserInputCompanion);

	t.deepEqual(result, [
		'a',
		[
			'b',
			'b',
		],
		'a',
	]);
});

test('sliceBoundedParser mustConsumeAll: true fail to cosume all', async t => {
	const parser = createTupleParser([
		createElementParser<string>(),
		createSliceBoundedParser(createArrayParser(createExactElementParser<string>('b')), 2),
		createElementParser(),
	]);

	await t.throwsAsync(async () => runParser(parser, 'abcd', stringParserInputCompanion), {
		any: true,
		message: /child parser must consume all input in the slice/,
	});
});

test('sliceBoundedParser mustConsumeAll: false', async t => {
	const parser = createTupleParser([
		createElementParser<string>(),
		createSliceBoundedParser(createArrayParser(createExactElementParser<string>('b')), 2, false),
		createElementParser(),
	]);

	const { output, remainingInput } = await runParserWithRemainingInput(parser, 'abcd', stringParserInputCompanion);

	t.deepEqual(output, [
		'a',
		[
			'b',
		],
		'c',
	]);
	t.is(await stringFromAsyncIterable(remainingInput!), 'd');
});
