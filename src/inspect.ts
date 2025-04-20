import { inspect as nodeInspect } from 'node:util';

export const inspect = (value: unknown) => {
	if (value instanceof Uint8Array) {
		value = Buffer.from(value);
	}

	return nodeInspect(value);
}
