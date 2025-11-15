import test from 'ava';
import util from 'util';
import { NoStackCaptureOverheadError } from './noStackCaptureOverheadError.js';

test('NoStackCaptureOverheadError works', t => {
	const error = new NoStackCaptureOverheadError('Test message');

	t.is(error.name, 'NoStackCaptureOverheadError');
	t.is(error.message, 'Test message');
	t.true(error instanceof Error, 'error is instance of Error');
	t.true(error instanceof NoStackCaptureOverheadError, 'error is instance of NoStackCaptureOverheadError');
	t.false((Error as any).isError(error), 'Error.isError does not identify error as Error');
	t.false(util.types.isNativeError(error), 'util.types.isNativeError does not identify error as native Error');
});
