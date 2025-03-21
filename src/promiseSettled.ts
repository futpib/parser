
export async function promiseSettled<T>(promise: Promise<T>): Promise<PromiseSettledResult<T>> {
	const [ promiseSettledResult ] = await Promise.allSettled([ promise ]);

	return promiseSettledResult;
}
