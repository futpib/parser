import invariant from 'invariant';
import { createArrayParser } from './arrayParser.js';
import { createOptionalParser } from './optionalParser.js';
import { type Parser, setParserName } from './parser.js';
import { promiseCompose } from './promiseCompose.js';
import { createTupleParser } from './tupleParser.js';
import {
	zip64EndOfCentralDirectoryLocatorParser, zip64EndOfCentralDirectoryRecordParser, zipArchiveDecryptionHeaderParser, zipArchiveExtraDataRecordParser, zipCentralDirectoryHeaderParser, zipEndOfCentralDirectoryRecordParser, zipFromZipSegments, zipLocalFileParser,
} from './zipParser.js';
import { type Apk, type ApkSigningBlock, type ApkSigningBlockPair } from './apk.js';
import { createFixedLengthSequenceParser } from './fixedLengthSequenceParser.js';
import { parserCreatorCompose } from './parserCreatorCompose.js';
import { createExactSequenceParser } from './exactSequenceParser.js';
import { createSliceBoundedParser } from './sliceBoundedParser.js';
import { createDisjunctionParser } from './disjunctionParser.js';
import { createExactElementParser } from './exactElementParser.js';

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

const createUint32LengthPrefixedSliceBoundedParser = <T>(innerParser: Parser<T, Uint8Array>): Parser<T, Uint8Array> => createUint32LengthPrefixedParser(
	length => createSliceBoundedParser(innerParser, length),
);

const createUint32LengthPrefixedSliceBoundedArrayParser = <T>(innerParser: Parser<T, Uint8Array>): Parser<T[], Uint8Array> => createUint32LengthPrefixedSliceBoundedParser(createArrayParser(innerParser));

type ApkSigningBlockZeroPaddingPair = {
	type: 'zeroPadding';
	length: number;
};

const createApkSigningBlockZeroPaddingPairInnerParser = (length: number): Parser<ApkSigningBlockZeroPaddingPair, Uint8Array> => promiseCompose(
	createTupleParser([
		createExactSequenceParser<Uint8Array>(Buffer.from('77657242', 'hex')),
		createFixedLengthSequenceParser(length - 4),
	]),
	([ _magic, zeroPadding ]) => ({ type: 'zeroPadding', length: zeroPadding.length }),
);

type ApkSigningBlockSignatureV2Pair = {
	type: 'signatureV2';
	signers: ApkSignatureSchemeV2Signer[];
};

const createApkSigningBlockSignatureV2PairInnerParser = (length: number): Parser<ApkSigningBlockSignatureV2Pair, Uint8Array> => {
	const apkSigningBlockSignatureV2PairInnerParser = promiseCompose(
		createTupleParser([
			createExactSequenceParser<Uint8Array>(Buffer.from('1a870971', 'hex')),
			apkSignatureSchemeV2SignersParser,
		]),
		([ _magic, signers = [] ]) => ({ type: 'signatureV2' as const, signers }),
	);

	return setParserName(apkSigningBlockSignatureV2PairInnerParser, 'apkSigningBlockSignatureV2PairInnerParser');
};

type ApkSigningBlockGenericPair = {
	type: 'generic';
	pair: ApkSigningBlockPair;
};

const createApkSigningBlockGenericPairInnerParser = (length: number): Parser<ApkSigningBlockGenericPair, Uint8Array> => promiseCompose(
	createTupleParser([
		uint32LEParser,
		createFixedLengthSequenceParser(length - 4),
	]),
	([ id, value ]) => ({ type: 'generic', pair: { id, value } }),
);

type ApkSigningBlockPairType =
	| ApkSigningBlockZeroPaddingPair
	| ApkSigningBlockSignatureV2Pair
	| ApkSigningBlockGenericPair
;

const createApkSigningBlockPairInnerParser = (length: number): Parser<ApkSigningBlockPairType, Uint8Array> => createDisjunctionParser([
	createApkSigningBlockZeroPaddingPairInnerParser(length),
	createApkSigningBlockSignatureV2PairInnerParser(length),
	createApkSigningBlockGenericPairInnerParser(length),
]);

const apkSigningBlockPairParser: Parser<ApkSigningBlockPairType, Uint8Array> = createUint64LengthPrefixedParser(
	length => createApkSigningBlockPairInnerParser(Number(length)),
);

setParserName(apkSigningBlockPairParser, 'apkSigningBlockPairParser');

const apkSigningBlockPairsParser: Parser<ApkSigningBlockPairType[], Uint8Array> = createArrayParser(apkSigningBlockPairParser);

const apkSigningBlockParser: Parser<ApkSigningBlock, Uint8Array> = createUint64LengthPrefixedParser(
	sizeOfBlock => promiseCompose(
		createTupleParser([
			apkSigningBlockPairsParser,
			uint64LEParser,
			createExactSequenceParser<Uint8Array>(Buffer.from('APK Sig Block 42', 'utf8')),
		]),
		async ([ pairs, sizeOfBlockRepeated, _magic ]) => {
			invariant(sizeOfBlock === sizeOfBlockRepeated, 'Size of block mismatch: %s !== %s.', sizeOfBlock, sizeOfBlockRepeated);

			const zeroPaddingPair = pairs.find(pair => pair.type === 'zeroPadding');
			const signatureV2Pair = pairs.find(pair => pair.type === 'signatureV2');

			const genericPairs = (
				pairs
					.filter(pair => (
						pair !== zeroPaddingPair
							&& pair !== signatureV2Pair
					))
					.map(pair => {
						invariant(pair.type === 'generic', 'Expected generic pair, got %s.', pair.type);
						return pair.pair;
					})
			);

			return {
				zeroPaddingLength: zeroPaddingPair?.length,
				signatureV2: signatureV2Pair?.signers,
				pairs: genericPairs,
			};
		},
	),
);

type ApkSignatureSchemeV2Digest = {
	signatureAlgorithmId: number;
	digest: Uint8Array;
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

const apkSignatureSchemeV2DigestsParser = createUint32LengthPrefixedSliceBoundedArrayParser(
	apkSignatureSchemeV2DigestParser,
);

const apkSignatureSchemeV2CertificateParser = createUint32LengthPrefixedParser(
	certificateLength => createFixedLengthSequenceParser(certificateLength),
);

const apkSignatureSchemeV2CertificatesParser = createUint32LengthPrefixedSliceBoundedArrayParser(
	apkSignatureSchemeV2CertificateParser,
);

type ApkSignatureSchemeV2AdditionalAttribute = {
	id: number;
	value: Uint8Array;
};

const apkSignatureSchemeV2AdditionalAttributeParser = createUint32LengthPrefixedParser<ApkSignatureSchemeV2AdditionalAttribute>(
	pairLength => promiseCompose(
		createTupleParser([
			uint32LEParser,
			createFixedLengthSequenceParser(pairLength - 4),
		]),
		([ id, value ]) => ({ id, value }),
	),
);

const apkSignatureSchemeV2AdditionalAttributesParser = createUint32LengthPrefixedSliceBoundedArrayParser(
	apkSignatureSchemeV2AdditionalAttributeParser,
);

type ApkSignatureSchemeV2SignedData = {
	digests: ApkSignatureSchemeV2Digest[];
	certificates: Uint8Array[];
	additionalAttributes: ApkSignatureSchemeV2AdditionalAttribute[];
};

const apkSignatureSchemeV2SignedDataParser = createUint32LengthPrefixedSliceBoundedParser(
	promiseCompose(
		createTupleParser([
			apkSignatureSchemeV2DigestsParser,
			apkSignatureSchemeV2CertificatesParser,
			createOptionalParser(apkSignatureSchemeV2AdditionalAttributesParser),
			createArrayParser(createExactElementParser(0)),
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
	signatureAlgorithmId: number;
	signature: Uint8Array;
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

const apkSignatureSchemeV2SignaturesParser = createUint32LengthPrefixedSliceBoundedArrayParser(
	apkSignatureSchemeV2SignatureParser,
);

setParserName(apkSignatureSchemeV2SignaturesParser, 'apkSignatureSchemeV2SignaturesParser');

const apkSignatureSchemeV2PublicKeyParser = createUint32LengthPrefixedParser(
	publicKeyLength => createFixedLengthSequenceParser(publicKeyLength),
);

setParserName(apkSignatureSchemeV2PublicKeyParser, 'apkSignatureSchemeV2PublicKeyParser');

type ApkSignatureSchemeV2Signer = {
	signedData: ApkSignatureSchemeV2SignedData;
	signatures: ApkSignatureSchemeV2Signature[];
	publicKey?: Uint8Array;
};

const apkSignatureSchemeV2SignerParser = createUint32LengthPrefixedSliceBoundedParser(
	promiseCompose(
		createTupleParser([
			apkSignatureSchemeV2SignedDataParser,
			apkSignatureSchemeV2SignaturesParser,
			apkSignatureSchemeV2PublicKeyParser,
		]),
		([
			signedData,
			signatures = [],
			publicKey,
		]): ApkSignatureSchemeV2Signer => ({
			signedData,
			signatures,
			publicKey,
		}),
	),
);

setParserName(apkSignatureSchemeV2SignerParser, 'apkSignatureSchemeV2SignerParser');

const apkSignatureSchemeV2SignersParser = createUint32LengthPrefixedSliceBoundedArrayParser(
	apkSignatureSchemeV2SignerParser,
);

setParserName(apkSignatureSchemeV2SignersParser, 'apkSignatureSchemeV2SignersParser');

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
