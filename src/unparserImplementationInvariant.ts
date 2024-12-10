import { UnparserImplementationInvariantError } from './unparserError.js';
import { type Falsy, customInvariant, type ValueOrAccessor } from './customInvariant.js';

export function unparserImplementationInvariant<T>(value: T, format: ValueOrAccessor<string | string[]>, ...formatArguments: any[]): Exclude<T, Falsy> {
	return customInvariant(UnparserImplementationInvariantError, value, format, ...formatArguments);
}
