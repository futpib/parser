import { ParserParsingInvariantError } from './parserError.js';
import { type Falsy, parserInvariant, type ValueOrAccessor } from './parserInvariant.js';

export function parserParsingInvariant<T>(value: T, format: ValueOrAccessor<string | string[]>, ...formatArguments: any[]): Exclude<T, Falsy> {
	return parserInvariant(ParserParsingInvariantError, value, format, ...formatArguments);
}
