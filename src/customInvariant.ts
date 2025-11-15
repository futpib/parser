import { type Constructor } from 'type-fest';
import { LazyMessage, LazyMessageError } from './lazyMessageError.js';

export type Falsy = '' | 0 | false | undefined;

export type ValueOrAccessor<T> = T | (() => T);

export function customInvariant<T>(
	ErrorConstructor: Constructor<LazyMessageError, [LazyMessage]> | ((lazyMessage: LazyMessage) => LazyMessageError),
	value: T,
	formatOrFormatLines: ValueOrAccessor<string | string[]>,
	...formatArguments: Array<unknown | (() => unknown)>
): Exclude<T, Falsy> {
	if (value) {
		return value as any;
	}

	throw new (ErrorConstructor as Constructor<LazyMessageError, [LazyMessage]>)([
		formatOrFormatLines,
		...formatArguments,
	]);
}
