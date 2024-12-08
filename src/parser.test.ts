import test from 'ava';
import invariant from 'invariant';
import { createUnionParser } from './unionParser.js';
import { type Parser, runParser } from './parser.js';
import { stringInputCompanion, uint8ArrayInputCompanion } from './inputCompanion.js';
import {
	ParserParsingInvariantError, ParserParsingJoinAllError, ParserParsingJoinDeepestError, ParserParsingJoinError, ParserParsingJoinFurthestError, ParserParsingJoinNoneError,
} from './parserError.js';
import { createTupleParser } from './tupleParser.js';
import { promiseCompose } from './promiseCompose.js';
import { createDisjunctionParser } from './disjunctionParser.js';
import { createExactSequenceParser } from './exactSequenceParser.js';
import { createArrayParser } from './arrayParser.js';
import { createElementParser } from './elementParser.js';

const aUnionParser = createUnionParser<string, string>([
	createExactSequenceParser('1'),
	createExactSequenceParser('aa'),
	createExactSequenceParser('AAA'),
]);

const abDisjunctionParser = createDisjunctionParser<string, string>([
	aUnionParser,
	createExactSequenceParser('2'),
	createExactSequenceParser('bb'),
	createExactSequenceParser('BBB'),
]);

const abcUnionParser = createUnionParser<string, string>([
	abDisjunctionParser,
	createExactSequenceParser('final_3'),
	createExactSequenceParser('final_cc'),
	createExactSequenceParser('final_CCC'),
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
	const error = await t.throwsAsync(runParser(sampleParser, asyncIteratorFromString('1bbfinal_CC!'), stringInputCompanion, {
		errorJoinMode: 'none',
	}), {
		instanceOf: ParserParsingJoinNoneError,
	});

	t.is(error.position, 12);
	t.deepEqual(error.childErrors, []);

	t.snapshot(removeStackLocations(error.stack!));
});

test('errorJoinMode: all', async t => {
	const error = await t.throwsAsync(runParser(sampleParser, asyncIteratorFromString('1bbfinal_CC!'), stringInputCompanion, {
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
	const error = await t.throwsAsync(runParser(sampleParser, asyncIteratorFromString('1bbfinal_CC!'), stringInputCompanion, {
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
	const error = await t.throwsAsync(runParser(sampleParser, asyncIteratorFromString('1bbfinal_CC!'), stringInputCompanion, {
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

test('throws on inputCompanion type mismatch', async t => {
	const anythingParser: Parser<any, any> = createArrayParser(createElementParser());

	await runParser(anythingParser, asyncIteratorFromString('anything'), stringInputCompanion);
	await runParser(anythingParser, 'anything', stringInputCompanion);
	await runParser(anythingParser, Buffer.from('anything'), uint8ArrayInputCompanion);
	await runParser(anythingParser, new Uint8Array([ 1, 2, 3 ]), uint8ArrayInputCompanion);

	await t.throwsAsync(runParser(anythingParser, asyncIteratorFromString('anything'), uint8ArrayInputCompanion), {
		message: /input companion/,
	});
});
