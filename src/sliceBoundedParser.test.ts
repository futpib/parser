import test from 'ava';
import { createArrayParser } from './arrayParser.js';
import { createElementParser } from './elementParser.js';
import { createTupleParser } from './tupleParser.js';
import { createSliceBoundedParser } from './sliceBoundedParser.js';
import { runParser } from './parser.js';
import { stringParserInputCompanion } from './parserInputCompanion.js';

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
