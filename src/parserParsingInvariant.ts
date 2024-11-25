import invariant from 'invariant';
import { ParserParsingInvariantError } from './parserError.js';

type Falsy = '' | 0 | false | undefined ;

export function parserParsingInvariant<T>(value: T, formatOrFormatLines: string | string[], ...extra: any[]): Exclude<T, Falsy> {
	const format = Array.isArray(formatOrFormatLines) ? formatOrFormatLines.join('\n') : formatOrFormatLines;

	try {
		invariant(value, format, ...extra);
		return value as any;
	} catch (error) {
		if (error instanceof Error) {
			throw new ParserParsingInvariantError(error.message);
		}

		throw error;
	}
}
