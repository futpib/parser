import invariant from 'invariant';
import { createArrayParser } from './arrayParser.js';
import { createOptionalParser } from './optionalParser.js';
import { type Parser, setParserName } from './parser.js';
import { promiseCompose } from './promiseCompose.js';
import { createTupleParser } from './tupleParser.js';
import {
	zip64EndOfCentralDirectoryLocatorParser,
	zip64EndOfCentralDirectoryRecordParser,
	zipArchiveDecryptionHeaderParser,
	zipArchiveExtraDataRecordParser,
	zipCentralDirectoryHeaderParser,
	zipEndOfCentralDirectoryRecordParser,
	zipFromZipSegments,
	zipLocalFileParser,
} from './zipParser.js';
import { ApkSignatureV2AdditionalAttribute, ApkSignatureV2Digest, ApkSignatureV2Signature, ApkSignatureV2SignedData, ApkSignatureV2Signer, type Apk, type ApkSigningBlock, type ApkSigningBlockPair } from './apk.js';
import { createFixedLengthSequenceParser } from './fixedLengthSequenceParser.js';
import { parserCreatorCompose } from './parserCreatorCompose.js';
import { createExactSequenceParser } from './exactSequenceParser.js';
import { createSliceBoundedParser } from './sliceBoundedParser.js';
import { createDisjunctionParser } from './disjunctionParser.js';
import { createExactElementParser } from './exactElementParser.js';
import { createParserConsumedSequenceParser } from './parserConsumedSequenceParser.js';

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
	signers: ApkSignatureV2Signer[];
};

const createApkSigningBlockSignatureV2PairInnerParser = (length: number): Parser<ApkSigningBlockSignatureV2Pair, Uint8Array> => {
	const apkSigningBlockSignatureV2PairInnerParser = promiseCompose(
		createTupleParser([
			createExactSequenceParser<Uint8Array>(Buffer.from('1a870971', 'hex')),
			apkSignatureV2SignersParser,
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

export const apkSigningBlockParser: Parser<ApkSigningBlock, Uint8Array> = createUint64LengthPrefixedParser(
	sizeOfBlock => promiseCompose(
		createTupleParser([
			apkSigningBlockPairsParser,
			uint64LEParser,
			createExactSequenceParser<Uint8Array>(Buffer.from('APK Sig Block 42', 'utf8')),
		]),
		async ([ pairs, sizeOfBlockRepeated, _magic ]): Promise<ApkSigningBlock> => {
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
				signatureV2: signatureV2Pair ? {
					signers: signatureV2Pair?.signers,
				} : undefined,
				pairs: genericPairs,
			};
		},
	),
);

const apkSignatureV2DigestParser = createUint32LengthPrefixedParser<ApkSignatureV2Digest>(
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

const apkSignatureV2DigestsParser = createUint32LengthPrefixedSliceBoundedArrayParser(
	apkSignatureV2DigestParser,
);

const apkSignatureV2CertificateParser = createUint32LengthPrefixedParser(
	certificateLength => createFixedLengthSequenceParser(certificateLength),
);

const apkSignatureV2CertificatesParser = createUint32LengthPrefixedSliceBoundedArrayParser(
	apkSignatureV2CertificateParser,
);

const apkSignatureV2AdditionalAttributeParser = createUint32LengthPrefixedParser<ApkSignatureV2AdditionalAttribute>(
	pairLength => promiseCompose(
		createTupleParser([
			uint32LEParser,
			createFixedLengthSequenceParser(pairLength - 4),
		]),
		([ id, value ]) => ({ id, value }),
	),
);

const apkSignatureV2AdditionalAttributesParser = createUint32LengthPrefixedSliceBoundedArrayParser(
	apkSignatureV2AdditionalAttributeParser,
);

const apkSignatureV2SignedDataParser = createUint32LengthPrefixedSliceBoundedParser(
	promiseCompose(
		createTupleParser([
			apkSignatureV2DigestsParser,
			apkSignatureV2CertificatesParser,
			createOptionalParser(apkSignatureV2AdditionalAttributesParser),
			createArrayParser(createExactElementParser(0)),
		]),
		([
			digests = [],
			certificates = [],
			additionalAttributes = [],
		]): ApkSignatureV2SignedData => ({
			digests,
			certificates,
			additionalAttributes,
		}),
	),
);

setParserName(apkSignatureV2SignedDataParser, 'apkSignatureV2SignedDataParser');

const apkSignatureV2SignatureParser = createUint32LengthPrefixedParser(
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
		]): ApkSignatureV2Signature => ({
			signatureAlgorithmId,
			signature,
		}),
	),
);

const apkSignatureV2SignaturesParser = createUint32LengthPrefixedSliceBoundedArrayParser(
	apkSignatureV2SignatureParser,
);

setParserName(apkSignatureV2SignaturesParser, 'apkSignatureV2SignaturesParser');

const apkSignatureV2PublicKeyParser = createUint32LengthPrefixedParser(
	publicKeyLength => createFixedLengthSequenceParser(publicKeyLength),
);

setParserName(apkSignatureV2PublicKeyParser, 'apkSignatureV2PublicKeyParser');

const apkSignatureV2SignerParser = createUint32LengthPrefixedSliceBoundedParser(
	promiseCompose(
		createTupleParser([
			apkSignatureV2SignedDataParser,
			apkSignatureV2SignaturesParser,
			apkSignatureV2PublicKeyParser,
		]),
		([
			signedData,
			signatures = [],
			publicKey,
		]): ApkSignatureV2Signer => ({
			signedData,
			signatures,
			publicKey,
		}),
	),
);

setParserName(apkSignatureV2SignerParser, 'apkSignatureV2SignerParser');

const apkSignatureV2SignersParser = createUint32LengthPrefixedSliceBoundedArrayParser(
	apkSignatureV2SignerParser,
);

setParserName(apkSignatureV2SignersParser, 'apkSignatureV2SignersParser');

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

export const apkSignableSectionsParser: Parser<Uint8Array[], Uint8Array> = promiseCompose(
	createTupleParser([
		createParserConsumedSequenceParser(
			createTupleParser([
				createArrayParser(zipLocalFileParser),
				createOptionalParser(zipArchiveDecryptionHeaderParser),
				createOptionalParser(zipArchiveExtraDataRecordParser),
			]),
		),
		createOptionalParser(apkSigningBlockParser),
		createParserConsumedSequenceParser(
			createTupleParser([
				createArrayParser(zipCentralDirectoryHeaderParser),
				createOptionalParser(zip64EndOfCentralDirectoryRecordParser),
				createOptionalParser(zip64EndOfCentralDirectoryLocatorParser),
			]),
		),
		createParserConsumedSequenceParser(
			zipEndOfCentralDirectoryRecordParser,
		),
	]),
	async ([
		[
			_zipEntries,
			zipEntriesUint8Array,
		],
		_apkSigningBlock,
		[
			_zipCentralDirectory,
			zipCentralDirectoryUint8Array,
		],
		[
			_zipEndOfCentralDirectory,
			zipEndOfCentralDirectoryUint8Array,
		],
	]) => [
		zipEntriesUint8Array,
		zipCentralDirectoryUint8Array,
		zipEndOfCentralDirectoryUint8Array,
	],
);
