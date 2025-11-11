import zlib from 'node:zlib';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import invariant from 'invariant';
import { createArrayParser } from './arrayParser.js';
import { createExactSequenceParser } from './exactSequenceParser.js';
import { type Parser, setParserName } from './parser.js';
import { createTupleParser } from './tupleParser.js';
import { promiseCompose } from './promiseCompose.js';
import { createFixedLengthSequenceParser } from './fixedLengthSequenceParser.js';
import { createOptionalParser } from './optionalParser.js';
import { parserCreatorCompose } from './parserCreatorCompose.js';
import {
	type Zip,
	type ZipCompression,
	type ZipDirectoryEntry,
	type ZipEntry,
	type ZipFileEntry,
} from './zip.js';
import { uint8ArrayAsyncIterableToUint8Array } from './uint8Array.js';
import { createNegativeLookaheadParser } from './negativeLookaheadParser.js';
import { createSequenceTerminatedSequenceParser } from './sequenceTerminatedSequenceParser.js';

// https://pkwaredownloads.blob.core.windows.net/pem/APPNOTE.txt

const uint16LEParser: Parser<number, Uint8Array> = promiseCompose(
	createFixedLengthSequenceParser(2),
	array => Buffer.from(array).readUInt16LE(),
);

setParserName(uint16LEParser, 'uint16LEParser');

const uint32LEParser: Parser<number, Uint8Array> = promiseCompose(
	createFixedLengthSequenceParser(4),
	array => Buffer.from(array).readUInt32LE(),
);

setParserName(uint32LEParser, 'uint32LEParser');

const dosDateTimeParser: Parser<Date, Uint8Array> = promiseCompose(
	createTupleParser([
		uint16LEParser,
		uint16LEParser,
	]),
	([ time, date ]) => new Date(Date.UTC(
		1980 + ((date >> 9) & 0x7F),
		((date >> 5) & 0xF) - 1,
		date & 0x1F,
		(time >> 11) & 0x1F,
		(time >> 5) & 0x3F,
		(time & 0x1F) * 2,
	)),
);

const zipCompressionMethodParser: Parser<ZipCompression, Uint8Array> = promiseCompose(
	uint16LEParser,
	compressionMethod => {
		if (compressionMethod === 0) {
			return 'store';
		}

		if (compressionMethod === 8) {
			return 'deflate';
		}

		invariant(false, 'Unsupported compression method %s', compressionMethod);
	},
);

export type ZipLocalFileHeader = {
	versionNeededToExtract: number;
	generalPurposeBitFlag: number;
	compressionMethod: ZipCompression;
	lastModifiedFile: Date;
	crc32: number;
	compressedSize: number;
	uncompressedSize: number;

	filePath: string;
	extraField: Uint8Array;
};

const zipLocalFileHeaderSignatureParser = createExactSequenceParser<Uint8Array>(Buffer.from('504b0304', 'hex'));

const zipLocalFileHeaderParser_ = createTupleParser([
	zipLocalFileHeaderSignatureParser,
	uint16LEParser,
	uint16LEParser,
	zipCompressionMethodParser,
	dosDateTimeParser,
	uint32LEParser,
	uint32LEParser,
	uint32LEParser,
	parserCreatorCompose(
		() => createTupleParser([
			uint16LEParser,
			uint16LEParser,
		]),
		([
			filePathLength,
			extraFieldLength,
		]) => createTupleParser([
			createFixedLengthSequenceParser(filePathLength),
			createFixedLengthSequenceParser(extraFieldLength),
		]),
	)(),
]);

setParserName(zipLocalFileHeaderParser_, 'zipLocalFileHeaderParser_');

const zipLocalFileHeaderParser: Parser<ZipLocalFileHeader, Uint8Array> = promiseCompose(
	zipLocalFileHeaderParser_,
	([
		_zipLocalFileHeaderSignature,
		versionNeededToExtract,
		generalPurposeBitFlag,
		compressionMethod,
		lastModifiedFile,
		crc32,
		compressedSize,
		uncompressedSize,
		[ filePath, extraField ],
	]) => ({
		versionNeededToExtract,
		generalPurposeBitFlag,
		compressionMethod,
		lastModifiedFile,
		crc32,
		compressedSize,
		uncompressedSize,
		filePath: Buffer.from(filePath).toString('utf8'),
		extraField,
	}),
);

const zipEncryptionHeaderParser: Parser<unknown, Uint8Array> = async parserContext => {
	parserContext.invariant(false, 'Not implemented');
};

type ZipDataDescriptor = {
	crc32: number;
	compressedSize: number;
	uncompressedSize: number;
};

const zipDataDescriptorSignature: Uint8Array = Buffer.from('504b0708', 'hex');
const zipDataDescriptorSignatureParser = createExactSequenceParser<Uint8Array>(zipDataDescriptorSignature);

const zipDataDescriptorParser: Parser<ZipDataDescriptor, Uint8Array> = promiseCompose(
	createTupleParser([
		createNegativeLookaheadParser(zipLocalFileHeaderSignatureParser),
		// FIXME: optional in spec
		// createOptionalParser(zipDataDescriptorSignatureParser),
		zipDataDescriptorSignatureParser,
		uint32LEParser,
		uint32LEParser,
		uint32LEParser,
	]),
	([
		_notZipLocalFileHeaderSignature,
		_zipDataDescriptorSignature,
		crc32,
		compressedSize,
		uncompressedSize,
	]) => ({
		crc32,
		compressedSize,
		uncompressedSize,
	}),
);

setParserName(zipDataDescriptorParser, 'zipDataDescriptorParser');

export type ZipLocalFile = {
	zipLocalFileHeader: ZipLocalFileHeader;
	zipEncryptionHeader: unknown;
	compressedData: Uint8Array;
	zipDataDescriptor: undefined | ZipDataDescriptor;
};

export const zipLocalFileParser: Parser<ZipLocalFile, Uint8Array> = promiseCompose(
	parserCreatorCompose(
		() => zipLocalFileHeaderParser,
		zipLocalFileHeader => {
			const sizeInDataDescriptor = Boolean(zipLocalFileHeader.generalPurposeBitFlag & 0b0000_0000_0000_1000
				&& zipLocalFileHeader.crc32 === 0
				&& zipLocalFileHeader.compressedSize === 0
				&& zipLocalFileHeader.uncompressedSize === 0);

			return createTupleParser([
				async () => zipLocalFileHeader,
				createOptionalParser(zipEncryptionHeaderParser),
				(
					sizeInDataDescriptor
						? createSequenceTerminatedSequenceParser(
							zipDataDescriptorSignature,
							{
								consumeTerminator: false,
							},
						)
						: createFixedLengthSequenceParser(zipLocalFileHeader.compressedSize)
				),
				(
					sizeInDataDescriptor
						? (<T>(parser: T): T => parser)
						: createOptionalParser
				)(zipDataDescriptorParser),
			]);
		},
	)(),
	([
		zipLocalFileHeader,
		zipEncryptionHeader,
		compressedData,
		zipDataDescriptor,
	]) => ({
		zipLocalFileHeader,
		zipEncryptionHeader,
		compressedData,
		zipDataDescriptor,
	}),
);

setParserName(zipLocalFileParser, 'zipEntryParser');

export const zipArchiveDecryptionHeaderParser: Parser<unknown, Uint8Array> = async parserContext => {
	parserContext.invariant(false, 'Not implemented %s', await parserContext.peek(0));
};

export const zipArchiveExtraDataRecordParser: Parser<unknown, Uint8Array> = async parserContext => {
	parserContext.invariant(false, 'Not implemented');
};

type ZipVersionMadeBy = {
	hostSystem: number;
	zipSpecificationVersion: number;
};

const zipVersionMadeByParser: Parser<ZipVersionMadeBy, Uint8Array> = promiseCompose(
	createFixedLengthSequenceParser(2),
	async ([
		zipSpecificationVersion,
		hostSystem,
	]) => ({
		hostSystem,
		zipSpecificationVersion,
	}),
);

type ZipExternalFileAttributes = {
	directory: boolean;
};

const dosExternalFileAttributesParser: Parser<ZipExternalFileAttributes, Uint8Array> = promiseCompose(
	uint32LEParser,
	externalFileAttributes => ({
		directory: (externalFileAttributes & 0b0001_0000) !== 0,
	}),
);

const unixExternalFileAttributesParser: Parser<ZipExternalFileAttributes, Uint8Array> = promiseCompose(
	uint32LEParser,
	externalFileAttributes => ({
		directory: (externalFileAttributes & (0b0100_0000_0000_0000 << 16)) !== 0,
	}),
);

const createExternalFileAttributesParser = (hostSystem: number) => promiseCompose(
	hostSystem === 0 ? dosExternalFileAttributesParser : unixExternalFileAttributesParser,
	externalFileAttributes => externalFileAttributes,
);

export type ZipCentralDirectoryHeader = {
	versionMadeBy: ZipVersionMadeBy;
	versionNeededToExtract: number;
	generalPurposeBitFlag: number;
	compressionMethod: ZipCompression;
	lastModifiedFile: Date;
	crc32: number;
	compressedSize: number;
	uncompressedSize: number;
	diskNumberStart: number;
	internalFileAttributes: number;
	externalFileAttributes: ZipExternalFileAttributes;
	relativeOffsetOfLocalHeader: number;

	filePath: string;
	extraField: Uint8Array;
	fileComment: string;
};

const zipCentralDirectoryHeaderParser_ = parserCreatorCompose(
	() => createTupleParser([
		createExactSequenceParser<Uint8Array>(Buffer.from('504b0102', 'hex')),
		zipVersionMadeByParser,
	]),
	([
		_centralDirectoryHeaderSignature,
		versionMadeBy,
	]) => createTupleParser([
		async () => versionMadeBy,
		uint16LEParser,
		uint16LEParser,
		zipCompressionMethodParser,
		dosDateTimeParser,
		uint32LEParser,
		uint32LEParser,
		uint32LEParser,
		parserCreatorCompose(
			() => createTupleParser([
				uint16LEParser,
				uint16LEParser,
				uint16LEParser,

				uint16LEParser,
				uint16LEParser,

				createExternalFileAttributesParser(versionMadeBy.hostSystem),
				uint32LEParser,
			]),
			([
				filePathLength,
				extraFieldLength,
				fileCommentLength,

				diskNumberStart,
				internalFileAttributes,

				externalFileAttributes,
				relativeOffsetOfLocalHeader,
			]) => createTupleParser([
				createFixedLengthSequenceParser(filePathLength),
				createFixedLengthSequenceParser(extraFieldLength),
				createFixedLengthSequenceParser(fileCommentLength),

				async () => diskNumberStart,
				async () => internalFileAttributes,

				async () => externalFileAttributes,
				async () => relativeOffsetOfLocalHeader,
			]),
		)(),
	]),
)();

setParserName(zipCentralDirectoryHeaderParser_, 'centralDirectoryHeaderParser_');

export const zipCentralDirectoryHeaderParser: Parser<ZipCentralDirectoryHeader, Uint8Array> = promiseCompose(
	zipCentralDirectoryHeaderParser_,
	([
		versionMadeBy,
		versionNeededToExtract,
		generalPurposeBitFlag,
		compressionMethod,
		lastModifiedFile,
		crc32,
		compressedSize,
		uncompressedSize,
		[
			filePath,
			extraField,
			fileComment,

			diskNumberStart,
			internalFileAttributes,
			externalFileAttributes,
			relativeOffsetOfLocalHeader,
		],
	]) => ({
		versionMadeBy,
		versionNeededToExtract,
		generalPurposeBitFlag,
		compressionMethod,
		lastModifiedFile,
		crc32,
		compressedSize,
		uncompressedSize,
		diskNumberStart,
		internalFileAttributes,
		externalFileAttributes,
		relativeOffsetOfLocalHeader,
		filePath: Buffer.from(filePath).toString('utf8'),
		extraField,
		fileComment: Buffer.from(fileComment).toString('utf8'),
	}),
);

export const zip64EndOfCentralDirectoryRecordParser: Parser<unknown, Uint8Array> = async parserContext => {
	parserContext.invariant(false, 'Not implemented');
};

export const zip64EndOfCentralDirectoryLocatorParser: Parser<unknown, Uint8Array> = async parserContext => {
	parserContext.invariant(false, 'Not implemented');
};

const zipFileCommentParser: Parser<string, Uint8Array> = promiseCompose(
	parserCreatorCompose(
		() => uint16LEParser,
		length => createFixedLengthSequenceParser<Uint8Array>(length),
	)(),
	uint8Array => Buffer.from(uint8Array).toString('utf8'),
);

export type ZipEndOfCentralDirectoryRecord = {
	numberOfThisDisk: number;
	numberOfTheDiskWithTheStartOfTheCentralDirectory: number;
	totalNumberOfEntriesInTheCentralDirectoryOnThisDisk: number;
	totalNumberOfEntriesInTheCentralDirectory: number;
	sizeOfTheCentralDirectory: number;
	offsetOfStartOfCentralDirectoryWithRespectToTheStartingDiskNumber: number;
	zipFileComment: string;
};

const zipEndOfCentralDirectoryRecordParser_ = createTupleParser([
	createExactSequenceParser<Uint8Array>(Buffer.from('504b0506', 'hex')),
	uint16LEParser,
	uint16LEParser,
	uint16LEParser,
	uint16LEParser,
	uint32LEParser,
	uint32LEParser,
	zipFileCommentParser,
]);

setParserName(zipEndOfCentralDirectoryRecordParser_, 'zipEndOfCentralDirectoryRecordParser_');

export const zipEndOfCentralDirectoryRecordParser: Parser<ZipEndOfCentralDirectoryRecord, Uint8Array> = promiseCompose(
	zipEndOfCentralDirectoryRecordParser_,
	([
		_endOfCentralDirectoryRecordSignature,
		numberOfThisDisk,
		numberOfTheDiskWithTheStartOfTheCentralDirectory,
		totalNumberOfEntriesInTheCentralDirectoryOnThisDisk,
		totalNumberOfEntriesInTheCentralDirectory,
		sizeOfTheCentralDirectory,
		offsetOfStartOfCentralDirectoryWithRespectToTheStartingDiskNumber,
		zipFileComment,
	]) => ({
		numberOfThisDisk,
		numberOfTheDiskWithTheStartOfTheCentralDirectory,
		totalNumberOfEntriesInTheCentralDirectoryOnThisDisk,
		totalNumberOfEntriesInTheCentralDirectory,
		sizeOfTheCentralDirectory,
		offsetOfStartOfCentralDirectoryWithRespectToTheStartingDiskNumber,
		zipFileComment,
	}),
);

setParserName(zipEndOfCentralDirectoryRecordParser, 'zipEndOfCentralDirectoryRecordParser');

const zipParser_ = createTupleParser([
	createArrayParser(zipLocalFileParser),
	createOptionalParser(zipArchiveDecryptionHeaderParser),
	createOptionalParser(zipArchiveExtraDataRecordParser),
	createArrayParser(zipCentralDirectoryHeaderParser),
	createOptionalParser(zip64EndOfCentralDirectoryRecordParser),
	createOptionalParser(zip64EndOfCentralDirectoryLocatorParser),
	zipEndOfCentralDirectoryRecordParser,
]);

setParserName(zipParser_, 'zipParser_');

export async function zipEntriesFromZipSegments({
	zipLocalFiles,
	zipCentralDirectoryHeaders,
}: {
	zipLocalFiles: ZipLocalFile[];
	zipCentralDirectoryHeaders: ZipCentralDirectoryHeader[];
}) {
	const decompressPromises: Array<Promise<void>> = [];

	const entries: ZipEntry[] = await Promise.all(zipLocalFiles.map(async (zipLocalFile, index) => {
		const {
			zipLocalFileHeader,
			compressedData,
			zipDataDescriptor,
			zipEncryptionHeader,
		} = zipLocalFile;

		const centralDirectoryHeader = zipCentralDirectoryHeaders.at(index);

		invariant(centralDirectoryHeader, 'Central directory header not found for local file %s', index);

		const commonFields: Omit<ZipFileEntry | ZipDirectoryEntry, 'type'> = {
			path: zipLocalFileHeader.filePath,
			comment: centralDirectoryHeader.fileComment,
			date: zipLocalFileHeader.lastModifiedFile,
			hostSystem: centralDirectoryHeader.versionMadeBy.hostSystem === 0 ? 'dos' : 'unix',
			attributes: centralDirectoryHeader.externalFileAttributes,
		};

		const isDirectory = (
			centralDirectoryHeader.externalFileAttributes.directory
			|| commonFields.path.endsWith('/')
		);

		if (isDirectory) {
			return {
				...commonFields,
				type: 'directory',
				path: commonFields.path.replace(/\/$/, ''),
			};
		}

		const fileEntry: ZipFileEntry = {
			...commonFields,
			type: 'file',
			content: compressedData,
			compression: zipLocalFileHeader.compressionMethod,
		};

		if (fileEntry.content.length > 0 && fileEntry.compression === 'deflate') {
			const inflate = zlib.createInflateRaw();
			const input = Readable.from(Buffer.from(compressedData));
			const [ _, buffer ] = await Promise.all([
				pipeline(input, inflate),
				uint8ArrayAsyncIterableToUint8Array(inflate),
			]);

			fileEntry.content = Uint8Array.from(buffer);
		}

		return fileEntry;
	}));

	await Promise.all(decompressPromises);

	return entries;
}

export async function zipFromZipSegments({
	zipLocalFiles,
	zipCentralDirectoryHeaders,

	zipEndOfCentralDirectoryRecord,
}: {
	zipLocalFiles: ZipLocalFile[];
	zipCentralDirectoryHeaders: ZipCentralDirectoryHeader[];

	zipEndOfCentralDirectoryRecord: ZipEndOfCentralDirectoryRecord;
}) {
	const entries = await zipEntriesFromZipSegments({
		zipLocalFiles,
		zipCentralDirectoryHeaders,
	});

	return {
		comment: zipEndOfCentralDirectoryRecord.zipFileComment,
		entries,
	};
}

export const zipParser: Parser<Zip, Uint8Array> = promiseCompose(
	zipParser_,
	async ([
		zipLocalFiles,
		zipArchiveDecryptionHeader,
		zipArchiveExtraDataRecords,
		zipCentralDirectoryHeaders,
		zip64EndOfCentralDirectoryRecord,
		zip64EndOfCentralDirectoryLocator,
		zipEndOfCentralDirectoryRecord,
	]) => zipFromZipSegments({
		zipLocalFiles,
		zipCentralDirectoryHeaders,
		zipEndOfCentralDirectoryRecord,
	}),
);

setParserName(zipParser, 'zipParser');
