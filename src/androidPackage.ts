import { type Zip } from './zip.js';

export type AndroidPackageSigningBlockPair = {
	id: number;
	value: Uint8Array;
};

export type AndroidPackageSignatureV2Digest = {
	signatureAlgorithmId: number;
	digest: Uint8Array;
};

export type AndroidPackageSignatureV2AdditionalAttribute = {
	id: number;
	value: Uint8Array;
};

export type AndroidPackageSignatureV2SignedData = {
	digests: AndroidPackageSignatureV2Digest[];
	certificates: Uint8Array[];
	additionalAttributes: AndroidPackageSignatureV2AdditionalAttribute[];
	zeroPaddingLength?: number;
};

export type AndroidPackageSignatureV2Signature = {
	signatureAlgorithmId: number;
	signature: Uint8Array;
};

export type AndroidPackageSignatureV2Signer = {
	signedData: AndroidPackageSignatureV2SignedData;
	signatures: AndroidPackageSignatureV2Signature[];
	publicKey: Uint8Array;
};

export type AndroidPackageSignatureV2 = {
	signers: AndroidPackageSignatureV2Signer[];
};

export type AndroidPackageSigningBlock = {
	pairs: AndroidPackageSigningBlockPair[];
	signatureV2?: AndroidPackageSignatureV2;
	zeroPaddingLength?: number;
};

export type AndroidPackage = Zip & {
	signingBlock?: AndroidPackageSigningBlock;
};
