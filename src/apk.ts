import { Zip } from './zip.js';

export type ApkSigningBlockPair = {
	id: number;
	value: Uint8Array;
};

export type ApkSigningBlock = {
	pairs: ApkSigningBlockPair[];
};

export type Apk = Zip & {
	signingBlock?: ApkSigningBlock;
};
