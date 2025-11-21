import { type Falsy, customInvariant, type ValueOrAccessor } from './customInvariant.js';
import { normalParserErrorModule } from './parserError.js';

export function parserImplementationInvariant<T>(value: T, format: ValueOrAccessor<string | string[]>, ...formatArguments: unknown[]): Exclude<T, Falsy> {
	return customInvariant(normalParserErrorModule.ParserImplementationInvariantError, value, format, ...formatArguments);
}
