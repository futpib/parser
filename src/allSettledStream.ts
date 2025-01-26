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
	let cancelled = false;

	return new ReadableStream({
		start(controller) {
			const startStack = (
				(new Error('allSettledStream ReadableStream start stack holder').stack ?? '')
					.split('\n')
					.slice(1)
					.join('\n')
			);

			const allSettledStreamTaskAwaiter = async ({
				promise,
				context,
			}: AllSettledStreamTask<T, Context>) => {
				const [ promiseSettledResult ] = await Promise.allSettled([ promise ]);

				if (
					promiseSettledResult.status === 'rejected'
						&& promiseSettledResult.reason instanceof Error
						&& promiseSettledResult.reason.stack
				) {
					promiseSettledResult.reason.stack += `\n${startStack}`;
				}

				settledCount++;

				if (cancelled) {
					return;
				}

				const allSettedStreamResult: AllSettedStreamResult<T, Context> = {
					...promiseSettledResult,
					context,
				};

				controller.enqueue(allSettedStreamResult);

				if (settledCount === tasks.length) {
					controller.close();
				}
			};

			let settledCount = 0;
			for (const task of tasks) {
				allSettledStreamTaskAwaiter(task);
			}
		},

		cancel() {
			cancelled = true;
		},
	});
}
