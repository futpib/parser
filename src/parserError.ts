import { type InputReaderState } from './inputReaderState.js';
import { LazyMessage, NormalLazyMessageError, NoStackCaptureOverheadLazyMessageError } from './lazyMessageError.js';

export interface ParserError extends Error {
	position: undefined | number;
	inputReaderSate: undefined | InputReaderState<unknown>;
}

export function isParserError(value: unknown): value is ParserError {
	return (
		typeof value === 'object'
			&& value !== null
			&& value instanceof Error
			&& 'position' in value
			&& (typeof value.position === 'number' || value.position === undefined)
			&& 'inputReaderSate' in value
			&& (value.inputReaderSate === undefined || typeof value.inputReaderSate === 'object')
	);
}

type ParserErrorInterface = ParserError;

export interface ParserParsingFailedError extends ParserErrorInterface {
	depth: number;
	position: number;
	furthestReadPosition: number;
	furthestPeekedPosition: number;
}

export function isParserParsingFailedError(value: unknown): value is ParserParsingFailedError {
	return (
		typeof value === 'object'
			&& value !== null
			&& value instanceof Error
			&& 'depth' in value
			&& typeof value.depth === 'number'
			&& 'position' in value
			&& typeof value.position === 'number'
			&& 'furthestReadPosition' in value
			&& typeof value.furthestReadPosition === 'number'
			&& 'furthestPeekedPosition' in value
			&& typeof value.furthestPeekedPosition === 'number'
	);
}

type ParserParsingFailedErrorInterface = ParserParsingFailedError;

export interface ParserParsingJoinError extends ParserParsingFailedErrorInterface {
	childErrors: ParserParsingFailedErrorInterface[];
}

export function isParserParsingJoinError(value: unknown): value is ParserParsingJoinError {
	return (
		typeof value === 'object'
			&& value !== null
			&& value instanceof Error
			&& 'childErrors' in value
			&& Array.isArray(value.childErrors)
			&& value.childErrors.every((childError: unknown) => isParserParsingFailedError(childError))
	);
}

type ParserParsingJoinErrorInterface = ParserParsingJoinError;

function createParserErrorModule(
	BaseLazyMessageError: typeof NormalLazyMessageError | typeof NoStackCaptureOverheadLazyMessageError,
) {
	class ParserError extends BaseLazyMessageError implements ParserErrorInterface {
		name = 'ParserError';

		public position: undefined | number = undefined;
		public inputReaderSate: undefined | InputReaderState<unknown> = undefined;
	}

	class ParserImplementationError extends ParserError {
		name = 'ParserImplementationError';
	}
	class ParserImplementationInvariantError extends ParserImplementationError {
		name = 'ParserImplementationInvariantError';
	}

	class ParserParsingFailedError extends ParserError implements ParserParsingFailedErrorInterface {
		name = 'ParserParsingFailedError';

		constructor(
			message: LazyMessage,
			public readonly depth: number,
			public readonly position: number,
			public readonly furthestReadPosition: number,
			public readonly furthestPeekedPosition: number,
		) {
			super(message);
		}
	}

	class ParserParsingJoinError extends ParserParsingFailedError implements ParserParsingJoinErrorInterface {
		name = 'ParserParsingJoinError';

		public readonly childErrors: ParserParsingFailedErrorInterface[] = [];
	}

	class ParserParsingJoinNoneError extends ParserParsingJoinError {
		name = 'ParserParsingJoinNoneError';
	}

	class ParserParsingJoinAllError extends ParserParsingJoinError {
		name = 'ParserParsingJoinAllError';

		constructor(
			message: LazyMessage,
			depth: number,
			position: number,
			furthestReadPosition: number,
			furthestPeekedPosition: number,
			public readonly childErrors: ParserParsingFailedErrorInterface[],
		) {
			super(message, depth, position, furthestReadPosition, furthestPeekedPosition);
		}
	}

	class ParserParsingJoinDeepestError extends ParserParsingJoinError {
		name = 'ParserParsingJoinDeepestError';

		constructor(
			message: LazyMessage,
			depth: number,
			position: number,
			furthestReadPosition: number,
			furthestPeekedPosition: number,
			public readonly childErrors: ParserParsingFailedErrorInterface[],
		) {
			super(message, depth, position, furthestReadPosition, furthestPeekedPosition);
		}
	}

	class ParserParsingJoinFurthestError extends ParserParsingJoinError {
		name = 'ParserParsingJoinFurthestError';

		constructor(
			message: LazyMessage,
			depth: number,
			position: number,
			furthestReadPosition: number,
			furthestPeekedPosition: number,
			public readonly childErrors: ParserParsingFailedErrorInterface[],
		) {
			super(message, depth, position, furthestReadPosition, furthestPeekedPosition);
		}
	}

	class ParserParsingInvariantError extends ParserParsingFailedError {
		name = 'ParserParsingInvariantError';
	}

	class ParserUnexpectedEndOfInputError extends ParserParsingFailedError {
		name = 'ParserUnexpectedEndOfInputError';
	}

	class ParserUnexpectedRemainingInputError extends ParserParsingFailedError {
		name = 'ParserUnexpectedRemainingInputError';
	}

	return {
		ParserError,
		ParserImplementationError,
		ParserImplementationInvariantError,
		ParserParsingFailedError,
		ParserParsingJoinError,
		ParserParsingJoinNoneError,
		ParserParsingJoinAllError,
		ParserParsingJoinDeepestError,
		ParserParsingJoinFurthestError,
		ParserParsingInvariantError,
		ParserUnexpectedEndOfInputError,
		ParserUnexpectedRemainingInputError,
	};
}

export type ParserErrorModule = ReturnType<typeof createParserErrorModule>;

export const normalParserErrorModule = createParserErrorModule(NormalLazyMessageError);
export const noStackCaptureOverheadParserErrorModule = createParserErrorModule(NoStackCaptureOverheadLazyMessageError);
