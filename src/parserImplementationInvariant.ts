import { ParserImplementationInvariantError } from './parserError.js';
import { type Falsy, parserInvariant, type ValueOrAccessor } from './parserInvariant.js';

export function parserImplementationInvariant<T>(value: T, format: ValueOrAccessor<string | string[]>, ...formatArguments: any[]): Exclude<T, Falsy> {
	return parserInvariant(ParserImplementationInvariantError, value, format, ...formatArguments);
}
