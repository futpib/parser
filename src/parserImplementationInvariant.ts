import invariant from 'invariant';
import { ParserImplementationInvariantError } from './parserError.js';

type Falsy = '' | 0 | false | undefined ;

export function parserImplementationInvariant<T>(value: T, formatOrFormatLines: string | string[], ...extra: any[]): Exclude<T, Falsy> {
	const format = Array.isArray(formatOrFormatLines) ? formatOrFormatLines.join('\n') : formatOrFormatLines;

	try {
		invariant(value, format, ...extra);
		return value as any;
	} catch (error) {
		if (error instanceof Error) {
			throw new ParserImplementationInvariantError(error.message);
		}

		throw error;
	}
}
