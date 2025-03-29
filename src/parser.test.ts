import test from 'ava';
import invariant from 'invariant';
import { createUnionParser } from './unionParser.js';
import { type Parser, runParser, runParserWithRemainingInput } from './parser.js';
import { stringParserInputCompanion, uint8ArrayParserInputCompanion } from './parserInputCompanion.js';
import {
	ParserError,
	ParserParsingInvariantError,
	ParserParsingJoinAllError,
	ParserParsingJoinDeepestError,
	ParserParsingJoinError,
	ParserParsingJoinFurthestError,
	ParserParsingJoinNoneError,
	ParserUnexpectedRemainingInputError,
} from './parserError.js';
import { createTupleParser } from './tupleParser.js';
import { promiseCompose } from './promiseCompose.js';
import { createDisjunctionParser } from './disjunctionParser.js';
import { createExactSequenceNaiveParser } from './exactSequenceParser.js';
import { createArrayParser } from './arrayParser.js';
import { createElementParser } from './elementParser.js';
import { toAsyncIterable } from './toAsyncIterable.js';

const aUnionParser = createUnionParser<string, string>([
	createExactSequenceNaiveParser('1'),
	createExactSequenceNaiveParser('aa'),
	createExactSequenceNaiveParser('AAA'),
]);

const abDisjunctionParser = createDisjunctionParser<string, string>([
	aUnionParser,
	createExactSequenceNaiveParser('2'),
	createExactSequenceNaiveParser('bb'),
	createExactSequenceNaiveParser('BBB'),
]);

const abcUnionParser = createUnionParser<string, string>([
	abDisjunctionParser,
	createExactSequenceNaiveParser('final_3'),
	createExactSequenceNaiveParser('final_cc'),
	createExactSequenceNaiveParser('final_CCC'),
]);

const sampleParser = promiseCompose(
	createTupleParser<string, string, string, string>([
		aUnionParser,
		abDisjunctionParser,
		abcUnionParser,
	]),
	strings => strings.join(''),
);

async function * asyncIteratorFromString(string: string) {
	yield string;
}

async function stringFromAsyncIterable(asyncIterable: AsyncIterable<string>) {
	let string = '';

	for await (const chunk of asyncIterable) {
		string += chunk;
	}

	return string;
}

function sortChildErrors(error: ParserParsingJoinNoneError) {
	error.childErrors.sort((a, b) => a.message.localeCompare(b.message));

	for (const childError of error.childErrors) {
		if (childError instanceof ParserParsingJoinError) {
			sortChildErrors(childError);
		}
	}
}

function removeStackLocations(errorStack: string) {
	return errorStack.replaceAll(/((at [^\n]+)[\s\n]+)+(at [^\n]+)/g, 'at [LOCATIONS]');
}

test('errorJoinMode: none', async t => {
	const error = await t.throwsAsync(runParser(sampleParser, asyncIteratorFromString('1bbfinal_CC!'), stringParserInputCompanion, {
		errorJoinMode: 'none',
	}), {
		instanceOf: ParserParsingJoinNoneError,
	});

	t.is(error.position, 12);
	t.deepEqual(error.childErrors, []);

	t.snapshot(removeStackLocations(error.stack!));
});

test('errorJoinMode: all', async t => {
	const error = await t.throwsAsync(runParser(sampleParser, asyncIteratorFromString('1bbfinal_CC!'), stringParserInputCompanion, {
		errorJoinMode: 'all',
	}), {
		instanceOf: ParserParsingJoinAllError,
	});

	sortChildErrors(error);

	t.snapshot(removeStackLocations(error.stack!));

	t.is(error.position, 12, 'error.position');
	t.is(error.childErrors.length, 4);

	const error1 = error.childErrors.at(-1)!;

	invariant(error1 instanceof ParserParsingJoinAllError, 'error1 instanceof ParserParsingJoinAllError');

	t.is(error1.position, 3, 'error1.position');
	t.is(error1.childErrors.length, 4);

	const error2 = error1.childErrors.at(-1)!;

	invariant(error2 instanceof ParserParsingJoinAllError, 'error2 instanceof ParserParsingJoinAllError');

	t.is(error2.position, 4, 'error2.position');
	t.is(error2.childErrors.length, 3);

	const error3 = error2.childErrors.at(-1)!;

	invariant(error3 instanceof ParserParsingInvariantError, 'error3 instanceof ParserParsingInvariantError');

	t.is(error3.position, 4, 'error3.position');
});

test('errorJoinMode: deepest', async t => {
	const error = await t.throwsAsync(runParser(sampleParser, asyncIteratorFromString('1bbfinal_CC!'), stringParserInputCompanion, {
		errorJoinMode: 'deepest',
	}), {
		instanceOf: ParserParsingJoinDeepestError,
	});

	sortChildErrors(error);

	t.snapshot(removeStackLocations(error.stack!));

	t.is(error.position, 12);
	t.is(error.childErrors.length, 1);

	const error1 = error.childErrors.at(-1)!;

	invariant(error1 instanceof ParserParsingJoinDeepestError, 'error1 instanceof ParserParsingJoinDeepestError');

	t.is(error1.position, 3);
	t.is(error1.childErrors.length, 1);

	const error2 = error1.childErrors.at(-1)!;

	invariant(error2 instanceof ParserParsingJoinDeepestError, 'error2 instanceof ParserParsingJoinDeepestError');

	t.is(error2.position, 4);
	t.is(error2.childErrors.length, 3);

	const error3 = error2.childErrors.at(-1)!;

	invariant(error3 instanceof ParserParsingInvariantError, 'error3 instanceof ParserParsingInvariantError');

	t.is(error3.position, 4);
});

test('errorJoinMode: furthest', async t => {
	const error = await t.throwsAsync(runParser(sampleParser, asyncIteratorFromString('1bbfinal_CC!'), stringParserInputCompanion, {
		errorJoinMode: 'furthest',
	}), {
		instanceOf: ParserParsingJoinFurthestError,
	});

	sortChildErrors(error);

	t.snapshot(removeStackLocations(error.stack!));

	t.is(error.position, 12);
	t.is(error.childErrors.length, 1);

	const error1 = error.childErrors.at(-1)!;

	invariant(error1 instanceof ParserParsingInvariantError, 'error1 instanceof ParserParsingInvariantError');

	t.is(error1.position, 12);
});

test('throws on parserInputCompanion type mismatch', async t => {
	const anythingParser: Parser<any, any> = createArrayParser(createElementParser());

	await runParser(anythingParser, asyncIteratorFromString('anything'), stringParserInputCompanion);
	await runParser(anythingParser, 'anything', stringParserInputCompanion);
	await runParser(anythingParser, Buffer.from('anything'), uint8ArrayParserInputCompanion);
	await runParser(anythingParser, new Uint8Array([ 1, 2, 3 ]), uint8ArrayParserInputCompanion);

	await t.throwsAsync(runParser(anythingParser, asyncIteratorFromString('anything'), uint8ArrayParserInputCompanion), {
		message: /input companion/,
	});
});

test('thrown error has input reader state', async t => {
	const error = await t.throwsAsync(
		runParser(
			createTupleParser([
				createExactSequenceNaiveParser('foo'),
				createExactSequenceNaiveParser('bar'),
			]),
			(async function * () {
				yield 'foo';
				yield 'qux';
				yield 'bar';
			})(),
			stringParserInputCompanion,
		),
		{
			instanceOf: ParserError,
		},
	);

	t.is(error.position, 4);

	invariant(error.inputReaderSate, 'error.inputReaderSate');

	const {
		consumedBufferedSequences,
		unconsumedBufferedSequences,
		unbufferedSequences,
		position,
		...inputReaderStateRest
	} = error.inputReaderSate;

	t.is(position, 4);
	t.deepEqual(inputReaderStateRest, {});

	const unbufferedSequencesArray = [];

	if (unbufferedSequences) {
		for await (const sequence of toAsyncIterable(unbufferedSequences)) {
			unbufferedSequencesArray.push(sequence);
		}
	}

	t.deepEqual(consumedBufferedSequences, [ 'q' ]);
	t.deepEqual(unconsumedBufferedSequences, [ 'ux' ]);
	t.deepEqual(unbufferedSequencesArray, [ 'bar' ]);
});

test('runParser throws with remaining input', async t => {
	const parser: Parser<string, string> = createExactSequenceNaiveParser('foo');
	const error = await t.throwsAsync(() => runParser(parser, 'foobar', stringParserInputCompanion), {
		instanceOf: ParserUnexpectedRemainingInputError,
		message: /remaining input/,
	});

	t.is(error.position, 3);

	const {
		position,
		consumedBufferedSequences,
		unconsumedBufferedSequences,
		unbufferedSequences,
		...inputReaderStateRest
	} = error.inputReaderSate!;

	t.deepEqual(inputReaderStateRest, {});
	t.is(position, 3);
	t.deepEqual(consumedBufferedSequences, [ 'foo' ]);
	t.deepEqual(unconsumedBufferedSequences, [ 'bar' ]);
	t.truthy(unbufferedSequences);
});

test('runParser does not throw without remaining input', async t => {
	const parser: Parser<string, string> = createExactSequenceNaiveParser('foo');
	const output = await runParser(parser, 'foo', stringParserInputCompanion);

	t.deepEqual(output, 'foo');
});

test('runParserWithRemainingInput with remaining input', async t => {
	const parser: Parser<string, string> = createExactSequenceNaiveParser('foo');
	const {
		output,
		remainingInput,
		position,
		...resultRest
	} = await runParserWithRemainingInput(parser, 'foobar', stringParserInputCompanion);

	t.deepEqual(resultRest, {});
	t.deepEqual(output, 'foo');
	t.deepEqual(await stringFromAsyncIterable(remainingInput!), 'bar');
	t.is(position, 3);
});

test('runParserWithRemainingInput without remaining input', async t => {
	const parser: Parser<string, string> = createExactSequenceNaiveParser('foo');
	const { output, remainingInput } = await runParserWithRemainingInput(parser, 'foo', stringParserInputCompanion);

	t.deepEqual(output, 'foo');
	t.is(remainingInput, undefined);
});
