import test from 'ava';
import {
	runParser,
	createExactSequenceParser,
	createTupleParser,
	stringParserInputCompanion,
} from './index.js';

test('exports main parser functions', async t => {
	// Test that runParser is exported and works
	const parser = createExactSequenceParser('hello');
	const result = await runParser(parser, 'hello', stringParserInputCompanion);
	t.is(result, 'hello');
});

test('exports parser combinators', async t => {
	// Test that createTupleParser is exported and works
	const tupleParser = createTupleParser([
		createExactSequenceParser('a'),
		createExactSequenceParser('b'),
	]);
	const result = await runParser(tupleParser, 'ab', stringParserInputCompanion);
	t.deepEqual(result, [ 'a', 'b' ]);
});
