import test from 'ava';
import { SequenceBufferImplementation } from './sequenceBuffer.js';
import { stringParserInputCompanion } from './parserInputCompanion.js';

test('sequenceBuffer', t => {
	const sequenceBuffer = new SequenceBufferImplementation(stringParserInputCompanion);

	t.is(sequenceBuffer.length, 0);
	t.is(sequenceBuffer.peek(0), undefined);

	t.deepEqual(sequenceBuffer.toSequenceBufferState(), {
		consumedBufferedSequences: [],
		unconsumedBufferedSequences: [],
	});

	sequenceBuffer.push('');

	t.is(sequenceBuffer.length, 0);
	t.is(sequenceBuffer.peek(0), undefined);

	t.deepEqual(sequenceBuffer.toSequenceBufferState(), {
		consumedBufferedSequences: [],
		unconsumedBufferedSequences: [],
	});

	sequenceBuffer.push('abc');

	t.is(sequenceBuffer.length, 3);
	t.is(sequenceBuffer.peek(0), 'a');
	t.is(sequenceBuffer.peek(1), 'b');
	t.is(sequenceBuffer.peek(2), 'c');
	t.is(sequenceBuffer.peek(3), undefined);

	t.deepEqual(sequenceBuffer.toSequenceBufferState(), {
		consumedBufferedSequences: [],
		unconsumedBufferedSequences: ['abc'],
	});

	sequenceBuffer.push('def');

	t.is(sequenceBuffer.length, 6);
	t.is(sequenceBuffer.peek(0), 'a');
	t.is(sequenceBuffer.peek(3), 'd');
	t.is(sequenceBuffer.peek(6), undefined);

	t.is(sequenceBuffer.peekSequence(1, 4), 'abcdef'.slice(1, 4), 'bcd');
	t.is(sequenceBuffer.peekSequence(1, 5), 'abcdef'.slice(1, 5), 'bcde');
	t.is(sequenceBuffer.peekSequence(1, 6), 'abcdef'.slice(1, 6), 'bcdef');
	t.is(sequenceBuffer.peekSequence(1, 7), undefined, 'bcdef?');

	t.deepEqual(sequenceBuffer.toSequenceBufferState(), {
		consumedBufferedSequences: [],
		unconsumedBufferedSequences: ['abc', 'def'],
	});

	sequenceBuffer.push('');

	t.is(sequenceBuffer.length, 6);
	t.is(sequenceBuffer.peek(0), 'a');
	t.is(sequenceBuffer.peek(3), 'd');
	t.is(sequenceBuffer.peek(6), undefined);

	t.deepEqual(sequenceBuffer.toSequenceBufferState(), {
		consumedBufferedSequences: [],
		unconsumedBufferedSequences: ['abc', 'def', ''],
	});

	sequenceBuffer.skip(1);

	t.is(sequenceBuffer.length, 5);
	t.is(sequenceBuffer.peek(0), 'b');
	t.is(sequenceBuffer.peek(3), 'e');
	t.is(sequenceBuffer.peek(5), undefined);

	t.deepEqual(sequenceBuffer.toSequenceBufferState(), {
		consumedBufferedSequences: ['a'],
		unconsumedBufferedSequences: ['bc', 'def', ''],
	});

	sequenceBuffer.skip(3);

	t.is(sequenceBuffer.length, 2);
	t.is(sequenceBuffer.peek(0), 'e');
	t.is(sequenceBuffer.peek(2), undefined);

	t.deepEqual(sequenceBuffer.toSequenceBufferState(), {
		consumedBufferedSequences: ['abc'],
		unconsumedBufferedSequences: ['', 'def', ''],
	});

	sequenceBuffer.push('gh');

	t.is(sequenceBuffer.length, 4);
	t.is(sequenceBuffer.peek(0), 'e');
	t.is(sequenceBuffer.peek(2), 'g');
	t.is(sequenceBuffer.peek(3), 'h');
	t.is(sequenceBuffer.peek(4), undefined);

	t.is(sequenceBuffer.peekSequence(1, 3), 'efgh'.slice(1, 3), 'fg');
	t.is(sequenceBuffer.peekSequence(1, 4), 'efgh'.slice(1, 4), 'fgh');
	t.is(sequenceBuffer.peekSequence(1, 5), undefined, 'fgh?');

	t.deepEqual(sequenceBuffer.toSequenceBufferState(), {
		consumedBufferedSequences: ['d'],
		unconsumedBufferedSequences: ['ef', '', 'gh'],
	});
});
