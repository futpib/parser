
export async function uint8ArrayAsyncIterableToUint8Array(
	uint8ArrayAsyncIterable: AsyncIterable<Uint8Array> | Iterable<Uint8Array>,
): Promise<Uint8Array> {
	const chunks: Uint8Array[] = [];
	for await (const chunk of uint8ArrayAsyncIterable) {
		chunks.push(chunk);
	}
	return Buffer.concat(chunks);
}
