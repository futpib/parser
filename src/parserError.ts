
export class ParserError extends Error {}

export class ParserImplementationError extends ParserError {}
export class ParserImplementationInvariantError extends ParserImplementationError {}

export class ParserParsingFailedError extends ParserError {}
export class ParserParsingInvariantError extends ParserParsingFailedError {}
export class ParserUnexpectedEndOfInputError extends ParserParsingFailedError {}
