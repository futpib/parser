import fsPromises from 'node:fs/promises';
import { fetchCid as fetchCidFromIpfs } from '@futpib/fetch-cid';

function readableWebStreamOnFinish<T>(readableWebStream: ReadableStream<T>, onFinish: () => void): ReadableStream<T> {
	const reader = readableWebStream.getReader();

	const stream = new ReadableStream<T>({
		async start(controller) {
			try {
				while (true) {
					const { done, value } = await reader.read();
					if (done) {
						break;
					}

					controller.enqueue(value);
				}
			} finally {
				controller.close();
				reader.releaseLock();
				onFinish();
			}
		},
		async cancel(reason) {
			await reader.cancel(reason);
			onFinish();
		},
	});

	return stream;
}

export async function fetchCid(cidOrPath: string): Promise<AsyncIterable<Uint8Array>> {
	if (cidOrPath.includes('/')) {
		const file = await fsPromises.open(cidOrPath, 'r');

		const stream = file.readableWebStream() as ReadableStream<Uint8Array>;

		const streamWithClose = readableWebStreamOnFinish(stream, () => {
			file.close();
		});

		return streamWithClose;
	}

	return fetchCidFromIpfs(cidOrPath);
}
