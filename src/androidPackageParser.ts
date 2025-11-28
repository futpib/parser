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
	type ZipCentralDirectoryHeader,
	zipCentralDirectoryHeaderParser,
	type ZipEndOfCentralDirectoryRecord,
	zipEndOfCentralDirectoryRecordParser,
	zipFromZipSegments,
	type ZipLocalFile,
	zipLocalFileParser,
} from './zipParser.js';
import {
	type AndroidPackageSignatureV2AdditionalAttribute, type AndroidPackageSignatureV2Digest, type AndroidPackageSignatureV2Signature, type AndroidPackageSignatureV2SignedData, type AndroidPackageSignatureV2Signer, type AndroidPackage, type AndroidPackageSigningBlock, type AndroidPackageSigningBlockPair,
} from './androidPackage.js';
import { createFixedLengthSequenceParser } from './fixedLengthSequenceParser.js';
import { parserCreatorCompose } from './parserCreatorCompose.js';
import { createExactSequenceParser } from './exactSequenceParser.js';
import { createSliceBoundedParser } from './sliceBoundedParser.js';
import { createDisjunctionParser } from './disjunctionParser.js';
import { createExactElementParser } from './exactElementParser.js';
import { createParserConsumedSequenceParser } from './parserConsumedSequenceParser.js';
import { createDebugLogInputParser } from './debugLogInputParser.js';
import { createDebugLogParser } from './debugLogParser.js';
import { createElementParser } from './elementParser.js';

// https://source.android.com/docs/security/features/androidPackagesigning/v2#androidPackage-signing-block

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

const createUint32LengthPrefixedSliceBoundedParser = <T>(innerParser: Parser<T, Uint8Array>): Parser<T, Uint8Array> => createUint32LengthPrefixedParser(length => createSliceBoundedParser(innerParser, length));

const createUint32LengthPrefixedSliceBoundedArrayParser = <T>(innerParser: Parser<T, Uint8Array>): Parser<T[], Uint8Array> => createUint32LengthPrefixedSliceBoundedParser(createArrayParser(innerParser));

type AndroidPackageSigningBlockZeroPaddingPair = {
	type: 'zeroPadding';
	length: number;
};

const createAndroidPackageSigningBlockZeroPaddingPairInnerParser = (length: number): Parser<AndroidPackageSigningBlockZeroPaddingPair, Uint8Array> => {
	const androidPackageSigningBlockZeroPaddingPairInnerParser: Parser<AndroidPackageSigningBlockZeroPaddingPair, Uint8Array> = promiseCompose(
		createTupleParser([
			createExactSequenceParser<Uint8Array>(Buffer.from('77657242', 'hex')),
			createFixedLengthSequenceParser(length - 4),
		]),
		([ _magic, zeroPadding ]) => ({ type: 'zeroPadding', length: zeroPadding.length }),
	);

	setParserName(androidPackageSigningBlockZeroPaddingPairInnerParser, 'androidPackageSigningBlockZeroPaddingPairInnerParser');

	return androidPackageSigningBlockZeroPaddingPairInnerParser;
};

type AndroidPackageSigningBlockSignatureV2Pair = {
	type: 'signatureV2';
	signers: AndroidPackageSignatureV2Signer[];
};

const createAndroidPackageSigningBlockSignatureV2PairInnerParser = (length: number): Parser<AndroidPackageSigningBlockSignatureV2Pair, Uint8Array> => {
	const androidPackageSigningBlockSignatureV2PairInnerParser = promiseCompose(
		createTupleParser([
			createExactSequenceParser<Uint8Array>(Buffer.from('1a870971', 'hex')),
			androidPackageSignatureV2SignersParser,
		]),
		([ _magic, signers = [] ]) => ({ type: 'signatureV2' as const, signers }),
	);

	return setParserName(androidPackageSigningBlockSignatureV2PairInnerParser, 'androidPackageSigningBlockSignatureV2PairInnerParser');
};

type AndroidPackageSigningBlockGenericPair = {
	type: 'generic';
	pair: AndroidPackageSigningBlockPair;
};

const createAndroidPackageSigningBlockGenericPairInnerParser = (length: number): Parser<AndroidPackageSigningBlockGenericPair, Uint8Array> => promiseCompose(
	createTupleParser([
		uint32LEParser,
		createFixedLengthSequenceParser(length - 4),
	]),
	([ id, value ]) => ({ type: 'generic', pair: { id, value } }),
);

type AndroidPackageSigningBlockPairType =
	| AndroidPackageSigningBlockZeroPaddingPair
	| AndroidPackageSigningBlockSignatureV2Pair
	| AndroidPackageSigningBlockGenericPair
;

const createAndroidPackageSigningBlockPairInnerParser = (length: number): Parser<AndroidPackageSigningBlockPairType, Uint8Array> => {
	const androidPackageSigningBlockPairInnerParser: Parser<AndroidPackageSigningBlockPairType, Uint8Array> = promiseCompose(
		createTupleParser([
			parserContext => {
				parserContext.invariant(
					Number.isSafeInteger(length),
					'Signing block length is unreasonable: %s.',
					length,
				);
			},
			createDisjunctionParser([
				createAndroidPackageSigningBlockZeroPaddingPairInnerParser(length),
				createAndroidPackageSigningBlockSignatureV2PairInnerParser(length),
				createAndroidPackageSigningBlockGenericPairInnerParser(length),
			]),
		]),
		([
			_lengthInvariant,
			pair,
		]) => pair,
	);

	setParserName(androidPackageSigningBlockPairInnerParser, 'androidPackageSigningBlockPairInnerParser');

	return androidPackageSigningBlockPairInnerParser;
};

const androidPackageSigningBlockPairParser: Parser<AndroidPackageSigningBlockPairType, Uint8Array> = createUint64LengthPrefixedParser(length => createAndroidPackageSigningBlockPairInnerParser(Number(length)));

setParserName(androidPackageSigningBlockPairParser, 'androidPackageSigningBlockPairParser');

const androidPackageSigningBlockPairsParser: Parser<AndroidPackageSigningBlockPairType[], Uint8Array> = createArrayParser(androidPackageSigningBlockPairParser);

export const androidPackageSigningBlockParser: Parser<AndroidPackageSigningBlock, Uint8Array> = createUint64LengthPrefixedParser(sizeOfBlock => promiseCompose(
	createTupleParser([
		androidPackageSigningBlockPairsParser,
		uint64LEParser,
		createExactSequenceParser<Uint8Array>(Buffer.from('APK Sig Block 42', 'utf8')),
	]),
	async ([
		pairs,
		sizeOfBlockRepeated,
		_magic,
	]): Promise<AndroidPackageSigningBlock> => {
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
			signatureV2: signatureV2Pair
				? {
					signers: signatureV2Pair?.signers,
				}
				: undefined,
			pairs: genericPairs,
		};
	},
));

const androidPackageSignatureV2DigestParser = createUint32LengthPrefixedParser<AndroidPackageSignatureV2Digest>(pairLength => promiseCompose(
	createTupleParser([
		uint32LEParser,
		createUint32LengthPrefixedParser(digestLength => createFixedLengthSequenceParser(digestLength)),
	]),
	([ signatureAlgorithmId, digest ]) => ({ signatureAlgorithmId, digest }),
));

const androidPackageSignatureV2DigestsParser = createUint32LengthPrefixedSliceBoundedArrayParser(androidPackageSignatureV2DigestParser);

setParserName(androidPackageSignatureV2DigestsParser, 'androidPackageSignatureV2DigestsParser');

const androidPackageSignatureV2CertificateParser = createUint32LengthPrefixedParser(certificateLength => createFixedLengthSequenceParser(certificateLength));

setParserName(androidPackageSignatureV2CertificateParser, 'androidPackageSignatureV2CertificateParser');

const androidPackageSignatureV2CertificatesParser = createUint32LengthPrefixedSliceBoundedArrayParser(androidPackageSignatureV2CertificateParser);

setParserName(androidPackageSignatureV2CertificatesParser, 'androidPackageSignatureV2CertificatesParser');

const androidPackageSignatureV2AdditionalAttributeParser = createUint32LengthPrefixedParser<AndroidPackageSignatureV2AdditionalAttribute>(pairLength => promiseCompose(
	createTupleParser([
		uint32LEParser,
		createFixedLengthSequenceParser(pairLength - 4),
	]),
	([ id, value ]) => ({ id, value }),
));

setParserName(androidPackageSignatureV2AdditionalAttributeParser, 'androidPackageSignatureV2AdditionalAttributeParser');

const androidPackageSignatureV2AdditionalAttributesParser = createUint32LengthPrefixedSliceBoundedArrayParser(androidPackageSignatureV2AdditionalAttributeParser);

setParserName(androidPackageSignatureV2AdditionalAttributesParser, 'androidPackageSignatureV2AdditionalAttributesParser');

const androidPackageSignatureV2SignedDataParser = createUint32LengthPrefixedSliceBoundedParser(promiseCompose(
	createTupleParser([
		androidPackageSignatureV2DigestsParser,
		androidPackageSignatureV2CertificatesParser,
		androidPackageSignatureV2AdditionalAttributesParser,
		createArrayParser(createExactElementParser(0)),
	]),
	([
		digests,
		certificates,
		additionalAttributes,
		zeroPadding,
	]): AndroidPackageSignatureV2SignedData => ({
		digests,
		certificates,
		additionalAttributes,
		zeroPaddingLength: zeroPadding.length,
	}),
));

setParserName(androidPackageSignatureV2SignedDataParser, 'androidPackageSignatureV2SignedDataParser');

const androidPackageSignatureV2SignatureParser = createUint32LengthPrefixedParser(signatureLength => promiseCompose(
	createTupleParser([
		uint32LEParser,
		createUint32LengthPrefixedParser(signatureLength => createFixedLengthSequenceParser(signatureLength)),
	]),
	([
		signatureAlgorithmId,
		signature,
	]): AndroidPackageSignatureV2Signature => ({
		signatureAlgorithmId,
		signature,
	}),
));

const androidPackageSignatureV2SignaturesParser = createUint32LengthPrefixedSliceBoundedArrayParser(androidPackageSignatureV2SignatureParser);

setParserName(androidPackageSignatureV2SignaturesParser, 'androidPackageSignatureV2SignaturesParser');

const androidPackageSignatureV2PublicKeyParser = createUint32LengthPrefixedParser(publicKeyLength => createFixedLengthSequenceParser(publicKeyLength));

setParserName(androidPackageSignatureV2PublicKeyParser, 'androidPackageSignatureV2PublicKeyParser');

const androidPackageSignatureV2SignerParser = createUint32LengthPrefixedSliceBoundedParser(promiseCompose(
	createTupleParser([
		androidPackageSignatureV2SignedDataParser,
		androidPackageSignatureV2SignaturesParser,
		androidPackageSignatureV2PublicKeyParser,
	]),
	([
		signedData,
		signatures = [],
		publicKey,
	]): AndroidPackageSignatureV2Signer => ({
		signedData,
		signatures,
		publicKey,
	}),
));

setParserName(androidPackageSignatureV2SignerParser, 'androidPackageSignatureV2SignerParser');

const androidPackageSignatureV2SignersParser = createUint32LengthPrefixedSliceBoundedArrayParser(androidPackageSignatureV2SignerParser);

setParserName(androidPackageSignatureV2SignersParser, 'androidPackageSignatureV2SignersParser');

const androidPackageParser_ = createTupleParser([
	createArrayParser(zipLocalFileParser),
	createOptionalParser(zipArchiveDecryptionHeaderParser),
	createOptionalParser(zipArchiveExtraDataRecordParser),
	createOptionalParser(androidPackageSigningBlockParser),
	createArrayParser(zipCentralDirectoryHeaderParser),
	createOptionalParser(zip64EndOfCentralDirectoryRecordParser),
	createOptionalParser(zip64EndOfCentralDirectoryLocatorParser),
	zipEndOfCentralDirectoryRecordParser,
]);

setParserName(androidPackageParser_, 'androidPackageParser_');

export const androidPackageParser: Parser<AndroidPackage, Uint8Array> = promiseCompose(
	androidPackageParser_,
	async ([
		zipLocalFiles,
		zipArchiveDecryptionHeader,
		zipArchiveExtraDataRecord,
		androidPackageSigningBlock,
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
			signingBlock: androidPackageSigningBlock,
		};
	},
);

setParserName(androidPackageParser, 'androidPackageParser');

export type AndroidPackageSignableSections = {
	zipLocalFiles: ZipLocalFile[];
	zipLocalFilesZeroPaddingLength: number;
	androidPackageSigningBlock?: AndroidPackageSigningBlock;
	zipCentralDirectory: ZipCentralDirectoryHeader[];
	zipEndOfCentralDirectory: ZipEndOfCentralDirectoryRecord;

	zipLocalFilesUint8Array: Uint8Array;
	androidPackageSigningBlockUint8Array?: Uint8Array;
	zipCentralDirectoryUint8Array: Uint8Array;
	zipEndOfCentralDirectoryUint8Array: Uint8Array;
};

export const androidPackageSignableSectionsParser: Parser<AndroidPackageSignableSections, Uint8Array> = promiseCompose(
	createTupleParser([
		createParserConsumedSequenceParser(createTupleParser([
			createArrayParser(zipLocalFileParser),
			createOptionalParser(zipArchiveDecryptionHeaderParser),
			createOptionalParser(zipArchiveExtraDataRecordParser),
		])),
		createArrayParser(createExactElementParser(0)),
		createOptionalParser(createParserConsumedSequenceParser(androidPackageSigningBlockParser)),
		createParserConsumedSequenceParser(createTupleParser([
			createArrayParser(zipCentralDirectoryHeaderParser),
			createOptionalParser(zip64EndOfCentralDirectoryRecordParser),
			createOptionalParser(zip64EndOfCentralDirectoryLocatorParser),
		])),
		createParserConsumedSequenceParser(zipEndOfCentralDirectoryRecordParser),
	]),
	async ([
		[
			[
				zipLocalFiles,
			],
			zipLocalFilesUint8Array,
		],
		zipLocalFilesZeroPadding,
		[
			androidPackageSigningBlock = undefined,
			androidPackageSigningBlockUint8Array = undefined,
		] = [],
		[
			[
				zipCentralDirectory,
			],
			zipCentralDirectoryUint8Array,
		],
		[
			zipEndOfCentralDirectory,
			zipEndOfCentralDirectoryUint8Array,
		],
	]) => ({
		zipLocalFiles,
		zipLocalFilesZeroPaddingLength: zipLocalFilesZeroPadding.length,
		androidPackageSigningBlock,
		zipCentralDirectory,
		zipEndOfCentralDirectory,

		zipLocalFilesUint8Array,
		androidPackageSigningBlockUint8Array,
		zipCentralDirectoryUint8Array,
		zipEndOfCentralDirectoryUint8Array,
	}),
);

setParserName(androidPackageSignableSectionsParser, 'androidPackageSignableSectionsParser');
