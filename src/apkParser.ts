import { createArrayParser } from "./arrayParser.js";
import { createOptionalParser } from "./optionalParser.js";
import { Parser, runParser, setParserName } from "./parser.js";
import { promiseCompose } from "./promiseCompose.js";
import { createTupleParser } from "./tupleParser.js";
import { zip64EndOfCentralDirectoryLocatorParser, zip64EndOfCentralDirectoryRecordParser, zipArchiveDecryptionHeaderParser, zipArchiveExtraDataRecordParser, zipCentralDirectoryHeaderParser, zipEndOfCentralDirectoryRecordParser, zipFromZipSegments, zipLocalFileParser } from "./zipParser.js";
import { Apk, ApkSigningBlock, ApkSigningBlockPair } from "./apk.js";
import { createFixedLengthSequenceParser } from "./fixedLengthSequenceParser.js";
import { parserCreatorCompose } from "./parserCreatorCompose.js";
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

const uint64LengthPrefixedParser: Parser<Uint8Array, Uint8Array> = parserCreatorCompose(
	() => uint64LEParser,
	length => createFixedLengthSequenceParser(length),
)();

const createApkSigningBlockPairInnerParser = (length: number): Parser<ApkSigningBlockPair, Uint8Array> => promiseCompose(
	createTupleParser([
		uint32LEParser,
		createFixedLengthSequenceParser(length - 4),
	]),
	([ id, value ]) => ({ id, value }),
);

const apkSigningBlockPairParser: Parser<ApkSigningBlockPair, Uint8Array> = promiseCompose(
	uint64LengthPrefixedParser,
	async uint8Array => runParser(createApkSigningBlockPairInnerParser(uint8Array.length), uint8Array, uint8ArrayInputCompanion),
);

const apkSigningBlockPairsParser: Parser<ApkSigningBlockPair[], Uint8Array> = createArrayParser(apkSigningBlockPairParser);

const apkSigningBlockParser: Parser<ApkSigningBlock, Uint8Array> = parserCreatorCompose(
	() => uint64LengthPrefixedParser,
	(uint8Array: Uint8Array) => async parserContext => {
		const buffer = Buffer.from(uint8Array);

		const signature = uint8Array.subarray(0, buffer.length - 24);
		const sizeOfBlockRepeatedBuffer = buffer.subarray(buffer.length - 24, buffer.length - 16);
		const magicBuffer = buffer.subarray(buffer.length - 16, buffer.length);

		const sizeOfBlockRepeated = sizeOfBlockRepeatedBuffer.readBigUInt64LE();
		const magic = magicBuffer.toString('utf8');

		parserContext.invariant(
			sizeOfBlockRepeated === BigInt(buffer.length),
			`sizeOfBlockRepeated (%s) === buffer.length (%s)`,
			sizeOfBlockRepeated,
			buffer.length,
		);

		parserContext.invariant(
			magic === 'APK Sig Block 42',
			`magic (%s) === 'APK Sig Block 42'`,
			magic,
		);

		const pairs = await runParser(apkSigningBlockPairsParser, signature, uint8ArrayInputCompanion);

		return {
			pairs,
		};
	},
)();

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
