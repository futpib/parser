
export function promiseCompose<A, B, C>(
	f1: (a: A) => B | Promise<B>,
	f2: (b: B) => C | Promise<C>,
): (a: A) => C | Promise<C> {
	function promiseComposed(a: A) {
		const bOrBPromise = f1(a);

		if (bOrBPromise instanceof Promise) {
			return bOrBPromise.then(f2);
		}

		return f2(bOrBPromise);
	};

	Object.defineProperty(promiseComposed, 'name', {
		value: `promiseCompose(${f1.name}, ${f2.name})`,
	});

	return promiseComposed;
}
