import { InputReaderState } from "./inputReader.js";

export class ParserError extends Error {
	name = 'ParserError';

	public position: undefined | number = undefined;
	public inputReaderSate: undefined | InputReaderState<unknown> = undefined;
}

export class ParserImplementationError extends ParserError {
	name = 'ParserImplementationError';
}
export class ParserImplementationInvariantError extends ParserImplementationError {
	name = 'ParserImplementationInvariantError';
}

export class ParserParsingFailedError extends ParserError {
	name = 'ParserParsingFailedError';

	constructor(
		message: string,
		public readonly depth: number,
		public readonly position: number,
	) {
		super(message);
	}
}

export class ParserParsingJoinError extends ParserParsingFailedError {
	name = 'ParserParsingJoinError';

	public readonly childErrors: ParserParsingFailedError[] = [];
}

export class ParserParsingJoinNoneError extends ParserParsingJoinError {
	name = 'ParserParsingJoinNoneError';
}

export class ParserParsingJoinAllError extends ParserParsingJoinError {
	name = 'ParserParsingJoinAllError';

	constructor(
		message: string,
		depth: number,
		position: number,
		public readonly childErrors: ParserParsingFailedError[],
	) {
		super(message, depth, position);
	}
}

export class ParserParsingJoinDeepestError extends ParserParsingJoinError {
	name = 'ParserParsingJoinDeepestError';

	constructor(
		message: string,
		depth: number,
		position: number,
		public readonly childErrors: ParserParsingFailedError[],
	) {
		super(message, depth, position);
	}
}

export class ParserParsingJoinFurthestError extends ParserParsingJoinError {
	name = 'ParserParsingJoinFurthestError';

	constructor(
		message: string,
		depth: number,
		position: number,
		public readonly childErrors: ParserParsingFailedError[],
	) {
		super(message, depth, position);
	}
}

export class ParserParsingInvariantError extends ParserParsingFailedError {
	name = 'ParserParsingInvariantError';
}

export class ParserUnexpectedEndOfInputError extends ParserParsingFailedError {
	name = 'ParserUnexpectedEndOfInputError';
}
