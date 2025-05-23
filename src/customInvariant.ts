import { type Constructor } from 'type-fest';

export type Falsy = '' | 0 | false | undefined;

export type ValueOrAccessor<T> = T | (() => T);

export function customInvariant<T>(
	ErrorConstructor: Constructor<Error, [message: string]> | ((message: string) => Error),
	value: T,
	formatOrFormatLines: ValueOrAccessor<string | string[]>,
	...formatArguments: (unknown | (() => unknown))[]
): Exclude<T, Falsy> {
	if (value) {
		return value as any;
	}

	let format = typeof formatOrFormatLines === 'function' ? formatOrFormatLines() : formatOrFormatLines;
	format = Array.isArray(format) ? format.join('\n') : format;

	throw new (ErrorConstructor as Constructor<Error>)(
		format.replaceAll('%s', () => {
			const argumentOrAccessor = formatArguments.shift();
			return typeof argumentOrAccessor === 'function' ? argumentOrAccessor() : argumentOrAccessor;
		}),
	);
}
