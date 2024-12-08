import { type Zip } from './zip.js';

export type ApkSigningBlockPair = {
	id: number;
	value: Uint8Array;
};

export type ApkSignatureV2Digest = {
	signatureAlgorithmId: number;
	digest: Uint8Array;
};

export type ApkSignatureV2AdditionalAttribute = {
	id: number;
	value: Uint8Array;
};

export type ApkSignatureV2SignedData = {
	digests: ApkSignatureV2Digest[];
	certificates: Uint8Array[];
	additionalAttributes: ApkSignatureV2AdditionalAttribute[];
};

export type ApkSignatureV2Signature = {
	signatureAlgorithmId: number;
	signature: Uint8Array;
};

export type ApkSignatureV2Signer = {
	signedData: ApkSignatureV2SignedData;
	signatures: ApkSignatureV2Signature[];
	publicKey?: Uint8Array;
};

export type ApkSignatureV2 = {
	signers: ApkSignatureV2Signer[];
};

export type ApkSigningBlock = {
	zeroPaddingLength?: number;
	signatureV2?: ApkSignatureV2;
	pairs: ApkSigningBlockPair[];
};

export type Apk = Zip & {
	signingBlock?: ApkSigningBlock;
};
