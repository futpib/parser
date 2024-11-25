import test from 'ava';
import { SequenceBufferImplementation } from './sequenceBuffer.js';
import { stringInputCompanion } from './inputCompanion.js';

test('sequenceBuffer', t => {
	const sequenceBuffer = new SequenceBufferImplementation(stringInputCompanion);

	t.is(sequenceBuffer.peek(0), undefined);

	sequenceBuffer.push('');

	t.is(sequenceBuffer.peek(0), undefined);

	sequenceBuffer.push('abc');

	t.is(sequenceBuffer.peek(0), 'a');
	t.is(sequenceBuffer.peek(1), 'b');
	t.is(sequenceBuffer.peek(2), 'c');
	t.is(sequenceBuffer.peek(3), undefined);

	sequenceBuffer.push('def');

	t.is(sequenceBuffer.peek(0), 'a');
	t.is(sequenceBuffer.peek(3), 'd');
	t.is(sequenceBuffer.peek(6), undefined);

	sequenceBuffer.push('');

	t.is(sequenceBuffer.peek(0), 'a');
	t.is(sequenceBuffer.peek(3), 'd');
	t.is(sequenceBuffer.peek(6), undefined);

	sequenceBuffer.skip(1);

	t.is(sequenceBuffer.peek(0), 'b');
	t.is(sequenceBuffer.peek(3), 'e');
	t.is(sequenceBuffer.peek(5), undefined);

	sequenceBuffer.skip(3);

	t.is(sequenceBuffer.peek(0), 'e');
	t.is(sequenceBuffer.peek(2), undefined);

	sequenceBuffer.push('gh');

	t.is(sequenceBuffer.peek(0), 'e');
	t.is(sequenceBuffer.peek(2), 'g');
	t.is(sequenceBuffer.peek(3), 'h');
	t.is(sequenceBuffer.peek(4), undefined);
});
