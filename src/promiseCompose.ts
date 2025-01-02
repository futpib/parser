
export function promiseCompose<A, B, C>(
	f1: (a: A) => Promise<B>,
	f2: (b: B) => C | Promise<C>,
): (a: A) => Promise<C> {
	async function promiseComposed(a: A) {
		return f1(a).then(f2);
	};

	Object.defineProperty(promiseComposed, 'name', {
		value: `promiseCompose(${f1.name}, ${f2.name})`,
	});

	return promiseComposed;
}
