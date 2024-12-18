type AllSettledStreamFulfilledResult<T, Context> = {
	status: 'fulfilled';
	value: T;
	context: Context;
};

type AllSettledStreamRejectedResult<T, Context> = {
	status: 'rejected';
	reason: unknown;
	context: Context;
};

type AllSettedStreamResult<T, Context> = AllSettledStreamFulfilledResult<T, Context> | AllSettledStreamRejectedResult<T, Context>;

type AllSettledStreamTask<T, Context> = {
	promise: Promise<T>;
	context: Context;
};

export function allSettledStream<T, Context>(tasks: Array<AllSettledStreamTask<T, Context>>): ReadableStream<AllSettedStreamResult<T, Context>> {
	return new ReadableStream({
		async start(controller) {
			let settledCount = 0;
			for (const { promise, context } of tasks) {
				(async () => {
					const [ promiseSettledResult ] = await Promise.allSettled([ promise ]);

					settledCount++;

					const allSettedStreamResult: AllSettedStreamResult<T, Context> = {
						...promiseSettledResult,
						context,
					};

					controller.enqueue(allSettedStreamResult);

					if (settledCount === tasks.length) {
						controller.close();
					}
				})();
			}
		},
	});
}
