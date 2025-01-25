import fsPromises from 'node:fs/promises';
import path from 'node:path';
import pMemoize from 'p-memoize';
import envPaths from 'env-paths';

const paths = envPaths('parser.futpib.github.io');

class FsCache {
	private get _basePath() {
		return path.join(paths.cache, 'fetchCid');
	}

	private _getKeyPath(key: string) {
		return path.join(this._basePath, key.replaceAll('/', '_'));
	}

	async get(key: string): Promise<[ ReadableStream<Uint8Array>, ReadableStream<Uint8Array> ] | undefined> {
		try {
			const file = await fsPromises.open(this._getKeyPath(key), 'r');
			return [ file.readableWebStream({
				type: 'bytes',
			}) as any, undefined as any ];
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
				return undefined;
			}

			throw error;
		}
	}

	async has(key: string) {
		const streams = await this.get(key);
		try {
			return streams !== undefined;
		} finally {
			for (const stream of streams ?? []) {
				await stream?.cancel();
			}
		}
	}

	async set(key: string, [ _, value ]: [ ReadableStream<Uint8Array>, ReadableStream<Uint8Array> ]) {
		await fsPromises.mkdir(this._basePath, {
			recursive: true,
		});
		const file = await fsPromises.open(this._getKeyPath(key), 'w');
		try {
			for await (const chunk of value) {
				await file.write(chunk);
			}
		} finally {
			await file.close();
		}
	}

	async delete(key: string) {
		await fsPromises.unlink(this._getKeyPath(key));
	}
}

async function reallyFetchCid(cid: string): Promise<[ ReadableStream<Uint8Array>, ReadableStream<Uint8Array> ]> {
	const response = await fetch('https://ipfs.io/ipfs/' + cid);
	return response.body!.tee();
}

const cachedReallyFetchCid = pMemoize(reallyFetchCid, {
	cache: new FsCache(),
});

export async function fetchCid(cidOrPath: string): Promise<AsyncIterable<Uint8Array>> {
	if (cidOrPath.includes('/')) {
		const file = await fsPromises.open(cidOrPath, 'r');
		return file.readableWebStream({
			type: 'bytes',
		});
	}

	const [ readable, unused ] = await cachedReallyFetchCid(cidOrPath);
	await unused?.cancel();
	return readable;
}
