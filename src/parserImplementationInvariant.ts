import { ParserImplementationInvariantError } from './parserError.js';
import { type Falsy, customInvariant, type ValueOrAccessor } from './customInvariant.js';

export function parserImplementationInvariant<T>(value: T, format: ValueOrAccessor<string | string[]>, ...formatArguments: any[]): Exclude<T, Falsy> {
	return customInvariant(ParserImplementationInvariantError, value, format, ...formatArguments);
}
