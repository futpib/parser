import { AndroidPackageSignatureV2AdditionalAttribute, AndroidPackageSignatureV2Digest, AndroidPackageSignatureV2Signature, AndroidPackageSignatureV2SignedData, AndroidPackageSignatureV2Signer, AndroidPackageSigningBlock } from "./androidPackage.js";
import { createArrayUnparser } from "./arrayUnparser.js";
import { createSequenceUnparser } from "./sequenceUnparser.js";
import { Unparser } from "./unparser.js";

const uint8ArrayUnparser = createSequenceUnparser<Uint8Array>();

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

const androidPackageSignatureV2DigestUnparser: Unparser<AndroidPackageSignatureV2Digest, Uint8Array> = createUint32LengthPrefixedUnparser(async function * (input, unparserContext) {
	yield * uint32LEUnparser(input.signatureAlgorithmId, unparserContext);
	yield * uint32LEUnparser(input.digest.length, unparserContext);
	yield input.digest;
});

const androidPackageSignatureV2DigestsUnparser = createUint32LengthPrefixedUnparser(createArrayUnparser(androidPackageSignatureV2DigestUnparser));

const androidPackageSignatureV2CertificateUnparser = createUint32LengthPrefixedUnparser(uint8ArrayUnparser);

const androidPackageSignatureV2CertificatesUnparser = createUint32LengthPrefixedUnparser(createArrayUnparser(androidPackageSignatureV2CertificateUnparser));

const androidPackageSignatureV2AdditionalAttributeUnparser: Unparser<AndroidPackageSignatureV2AdditionalAttribute, Uint8Array> = createUint32LengthPrefixedUnparser(async function * (input, unparserContext) {
	yield * uint32LEUnparser(input.id, unparserContext);
	yield input.value;
});

const androidPackageSignatureV2AdditionalAttributesUnparser = createUint32LengthPrefixedUnparser(createArrayUnparser(androidPackageSignatureV2AdditionalAttributeUnparser));

export const androidPackageSignatureV2SignedDataUnparser: Unparser<AndroidPackageSignatureV2SignedData, Uint8Array> = createUint32LengthPrefixedUnparser(async function * (input, unparserContext) {
	yield * androidPackageSignatureV2DigestsUnparser(input.digests, unparserContext);
	yield * androidPackageSignatureV2CertificatesUnparser(input.certificates, unparserContext);
	yield * androidPackageSignatureV2AdditionalAttributesUnparser(input.additionalAttributes, unparserContext);
	if (input.zeroPaddingLength) {
		yield Buffer.alloc(input.zeroPaddingLength);
	}
});

const androidPackageSignatureV2SignatureUnparser: Unparser<AndroidPackageSignatureV2Signature, Uint8Array> = createUint32LengthPrefixedUnparser(async function * (input, unparserContext) {
	yield * uint32LEUnparser(input.signatureAlgorithmId, unparserContext);
	yield * uint32LEUnparser(input.signature.length, unparserContext);
	yield input.signature;
});

const androidPackageSignatureV2SignaturesUnparser = createUint32LengthPrefixedUnparser(createArrayUnparser(androidPackageSignatureV2SignatureUnparser));

const androidPackageSignatureV2PublicKeyUnparser = createUint32LengthPrefixedUnparser(uint8ArrayUnparser);

const androidPackageSignatureV2SignerUnparser: Unparser<AndroidPackageSignatureV2Signer, Uint8Array> = createUint32LengthPrefixedUnparser(async function * (input, unparserContext) {
	yield * androidPackageSignatureV2SignedDataUnparser(input.signedData, unparserContext);
	yield * androidPackageSignatureV2SignaturesUnparser(input.signatures, unparserContext);
	yield * androidPackageSignatureV2PublicKeyUnparser(input.publicKey, unparserContext);
});

const androidPackageSignatureV2SignersUnparser = createUint32LengthPrefixedUnparser(createArrayUnparser(androidPackageSignatureV2SignerUnparser));

type AndroidPackageSigningBlockPair = {
	id: number;
	value: Uint8Array | AndroidPackageSignatureV2Signer[];
};

const androidPackageSigningBlockPairUnparser: Unparser<AndroidPackageSigningBlockPair, Uint8Array> = createUint64LengthPrefixedUnparser(async function * (input, unparserContext) {
	yield * uint32LEUnparser(input.id, unparserContext);
	if (input.value instanceof Uint8Array) {
		yield input.value;
	} else {
		yield * androidPackageSignatureV2SignersUnparser(input.value, unparserContext);
	}
});

const androidPackageSigningBlockPairsUnparser = createArrayUnparser(androidPackageSigningBlockPairUnparser);

export const androidPackageSigningBlockUnparser: Unparser<AndroidPackageSigningBlock, Uint8Array> = async function * (
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
	yield * androidPackageSigningBlockPairsUnparser(pairs, unparserContext);
	const sizeOfBlock = unparserContext.position - sizeOfBlockWriteLater.position + 16;
	yield * uint64LEUnparser(sizeOfBlock, unparserContext);
	yield * unparserContext.writeEarlier(sizeOfBlockWriteLater, uint64LEUnparser, sizeOfBlock);
	yield Buffer.from('APK Sig Block 42', 'utf8');
};
