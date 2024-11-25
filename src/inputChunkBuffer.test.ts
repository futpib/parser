import test from 'ava';
import { InputChunkBufferImplementation } from './inputChunkBuffer.js';
import { stringInputCompanion } from './inputCompanion.js';

test('inputChunkBuffer', t => {
	const inputChunkBuffer = new InputChunkBufferImplementation(stringInputCompanion);

	t.is(inputChunkBuffer.peek(0), undefined);

	inputChunkBuffer.push('');

	t.is(inputChunkBuffer.peek(0), undefined);

	inputChunkBuffer.push('abc');

	t.is(inputChunkBuffer.peek(0), 'a');
	t.is(inputChunkBuffer.peek(1), 'b');
	t.is(inputChunkBuffer.peek(2), 'c');
	t.is(inputChunkBuffer.peek(3), undefined);

	inputChunkBuffer.push('def');

	t.is(inputChunkBuffer.peek(0), 'a');
	t.is(inputChunkBuffer.peek(3), 'd');
	t.is(inputChunkBuffer.peek(6), undefined);

	inputChunkBuffer.push('');

	t.is(inputChunkBuffer.peek(0), 'a');
	t.is(inputChunkBuffer.peek(3), 'd');
	t.is(inputChunkBuffer.peek(6), undefined);

	inputChunkBuffer.skip(1);

	t.is(inputChunkBuffer.peek(0), 'b');
	t.is(inputChunkBuffer.peek(3), 'e');
	t.is(inputChunkBuffer.peek(5), undefined);

	inputChunkBuffer.skip(3);

	t.is(inputChunkBuffer.peek(0), 'e');
	t.is(inputChunkBuffer.peek(2), undefined);

	inputChunkBuffer.push('gh');

	t.is(inputChunkBuffer.peek(0), 'e');
	t.is(inputChunkBuffer.peek(2), 'g');
	t.is(inputChunkBuffer.peek(3), 'h');
	t.is(inputChunkBuffer.peek(4), undefined);
});
