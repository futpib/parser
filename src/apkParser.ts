import { createArrayParser } from "./arrayParser.js";
import { createOptionalParser } from "./optionalParser.js";
import { Parser, runParser, setParserName } from "./parser.js";
import { promiseCompose } from "./promiseCompose.js";
import { createTupleParser } from "./tupleParser.js";
import { zip64EndOfCentralDirectoryLocatorParser, zip64EndOfCentralDirectoryRecordParser, zipArchiveDecryptionHeaderParser, zipArchiveExtraDataRecordParser, zipCentralDirectoryHeaderParser, zipEndOfCentralDirectoryRecordParser, zipFromZipSegments, zipLocalFileParser } from "./zipParser.js";
import { Apk, ApkSigningBlock, ApkSigningBlockPair } from "./apk.js";
import { createFixedLengthSequenceParser } from "./fixedLengthSequenceParser.js";
import { parserCreatorCompose } from "./parserCreatorCompose.js";
import { createExactSequenceParser } from "./exactSequenceParser.js";
import { createSliceBoundedParser } from "./sliceBoundedParser.js";
import { uint8ArrayInputCompanion } from "./inputCompanion.js";

// https://source.android.com/docs/security/features/apksigning/v2#apk-signing-block

const uint32LEParser: Parser<number, Uint8Array> = promiseCompose(
	createFixedLengthSequenceParser(4),
	array => Buffer.from(array).readUInt32LE(),
);

setParserName(uint32LEParser, 'uint32LEParser');

const uint64LEParser: Parser<bigint, Uint8Array> = promiseCompose(
	createFixedLengthSequenceParser(8),
	array => Buffer.from(array).readBigUInt64LE(),
);

setParserName(uint64LEParser, 'uint64LEParser');

const createUint32LengthPrefixedParser = <T>(createInnerParser: (length: number) => Parser<T, Uint8Array>): Parser<T, Uint8Array> => parserCreatorCompose(
	() => uint32LEParser,
	length => createInnerParser(length),
)();

const createUint64LengthPrefixedParser = <T>(createInnerParser: (length: bigint) => Parser<T, Uint8Array>): Parser<T, Uint8Array> => parserCreatorCompose(
	() => uint64LEParser,
	length => createInnerParser(length),
)();

const createApkSigningBlockPairInnerParser = (length: number): Parser<ApkSigningBlockPair, Uint8Array> => promiseCompose(
	createTupleParser([
		uint32LEParser,
		createFixedLengthSequenceParser(length - 4),
	]),
	([ id, value ]) => ({ id, value }),
);

const apkSigningBlockPairParser: Parser<ApkSigningBlockPair, Uint8Array> = createUint64LengthPrefixedParser(
	length => createApkSigningBlockPairInnerParser(Number(length)),
);

const apkSigningBlockPairsParser: Parser<ApkSigningBlockPair[], Uint8Array> = createArrayParser(apkSigningBlockPairParser);

const apkSigningBlockParser: Parser<ApkSigningBlock, Uint8Array> = createUint64LengthPrefixedParser(
	_sizeOfBlock => promiseCompose(
		createTupleParser([
			apkSigningBlockPairsParser,
			uint64LEParser,
			createExactSequenceParser<Uint8Array>(Buffer.from('APK Sig Block 42', 'utf8')),
		]),
		async ([ pairs, _sizeOfBlockRepeated, _magic ]) => {
			const zeroPaddingPair = pairs.find(pair => pair.id === 0x42726577);
			const signatureV2Pair = pairs.find(pair => pair.id === 0x7109871a);

			pairs = pairs.filter(pair => (
				pair !== zeroPaddingPair
				&& pair !== signatureV2Pair
			));

			let signatureV2: undefined | ApkSignatureSchemeV2Block;

			if (signatureV2Pair?.value) {
				signatureV2 = await runParser(
					apkSignatureSchemeV2BlockParser,
					signatureV2Pair.value,
					uint8ArrayInputCompanion,
				);
			}

			return {
				zeroPaddingLength: zeroPaddingPair?.value.length,
				signatureV2,
				pairs,
			};
		},
	),
);

type ApkSignatureSchemeV2Digest = {
	signatureAlgorithmId: number,
	digest: Uint8Array,
};

const apkSignatureSchemeV2DigestParser = createUint32LengthPrefixedParser<ApkSignatureSchemeV2Digest>(
	pairLength => promiseCompose(
		createTupleParser([
			uint32LEParser,
			createUint32LengthPrefixedParser(
				digestLength => createFixedLengthSequenceParser(digestLength),
			),
		]),
		([ signatureAlgorithmId, digest ]) => ({ signatureAlgorithmId, digest }),
	),
);

const apkSignatureSchemeV2DigestsParser = createUint32LengthPrefixedParser(
	digestsLength => createSliceBoundedParser(createArrayParser(apkSignatureSchemeV2DigestParser), digestsLength),
);

const apkSignatureSchemeV2CertificateParser = createUint32LengthPrefixedParser(
	certificateLength => createFixedLengthSequenceParser(certificateLength),
);

const apkSignatureSchemeV2CertificatesParser = createUint32LengthPrefixedParser(
	certificatesLength => createSliceBoundedParser(createArrayParser(apkSignatureSchemeV2CertificateParser), certificatesLength),
);

type ApkSignatureSchemeV2AdditionalAttribute = {
	id: number,
	value: Uint8Array,
};

const apkSignatureSchemeV2AdditionalAttributeParser = createUint32LengthPrefixedParser<ApkSignatureSchemeV2AdditionalAttribute>(
	pairLength => promiseCompose(
		createTupleParser([
			uint32LEParser,
			createUint32LengthPrefixedParser(
				valueLength => createFixedLengthSequenceParser(valueLength),
			),
		]),
		([ id, value ]) => ({ id, value }),
	),
);

const apkSignatureSchemeV2AdditionalAttributesParser = createUint32LengthPrefixedParser(
	attributesLength => createSliceBoundedParser(createArrayParser(apkSignatureSchemeV2AdditionalAttributeParser), attributesLength),
);

type ApkSignatureSchemeV2SignedData = {
	digests: ApkSignatureSchemeV2Digest[],
	certificates: Uint8Array[],
	additionalAttributes: ApkSignatureSchemeV2AdditionalAttribute[],
};

const apkSignatureSchemeV2SignedDataParser = createUint32LengthPrefixedParser(
	signedDataLength => promiseCompose(
		createTupleParser([
			apkSignatureSchemeV2DigestsParser,
			apkSignatureSchemeV2CertificatesParser,
			apkSignatureSchemeV2AdditionalAttributesParser,
		]),
		([
			digests = [],
			certificates = [],
			additionalAttributes = [],
		]): ApkSignatureSchemeV2SignedData => ({
			digests,
			certificates,
			additionalAttributes,
		}),
	),
);

setParserName(apkSignatureSchemeV2SignedDataParser, 'apkSignatureSchemeV2SignedDataParser');

type ApkSignatureSchemeV2Signature = {
	signatureAlgorithmId: number,
	signature: Uint8Array,
};

const apkSignatureSchemeV2SignatureParser = createUint32LengthPrefixedParser(
	signatureLength => promiseCompose(
		createTupleParser([
			uint32LEParser,
			createUint32LengthPrefixedParser(
				signatureLength => createFixedLengthSequenceParser(signatureLength),
			),
		]),
		([
			signatureAlgorithmId,
			signature,
		]): ApkSignatureSchemeV2Signature => ({
			signatureAlgorithmId,
			signature,
		}),
	),
);

const apkSignatureSchemeV2SignaturesParser = createUint32LengthPrefixedParser(
	signaturesLength => createSliceBoundedParser(createArrayParser(apkSignatureSchemeV2SignatureParser), signaturesLength),
);

setParserName(apkSignatureSchemeV2SignaturesParser, 'apkSignatureSchemeV2SignaturesParser');

const apkSignatureSchemeV2PublicKeyParser = createUint32LengthPrefixedParser(
	publicKeyLength => createFixedLengthSequenceParser(publicKeyLength),
);

setParserName(apkSignatureSchemeV2PublicKeyParser, 'apkSignatureSchemeV2PublicKeyParser');

type ApkSignatureSchemeV2Block = {
	signedData: ApkSignatureSchemeV2SignedData[],
	signatures: ApkSignatureSchemeV2Signature[],
	publicKey?: Uint8Array,
};

const apkSignatureSchemeV2BlockParser = createUint32LengthPrefixedParser(
	blockLength => promiseCompose(
		createTupleParser([
			createArrayParser(apkSignatureSchemeV2SignedDataParser),
			apkSignatureSchemeV2SignaturesParser,
			createOptionalParser(apkSignatureSchemeV2PublicKeyParser),
		]),
		([
			signedData,
			signatures = [],
			publicKey
		]): ApkSignatureSchemeV2Block => ({
			signedData: signedData.filter(data => (
				data.digests.length
					|| data.certificates.length
					|| data.additionalAttributes.length
			)),
			signatures,
			publicKey,
		}),
	),
);

const apkParser_ = createTupleParser([
	createArrayParser(zipLocalFileParser),
	createOptionalParser(zipArchiveDecryptionHeaderParser),
	createOptionalParser(zipArchiveExtraDataRecordParser),
	createOptionalParser(apkSigningBlockParser),
	createArrayParser(zipCentralDirectoryHeaderParser),
	createOptionalParser(zip64EndOfCentralDirectoryRecordParser),
	createOptionalParser(zip64EndOfCentralDirectoryLocatorParser),
	zipEndOfCentralDirectoryRecordParser,
]);

setParserName(apkParser_, 'apkParser_');

export const apkParser: Parser<Apk, Uint8Array> = promiseCompose(
	apkParser_,
	async ([
		zipLocalFiles,
		zipArchiveDecryptionHeader,
		zipArchiveExtraDataRecord,
		apkSigningBlock,
		zipCentralDirectoryHeaders,
		zip64EndOfCentralDirectoryRecord,
		zip64EndOfCentralDirectoryLocator,
		zipEndOfCentralDirectoryRecord,
	]) => {
		const zip = await zipFromZipSegments({
			zipLocalFiles,
			zipCentralDirectoryHeaders,
			zipEndOfCentralDirectoryRecord,
		});

		return {
			...zip,
			signingBlock: apkSigningBlock,
		};
	},
);

setParserName(apkParser, 'apkParser');
