import invariant from "invariant";

export function invariantDefined<T>(value: T, format: string, ...extra: any[]): Exclude<T, undefined> {
	invariant(value !== undefined, format, ...extra);
	return value as any;
}
