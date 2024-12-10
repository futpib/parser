
export class UnparserError extends Error {
	name = 'UnparserError';
}

export class UnparserImplementationError extends UnparserError {
	name = 'UnparserImplementationError';
}

export class UnparserImplementationInvariantError extends UnparserImplementationError {
	name = 'UnparserImplementationInvariantError';
}
