import test from 'ava';
import invariant from 'invariant';
import { createUnionParser } from './unionParser.js';
import { type Parser, runParser, runParserWithRemainingInput } from './parser.js';
import { stringParserInputCompanion, uint8ArrayParserInputCompanion } from './parserInputCompanion.js';
import {
    isParserParsingJoinError,
    normalParserErrorModule,
	ParserError,
	ParserParsingFailedError,
	ParserParsingJoinError,
} from './parserError.js';
import { createTupleParser } from './tupleParser.js';
import { promiseCompose } from './promiseCompose.js';
import { createDisjunctionParser } from './disjunctionParser.js';
import { createExactSequenceNaiveParser } from './exactSequenceParser.js';
import { createArrayParser } from './arrayParser.js';
import { createElementParser } from './elementParser.js';
import { toAsyncIterable } from './toAsyncIterable.js';
import { stringFromAsyncIterable } from './stringFromAsyncIterable.js';
import { createLookaheadParser } from './lookaheadParser.js';
import { createNegativeLookaheadParser } from './negativeLookaheadParser.js';

const aUnionParser = createUnionParser([
	createExactSequenceNaiveParser('1'),
	createExactSequenceNaiveParser('aa'),
	createExactSequenceNaiveParser('AAA'),
]);

const abDisjunctionParser = createDisjunctionParser([
	aUnionParser,
	createExactSequenceNaiveParser('2'),
	createExactSequenceNaiveParser('bb'),
	createExactSequenceNaiveParser('BBB'),
]);

const abcUnionParser = createUnionParser([
	abDisjunctionParser,
	createExactSequenceNaiveParser('final_3'),
	createExactSequenceNaiveParser('final_cc'),
	createExactSequenceNaiveParser('final_CCC'),
]);

const sampleParser = promiseCompose(
	createTupleParser([
		aUnionParser,
		abDisjunctionParser,
		abcUnionParser,
	]),
	strings => strings.join(''),
);

async function * asyncIteratorFromString(string: string) {
	yield string;
}

function sortChildErrors(error: ParserParsingJoinError) {
	error.childErrors.sort((a, b) => a.message.localeCompare(b.message));

	for (const childError of error.childErrors) {
		if (isParserParsingJoinError(childError)) {
			sortChildErrors(childError);
		}
	}
}

function removeStackLocations(errorStack: string | undefined) {
	return errorStack?.replaceAll(/((at [^\n]+)[\s\n]+)+(at [^\n]+)/g, 'at [LOCATIONS]');
}

test('errorJoinMode: none', async t => {
	const error = await t.throwsAsync(runParser(sampleParser, asyncIteratorFromString('1bbfinal_CC!'), stringParserInputCompanion, {
		errorJoinMode: 'none',
		errorStack: true,
	}), {
		instanceOf: normalParserErrorModule.ParserParsingJoinNoneError,
	});

	t.is(error.position, 12);
	t.deepEqual(error.childErrors, []);

	t.snapshot(removeStackLocations(error.stack));
});

test('errorJoinMode: all', async t => {
	const error = await t.throwsAsync(runParser(sampleParser, asyncIteratorFromString('1bbfinal_CC!'), stringParserInputCompanion, {
		errorJoinMode: 'all',
		errorStack: true,
	}), {
		instanceOf: normalParserErrorModule.ParserParsingJoinAllError,
	});

	sortChildErrors(error);

	t.snapshot(removeStackLocations(error.stack));

	t.is(error.position, 12, 'error.position');
	t.is(error.childErrors.length, 4);

	const error1 = error.childErrors.at(-1)!;

	invariant(isParserParsingJoinError(error1), 'error1 instanceof ParserParsingJoinAllError');

	t.is(error1.position, 3, 'error1.position');
	t.is(error1.childErrors.length, 4);

	const error2 = error1.childErrors.at(-1)!;

	invariant(isParserParsingJoinError(error2), 'error2 instanceof ParserParsingJoinAllError');

	t.is(error2.position, 4, 'error2.position');
	t.is(error2.childErrors.length, 3);

	const error3 = error2.childErrors.at(-1)!;

	invariant(error3.name === 'ParserParsingInvariantError', 'error3 instanceof ParserParsingInvariantError');

	t.is(error3.position, 4, 'error3.position');
});

test('errorJoinMode: deepest', async t => {
	const error = await t.throwsAsync(runParser(sampleParser, asyncIteratorFromString('1bbfinal_CC!'), stringParserInputCompanion, {
		errorJoinMode: 'deepest',
		errorStack: true,
	}), {
		instanceOf: normalParserErrorModule.ParserParsingJoinDeepestError,
	});

	sortChildErrors(error);

	t.snapshot(removeStackLocations(error.stack));

	t.is(error.position, 12);
	t.is(error.childErrors.length, 1);

	const error1 = error.childErrors.at(-1)!;

	invariant(isParserParsingJoinError(error1), 'error1 instanceof ParserParsingJoinDeepestError');

	t.is(error1.position, 3);
	t.is(error1.childErrors.length, 1);

	const error2 = error1.childErrors.at(-1)!;

	invariant(isParserParsingJoinError(error2), 'error2 instanceof ParserParsingJoinDeepestError');

	t.is(error2.position, 4);
	t.is(error2.childErrors.length, 3);

	const error3 = error2.childErrors.at(-1)!;

	invariant(error3.name === 'ParserParsingInvariantError', 'error3 instanceof ParserParsingInvariantError');

	t.is(error3.position, 4);
});

test('errorJoinMode: furthest', async t => {
	const error = await t.throwsAsync(runParser(sampleParser, asyncIteratorFromString('1bbfinal_CC!'), stringParserInputCompanion, {
		errorJoinMode: 'furthest',
		errorStack: true,
	}), {
		instanceOf: normalParserErrorModule.ParserParsingJoinFurthestError,
	});

	sortChildErrors(error);

	t.snapshot(removeStackLocations(error.stack));

	t.is(error.position, 12);
	t.is(error.childErrors.length, 1);

	const error1 = error.childErrors.at(-1)!;

	invariant(error1.name === 'ParserParsingInvariantError', 'error1 instanceof ParserParsingInvariantError');

	t.is(error1.position, 12);
});

test('errorStack: false', async t => {
	const error = await t.throwsAsync(runParser(sampleParser, 'nothing like what sampleParser expects', stringParserInputCompanion, {
		errorJoinMode: 'all',
	}), {
		instanceOf: normalParserErrorModule.ParserParsingJoinAllError,
	});

	t.regex(error.stack!, /intentionally left blank/);
	t.regex(error.stack!, /errorStack: true/);
});

test('errorStack: true', async t => {
	const error = await t.throwsAsync(runParser(sampleParser, 'nothing like what sampleParser expects', stringParserInputCompanion, {
		errorJoinMode: 'all',
		errorStack: true,
	}), {
		instanceOf: normalParserErrorModule.ParserParsingJoinAllError,
	});

	t.regex(error.stack!, /exactSequenceParser/);
});

test('errorJoinMode: none, errorStack: false', async t => {
	const error = await t.throwsAsync(runParser(sampleParser, asyncIteratorFromString('1bbfinal_CC!'), stringParserInputCompanion, {
		errorJoinMode: 'none',
		errorStack: false,
	}), {
		instanceOf: normalParserErrorModule.ParserParsingJoinNoneError,
	});

	t.is(error.position, 12);
	t.deepEqual(error.childErrors, []);

	t.snapshot(removeStackLocations(error.stack));
});

test('retrows normal errors untouched', async t => {
	class CustomError extends Error {};
	const originalCustomError1 = new CustomError('This is a custom error');
	const originalCustomError2 = new Error('This is a normal error');

	const error1 = await t.throwsAsync(runParser(() => {
		throw originalCustomError1;
	}, 'foo', stringParserInputCompanion), {
		instanceOf: CustomError,
	});

	t.is(error1, originalCustomError1);

	const error2 = await t.throwsAsync(runParser(() => {
		throw originalCustomError2;
	}, 'foo', stringParserInputCompanion), {
		instanceOf: Error,
	});

	t.is(error2, originalCustomError2);
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
			{
				errorStack: true,
			},
		),
		{
			instanceOf: normalParserErrorModule.ParserParsingInvariantError,
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
	const error = await t.throwsAsync(async () => runParser(parser, 'foobar', stringParserInputCompanion), {
		any: true,
		name: 'ParserUnexpectedRemainingInputError',
		message: /remaining input/,
	}) as ParserError;

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

	t.is(output, 'foo');
});

test('runParserWithRemainingInput with remaining input', async t => {
	const parser: Parser<string, string> = createExactSequenceNaiveParser('foo');
	const {
		output,
		remainingInput,
		position,
		furthestReadPosition,
		furthestPeekedPosition,
		...resultRest
	} = await runParserWithRemainingInput(parser, 'foobar', stringParserInputCompanion);

	t.deepEqual(resultRest, {});
	t.is(output, 'foo');
	t.is(await stringFromAsyncIterable(remainingInput!), 'bar');
	t.is(position, 3);
	t.is(furthestReadPosition, 3);
	t.is(furthestPeekedPosition, 3);
});

test('runParserWithRemainingInput without remaining input', async t => {
	const parser: Parser<string, string> = createExactSequenceNaiveParser('foo');
	const { output, remainingInput } = await runParserWithRemainingInput(parser, 'foo', stringParserInputCompanion);

	t.is(output, 'foo');
	t.is(remainingInput, undefined);
});

test('furthestReadPosition equals position when no backtracking', async t => {
	const parser: Parser<string, string> = createExactSequenceNaiveParser('foo');
	const result = await runParserWithRemainingInput(parser, 'foobar', stringParserInputCompanion);

	t.is(result.position, 3);
	t.is(result.furthestReadPosition, 3);
	t.is(result.furthestPeekedPosition, 3);
});

test('furthestReadPosition tracks lookahead that succeeded', async t => {
	// Parser: lookahead('foo') followed by 'foobar'
	// The lookahead parses 'foo' (position 3) but doesn't consume it
	// Then 'foobar' is parsed (position 6)
	const parser = createTupleParser([
		createLookaheadParser(createExactSequenceNaiveParser('foo')),
		createExactSequenceNaiveParser('foobar'),
	]);

	const result = await runParserWithRemainingInput(parser, 'foobar', stringParserInputCompanion);

	t.is(result.position, 6);
	t.is(result.furthestReadPosition, 6);
	t.is(result.furthestPeekedPosition, 6);
});

test('furthestReadPosition tracks failed lookahead with backtracking', async t => {
	// Parser: try 'foobar' OR 'foo'
	// First tries 'foobar', reads 'f','o','o','q' (position 4) then fails because 'q' != 'b'
	// Backtracks and tries 'foo', succeeds at position 3
	// furthestReadPosition should be 4 (from the failed 'foobar' attempt that read up to 'q')
	const parser = createDisjunctionParser([
		createExactSequenceNaiveParser('foobar'),
		createExactSequenceNaiveParser('foo'),
	]);

	const result = await runParserWithRemainingInput(parser, 'fooqux', stringParserInputCompanion);

	t.is(result.output, 'foo');
	t.is(result.position, 3);
	t.is(result.furthestReadPosition, 4);
	t.is(result.furthestPeekedPosition, 3);
});

test('furthestReadPosition exceeds position after backtracking from longer match', async t => {
	// Parser: try 'foobarqux' OR 'foo'
	// First tries 'foobarqux', reads up to position 6 ('foobar'), then fails
	// Backtracks and tries 'foo', succeeds at position 3
	// furthestReadPosition should be 6 (from the failed 'foobarqux' attempt)
	const parser = createDisjunctionParser([
		createExactSequenceNaiveParser('foobarqux'),
		createExactSequenceNaiveParser('foo'),
	]);

	const result = await runParserWithRemainingInput(parser, 'foobar', stringParserInputCompanion);

	t.is(result.output, 'foo');
	t.is(result.position, 3);
	t.is(result.furthestReadPosition, 6);
	t.is(result.furthestPeekedPosition, 6);
});

test('furthestPeekedPosition differs from furthestReadPosition with lookahead', async t => {
	// Parser: lookahead('foobar') then 'foo'
	// The lookahead parses 'foobar':
	// - Each read() calls peek(0) at positions 0,1,2,3,4,5 then skip(1) advancing to 1,2,3,4,5,6
	// - This updates furthestReadPosition to 6 and furthestPeekedPosition to 5
	// Then 'foo' is parsed from position 0, position becomes 3
	// furthestReadPosition=6 (from lookahead's skip calls)
	// furthestPeekedPosition=5 (from lookahead's peek calls at positions 0-5)
	const parser = createTupleParser([
		createLookaheadParser(createExactSequenceNaiveParser('foobar')),
		createExactSequenceNaiveParser('foo'),
	]);

	const result = await runParserWithRemainingInput(parser, 'foobar', stringParserInputCompanion);

	t.is(result.output[1], 'foo');
	t.is(result.position, 3);
	t.is(result.furthestReadPosition, 6);
	t.is(result.furthestPeekedPosition, 5);
});

test('error has furthestReadPosition after backtracking', async t => {
	// Parser: try 'foobarqux' OR 'foobaz'
	// Input: 'foobar'
	// First tries 'foobarqux', reads up to position 6 ('foobar'), then fails (no 'qux')
	// Then tries 'foobaz', reads up to position 4 ('foob'), then fails ('b' != 'z')
	// Both fail, error at position 0, but furthestReadPosition should be 6
	const parser = createDisjunctionParser([
		createExactSequenceNaiveParser('foobarqux'),
		createExactSequenceNaiveParser('foobaz'),
	]);

	const error = await t.throwsAsync(
		runParser(parser, 'foobar', stringParserInputCompanion, { errorStack: true }),
	) as ParserParsingFailedError;

	t.is(error.position, 0);
	t.is(error.furthestReadPosition, 6);
	t.is(error.furthestPeekedPosition, 6);
});

test('error from negative lookahead has furthestReadPosition from lookahead content', async t => {
	// Parser: negativeLookahead('foobar') then 'foo'
	// Input: 'foobar'
	// Negative lookahead tries 'foobar', succeeds (reads to position 6)
	// Since lookahead succeeded, negative lookahead fails
	// Error position is 0 (where negative lookahead started), but furthestReadPosition is 6
	const parser = createTupleParser([
		createNegativeLookaheadParser(createExactSequenceNaiveParser('foobar')),
		createExactSequenceNaiveParser('foo'),
	]);

	const error = await t.throwsAsync(
		runParser(parser, 'foobar', stringParserInputCompanion, { errorStack: true }),
		{
			name: 'ParserParsingInvariantError',
		},
	) as ParserParsingFailedError;

	t.is(error.position, 0);
	t.is(error.furthestReadPosition, 6);
	t.is(error.furthestPeekedPosition, 5);
});

test('furthestReadPosition on ParserUnexpectedRemainingInputError', async t => {
	const parser: Parser<string, string> = createExactSequenceNaiveParser('foo');

	const error = await t.throwsAsync(
		runParser(parser, 'foobar', stringParserInputCompanion),
		{
			name: 'ParserUnexpectedRemainingInputError',
		},
	) as ParserParsingFailedError;

	t.is(error.position, 3);
	t.is(error.furthestReadPosition, 3);
	t.is(error.furthestPeekedPosition, 3);
});
