import { NormalLazyMessageError } from "./lazyMessageError.js";

export class UnparserError extends NormalLazyMessageError {
	name = 'UnparserError';
}

export class UnparserImplementationError extends UnparserError {
	name = 'UnparserImplementationError';
}

export class UnparserImplementationInvariantError extends UnparserImplementationError {
	name = 'UnparserImplementationInvariantError';
}
