import { ApkSignatureV2AdditionalAttribute, ApkSignatureV2Digest, ApkSignatureV2Signature, ApkSignatureV2SignedData, ApkSignatureV2Signer, ApkSigningBlock } from "./apk.js";
import { createArrayUnparser } from "./arrayUnparser.js";
import { Unparser } from "./unparser.js";

const uint32LEUnparser: Unparser<number, Uint8Array> = async function * (input) {
	const buffer = Buffer.alloc(4);
	buffer.writeUInt32LE(input);
	yield buffer;
}

const uint64LEUnparser: Unparser<number | bigint, Uint8Array> = async function * (input) {
	const buffer = Buffer.alloc(8);
	buffer.writeBigUInt64LE(BigInt(input));
	yield buffer;
};

const createUint32LengthPrefixedUnparser = <T>(innerUnparser: Unparser<T, Uint8Array>): Unparser<T, Uint8Array> => async function * (input, unparserContext) {
	const length = yield * unparserContext.writeLater(4);
	yield * innerUnparser(input, unparserContext);
	yield * unparserContext.writeEarlier(length, uint32LEUnparser, unparserContext.position - length.positionEnd);
};

const createUint64LengthPrefixedUnparser = <T>(innerUnparser: Unparser<T, Uint8Array>): Unparser<T, Uint8Array> => async function * (input, unparserContext) {
	const length = yield * unparserContext.writeLater(8);
	yield * innerUnparser(input, unparserContext);
	yield * unparserContext.writeEarlier(length, uint64LEUnparser, unparserContext.position - length.positionEnd);
};

const apkSignatureV2DigestUnparser: Unparser<ApkSignatureV2Digest, Uint8Array> = createUint32LengthPrefixedUnparser(async function * (input, unparserContext) {
	yield * uint32LEUnparser(input.signatureAlgorithmId, unparserContext);
	yield * uint32LEUnparser(input.digest.length, unparserContext);
	yield input.digest;
});

const apkSignatureV2DigestsUnparser = createUint32LengthPrefixedUnparser(createArrayUnparser(apkSignatureV2DigestUnparser));

const apkSignatureV2CertificateUnparser: Unparser<Uint8Array, Uint8Array> = createUint32LengthPrefixedUnparser(async function * (input) {
	yield input;
});

const apkSignatureV2CertificatesUnparser = createUint32LengthPrefixedUnparser(createArrayUnparser(apkSignatureV2CertificateUnparser));

const apkSignatureV2AdditionalAttributeUnparser: Unparser<ApkSignatureV2AdditionalAttribute, Uint8Array> = createUint32LengthPrefixedUnparser(async function * (input, unparserContext) {
	yield * uint32LEUnparser(input.id, unparserContext);
	yield input.value;
});

const apkSignatureV2AdditionalAttributesUnparser = createUint32LengthPrefixedUnparser(createArrayUnparser(apkSignatureV2AdditionalAttributeUnparser));

const apkSignatureV2SignedDataUnparser: Unparser<ApkSignatureV2SignedData, Uint8Array> = createUint32LengthPrefixedUnparser(async function * (input, unparserContext) {
	yield * apkSignatureV2DigestsUnparser(input.digests, unparserContext);
	yield * apkSignatureV2CertificatesUnparser(input.certificates, unparserContext);
	yield * apkSignatureV2AdditionalAttributesUnparser(input.additionalAttributes, unparserContext);
	if (input.zeroPaddingLength) {
		yield Buffer.alloc(input.zeroPaddingLength);
	}
});

const apkSignatureV2SignatureUnparser: Unparser<ApkSignatureV2Signature, Uint8Array> = createUint32LengthPrefixedUnparser(async function * (input, unparserContext) {
	yield * uint32LEUnparser(input.signatureAlgorithmId, unparserContext);
	yield * uint32LEUnparser(input.signature.length, unparserContext);
	yield input.signature;
});

const apkSignatureV2SignaturesUnparser = createUint32LengthPrefixedUnparser(createArrayUnparser(apkSignatureV2SignatureUnparser));

const apkSignatureV2PublicKeyUnparser: Unparser<Uint8Array, Uint8Array> = createUint32LengthPrefixedUnparser(async function * (input) {
	yield input;
});

const apkSignatureV2SignerUnparser: Unparser<ApkSignatureV2Signer, Uint8Array> = createUint32LengthPrefixedUnparser(async function * (input, unparserContext) {
	yield * apkSignatureV2SignedDataUnparser(input.signedData, unparserContext);
	yield * apkSignatureV2SignaturesUnparser(input.signatures, unparserContext);
	yield * apkSignatureV2PublicKeyUnparser(input.publicKey, unparserContext);
});

const apkSignatureV2SignersUnparser = createUint32LengthPrefixedUnparser(createArrayUnparser(apkSignatureV2SignerUnparser));

type ApkSigningBlockPair = {
	id: number;
	value: Uint8Array | ApkSignatureV2Signer[];
};

const apkSigningBlockPairUnparser: Unparser<ApkSigningBlockPair, Uint8Array> = createUint64LengthPrefixedUnparser(async function * (input, unparserContext) {
	yield * uint32LEUnparser(input.id, unparserContext);
	if (input.value instanceof Uint8Array) {
		yield input.value;
	} else {
		yield * apkSignatureV2SignersUnparser(input.value, unparserContext);
	}
});

const apkSigningBlockPairsUnparser = createArrayUnparser(apkSigningBlockPairUnparser);

export const apkSigningBlockUnparser: Unparser<ApkSigningBlock, Uint8Array> = async function * (
	input,
	unparserContext,
) {
	const pairs = [
		...input.pairs,
		...(input.signatureV2 ? [
			{
				id: 0x7109871a,
				value: input.signatureV2!.signers,
			},
		] : []),
		...(input.zeroPaddingLength ? [
			{
				id: 0x42726577,
				value: Buffer.alloc(input.zeroPaddingLength),
			},
		] : []),
	];

	const sizeOfBlockWriteLater = yield * unparserContext.writeLater(8);
	yield * apkSigningBlockPairsUnparser(pairs, unparserContext);
	const sizeOfBlock = unparserContext.position - sizeOfBlockWriteLater.position + 16;
	yield * uint64LEUnparser(sizeOfBlock, unparserContext);
	yield * unparserContext.writeEarlier(sizeOfBlockWriteLater, uint64LEUnparser, sizeOfBlock);
	yield Buffer.from('APK Sig Block 42', 'utf8');
};
