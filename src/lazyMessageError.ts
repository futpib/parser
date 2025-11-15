import { NoStackCaptureOverheadError } from "./noStackCaptureOverheadError.js";

type ValueOrAccessor<T> = T | (() => T);

export type LazyMessage =
	| ValueOrAccessor<string | string[]>
	| [ ValueOrAccessor<string | string[]>, ...Array<ValueOrAccessor<unknown>> ]
;

function formatLazyMessageFormat(
	format: ValueOrAccessor<string | string[]>,
): string {
	if (typeof format === 'function') {
		format = format();
	}

	if (Array.isArray(format)) {
		return format.join('\n');
	}

	return format;
}

function formatLazyMessageSubstitutions(
	format: string,
	formatArguments: Array<ValueOrAccessor<unknown>>,
): string {
	return format.replaceAll('%s', () => {
		const argumentOrAccessor = formatArguments.shift();
		return typeof argumentOrAccessor === 'function' ? argumentOrAccessor() : argumentOrAccessor;
	});
}

export function formatLazyMessage(lazyMessage: LazyMessage): string {
	if (Array.isArray(lazyMessage)) {
		const [ format, ...formatArguments ] = lazyMessage;
		const formattedFormat = formatLazyMessageFormat(format);
		return formatLazyMessageSubstitutions(formattedFormat, formatArguments);
	} else {
		return formatLazyMessageFormat(lazyMessage);
	}
}

export interface LazyMessageError extends Error {
	computeMessage(): void;
}

export function createLazyMessageErrorClass(
	BaseError: typeof NoStackCaptureOverheadError | typeof Error,
) {
	return class LazyMessageError extends (BaseError as typeof Error) implements LazyMessageError {
		name = 'LazyMessageError';

		_lazyMessage: undefined | LazyMessage;

		constructor(
			lazyMessage: LazyMessage,
		) {
			super('LAZY_MESSAGE');
			this._lazyMessage = lazyMessage;
		}

		computeMessage(): void {
			if (this._lazyMessage === undefined) {
				return;
			}

			this.message = formatLazyMessage(this._lazyMessage);
			this.stack = this.stack?.replace('LAZY_MESSAGE', this.message);
			delete this._lazyMessage;
		}
	}
}

export const NormalLazyMessageError = createLazyMessageErrorClass(Error);
export const NoStackCaptureOverheadLazyMessageError = createLazyMessageErrorClass(NoStackCaptureOverheadError);

export function isLazyMessageError(
	value: unknown,
): value is LazyMessageError {
	return (
		typeof value === 'object'
			&& value !== null
			&& value instanceof Error
			&& '_lazyMessage' in value
			&& typeof (value as any).computeMessage === 'function'
	);
}
