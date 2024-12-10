import test from 'ava';
import * as fc from 'fast-check';
import { runUnparser, Unparser } from './unparser.js';
import { stringUnparserOutputCompanion } from './unparserOutputCompanion.js';
import { testProp } from '@fast-check/ava';

test('writeLater', async t => {
	const stringToBeWrittenBefore = 'before writeLater\n';
	const stringToBeWrittenLater = 'written later\n';
	const stringToBeWrittenAfter = 'after writeLater\n';

	let expectedPositionA: number | undefined;
	let expectedPositionB: number | undefined;

	let actualPositionAFromWithinWriteLater: number | undefined;
	let actualPositionBFromWithinWriteLater: number | undefined;

	const unparser: Unparser<void, string> = async function * (_input, unparserContext) {
		yield stringToBeWrittenBefore

		expectedPositionA = unparserContext.position;

		const writeLater = yield * unparserContext.writeLater(stringToBeWrittenLater.length);

		expectedPositionB = unparserContext.position;

		yield stringToBeWrittenAfter;

		yield * unparserContext.writeEarlier(writeLater, async function * (_input, unparserContext) {
			actualPositionAFromWithinWriteLater = unparserContext.position;

			yield stringToBeWrittenLater;

			actualPositionBFromWithinWriteLater = unparserContext.position;
		}, undefined);
	};

	const stringsAsyncIterable = runUnparser(unparser, undefined, stringUnparserOutputCompanion);

	const strings: string[] = [];

	for await (const string of stringsAsyncIterable) {
		strings.push(string);
	}

	const string = strings.join('');

	t.is(string, stringToBeWrittenBefore + stringToBeWrittenLater + stringToBeWrittenAfter);

	t.is(actualPositionAFromWithinWriteLater, expectedPositionA, 'position a');
	t.is(actualPositionBFromWithinWriteLater, expectedPositionB, 'position b');

	t.is(expectedPositionA, stringToBeWrittenBefore.length);
	t.is(expectedPositionB, stringToBeWrittenBefore.length + stringToBeWrittenLater.length);
});

test('writeLater one deep', async t => {
	const unparser: Unparser<void, string> = async function * (_input, unparserContext) {
		yield '(';
		const writeLaterA = yield * unparserContext.writeLater(3);
		yield ')';

		yield * unparserContext.writeEarlier(writeLaterA, async function * (_input, unparserContext) {
			yield '[';
			const writeLaterB = yield * unparserContext.writeLater(1);
			yield ']';

			yield * unparserContext.writeEarlier(writeLaterB, async function * (_input, unparserContext) {
				yield 'a';
			}, undefined);
		}, undefined);
	};

	const stringsAsyncIterable = runUnparser(unparser, undefined, stringUnparserOutputCompanion);

	const strings: string[] = [];

	for await (const string of stringsAsyncIterable) {
		strings.push(string);
	}

	const string = strings.join('');

	t.is(string, '([a])');
});

test('writeLater deep', async t => {
	const unparser: Unparser<void, string> = async function * (_input, unparserContext) {
		yield '(';
		const writeLaterA = yield * unparserContext.writeLater(5);
		yield ')';

		let writeLaterC: typeof writeLaterA;

		yield * unparserContext.writeEarlier(writeLaterA, async function * (_input, unparserContext) {
			yield '[';
			const writeLaterB = yield * unparserContext.writeLater(3);
			yield ']';

			yield * unparserContext.writeEarlier(writeLaterB, async function * (_input, unparserContext) {
				yield '{';
				writeLaterC = yield * unparserContext.writeLater(1);
				yield '}';
			}, undefined);
		}, undefined);

		yield * unparserContext.writeEarlier(writeLaterC!, async function * (_input, unparserContext) {
			yield 'a';
		}, undefined);

		yield 'z';
	};

	const stringsAsyncIterable = runUnparser(unparser, undefined, stringUnparserOutputCompanion);

	const strings: string[] = [];

	for await (const string of stringsAsyncIterable) {
		strings.push(string);
	}

	const string = strings.join('');

	t.is(string, '([{a}])z');
});

testProp(
	'writeLater positions and lengths',
	[
		fc.array(
			fc.oneof(
				fc.array(
					fc.oneof(
						fc.array(
							fc.string(),
						),
						fc.string(),
					),
				),
				fc.string(),
			),
		),
	],
	async (t, stringArray3) => {
		const numberUnparser: Unparser<number, string> = async function * (input, unparserContext) {
			yield input.toString().padStart(8, '0');
		};

		const createLengthPrefixedUnparser = <T>(
			unparser: Unparser<T, string>,
		): Unparser<T, string> => {
			return async function * (input, unparserContext) {
				const length = yield * unparserContext.writeLater(8);
				yield * unparser(input, unparserContext);
				yield * unparserContext.writeEarlier(length, numberUnparser, unparserContext.position - length.positionEnd);
			};
		};

		const unparser0: Unparser<string, string> = createLengthPrefixedUnparser(async function * (input, unparserContext) {
			yield input;
		});

		const unparser1: Unparser<string[], string> = createLengthPrefixedUnparser(async function * (input, unparserContext) {
			for (const string of input) {
				yield * unparser0(string, unparserContext);
			}
		});

		const unparser2: Unparser<(string | string[])[], string> = createLengthPrefixedUnparser(async function * (input, unparserContext) {
			for (const stringArray2 of input) {
				if (typeof stringArray2 === 'string') {
					yield * unparser0(stringArray2, unparserContext);
				} else {
					yield * unparser1(stringArray2, unparserContext);
				}
			}
		});

		const unparser3: Unparser<(string | (string | string[])[])[], string> = createLengthPrefixedUnparser(async function * (input, unparserContext) {
			for (const stringArray3 of input) {
				if (typeof stringArray3 === 'string') {
					yield * unparser0(stringArray3, unparserContext);
				} else {
					yield * unparser2(stringArray3, unparserContext);
				}
			}
		});

		const stringsAsyncIterable = runUnparser(unparser3, stringArray3, stringUnparserOutputCompanion);

		const strings: string[] = [];

		for await (const string of stringsAsyncIterable) {
			strings.push(string);
		}

		const actualString = strings.join('');

		type DeepArray<T> = T | DeepArray<T>[];

		function getExpectedString(stringArray: DeepArray<string>): string {
			let expectedString = stringArray;

			if (typeof stringArray !== 'string') {
				expectedString = stringArray.map(getExpectedString).join('');
			}

			return [
				expectedString.length.toString().padStart(8, '0'),
				expectedString,
			].join('');
		}

		const expectedString = getExpectedString(stringArray3);

		t.deepEqual(actualString, expectedString);
	},
	{
		verbose: true,
	},
);
