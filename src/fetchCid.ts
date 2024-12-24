import fsPromises from 'node:fs/promises';

export async function fetchCid(cidOrPath: string): Promise<AsyncIterable<Uint8Array>> {
	if (cidOrPath.includes('/')) {
		const file = await fsPromises.open(cidOrPath, 'r');
		return file.readableWebStream({
			type: 'bytes',
		});
	}

	const response = await fetch('https://ipfs.io/ipfs/' + cidOrPath);
	return response.body!;
}
