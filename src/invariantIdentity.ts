import invariant from 'invariant';

type Falsy = '' | 0 | false | undefined ;

export function invariantIdentity<T>(value: T, format: string, ...extra: any[]): Exclude<T, Falsy> {
	invariant(value, format, ...extra);
	return value as any;
}
