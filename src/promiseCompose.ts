
export function promiseCompose<A, B, C>(
	f1: (a: A) => Promise<B>,
	f2: (b: B) => C | Promise<C>,
): (a: A) => Promise<C> {
	return a => f1(a).then(f2);
}
