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
	type Zip, type ZipCompression, type ZipDirectoryEntry, type ZipEntry, type ZipFileEntry, type ZipPermissions,
} from './zip.js';

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

type ZipLocalFileHeader = {
	versionNeededToExtract: number;
	generalPurposeBitFlag: number;
	compressionMethod: ZipCompression;
	lastModFile: Date;
	crc32: number;
	compressedSize: number;
	uncompressedSize: number;

	fileName: string;
	extraField: Uint8Array;
};

const zipLocalFileHeaderParser_ = createTupleParser([
	createExactSequenceParser<Uint8Array>(Buffer.from('504b0304', 'hex')),
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
			fileNameLength,
			extraFieldLength,
		]) => createTupleParser([
			createFixedLengthSequenceParser(fileNameLength),
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
		lastModuleFile,
		crc32,
		compressedSize,
		uncompressedSize,
		[ fileName, extraField ],
	]) => ({
		versionNeededToExtract,
		generalPurposeBitFlag,
		compressionMethod,
		lastModFile: lastModuleFile,
		crc32,
		compressedSize,
		uncompressedSize,
		fileName: Buffer.from(fileName).toString('utf8'),
		extraField,
	}),
);

const zipEncryptionHeaderParser: Parser<unknown, Uint8Array> = async parserContext => {
	parserContext.invariant(false, 'Not implemented');
};

const zipDataDescriptorParser: Parser<unknown, Uint8Array> = createTupleParser([
	// FIXME: optional in spec
	// createOptionalParser(createExactSequenceParser<Uint8Array>(Buffer.from('504b0708', 'hex'))),
	createExactSequenceParser<Uint8Array>(Buffer.from('504b0708', 'hex')),
	uint32LEParser,
	uint32LEParser,
	uint32LEParser,
]);

type ZipLocalFile = {
	zipLocalFileHeader: ZipLocalFileHeader;
	zipEncryptionHeader: unknown;
	compressedData: Uint8Array;
	zipDataDescriptor: unknown;
};

export const zipLocalFileParser: Parser<ZipLocalFile, Uint8Array> = promiseCompose(
	parserCreatorCompose(
		() => zipLocalFileHeaderParser,
		zipLocalFileHeader => createTupleParser([
			async () => zipLocalFileHeader,
			createOptionalParser(zipEncryptionHeaderParser),
			createFixedLengthSequenceParser(zipLocalFileHeader.compressedSize),
			createOptionalParser(zipDataDescriptorParser),
		]),
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

type ZipCentralDirectoryHeader = {
	versionMadeBy: ZipVersionMadeBy;
	versionNeededToExtract: number;
	generalPurposeBitFlag: number;
	compressionMethod: ZipCompression;
	lastModFile: Date;
	crc32: number;
	compressedSize: number;
	uncompressedSize: number;
	diskNumberStart: number;
	internalFileAttributes: number;
	externalFileAttributes: number;
	relativeOffsetOfLocalHeader: number;

	fileName: string;
	extraField: Uint8Array;
	fileComment: string;
};

const zipCentralDirectoryHeaderParser_ = createTupleParser([
	createExactSequenceParser<Uint8Array>(Buffer.from('504b0102', 'hex')),
	zipVersionMadeByParser,
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
			uint32LEParser,
			uint32LEParser,
		]),
		([
			fileNameLength,
			extraFieldLength,
			fileCommentLength,

			diskNumberStart,
			internalFileAttributes,
			externalFileAttributes,
			relativeOffsetOfLocalHeader,
		]) => createTupleParser([
			createFixedLengthSequenceParser(fileNameLength),
			createFixedLengthSequenceParser(extraFieldLength),
			createFixedLengthSequenceParser(fileCommentLength),

			async () => diskNumberStart,
			async () => internalFileAttributes,
			async () => externalFileAttributes,
			async () => relativeOffsetOfLocalHeader,
		]),
	)(),
]);

setParserName(zipCentralDirectoryHeaderParser_, 'centralDirectoryHeaderParser_');

export const zipCentralDirectoryHeaderParser: Parser<ZipCentralDirectoryHeader, Uint8Array> = promiseCompose(
	zipCentralDirectoryHeaderParser_,
	([
		_centralDirectoryHeaderSignature,
		versionMadeBy,
		versionNeededToExtract,
		generalPurposeBitFlag,
		compressionMethod,
		lastModuleFile,
		crc32,
		compressedSize,
		uncompressedSize,
		[
			fileName,
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
		lastModFile: lastModuleFile,
		crc32,
		compressedSize,
		uncompressedSize,
		diskNumberStart,
		internalFileAttributes,
		externalFileAttributes,
		relativeOffsetOfLocalHeader,
		fileName: Buffer.from(fileName).toString('utf8'),
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

type ZipEndOfCentralDirectoryRecord = {
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

setParserName(zipEndOfCentralDirectoryRecordParser_, 'endOfCentralDirectoryRecordParser_');

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

		let isDosDirectory = false;
		let permissions: ZipPermissions = {
			type: 'unix',
			unixPermissions: 0,
		};

		if (centralDirectoryHeader.versionMadeBy.hostSystem === 0) {
			isDosDirectory = (centralDirectoryHeader.externalFileAttributes & 0b0001_0000) !== 0;
			permissions = {
				type: 'dos',
				dosPermissions: centralDirectoryHeader.externalFileAttributes & 0b0011_1111,
			};
		}

		if (centralDirectoryHeader.versionMadeBy.hostSystem === 3) {
			permissions = {
				type: 'unix',
				unixPermissions: (centralDirectoryHeader.externalFileAttributes >> 16) & 0b1_1111_1111,
			};
		}

		const commonFields: Omit<ZipFileEntry | ZipDirectoryEntry, 'type'> = {
			path: zipLocalFileHeader.fileName,
			comment: centralDirectoryHeader.fileComment,
			date: zipLocalFileHeader.lastModFile,
			permissions,
		};

		const isDirectory = isDosDirectory || commonFields.path.endsWith('/');

		if (isDirectory) {
			return {
				...commonFields,
				type: 'directory',
				path: commonFields.path.slice(0, -1),
			};
		}

		const fileEntry: ZipFileEntry = {
			...commonFields,
			type: 'file',
			content: compressedData,
			compression: zipLocalFileHeader.compressionMethod,
		};

		if (fileEntry.content.length > 0 && fileEntry.compression === 'deflate') {
			const deflate = zlib.createInflateRaw();
			const input = Readable.from(Buffer.from(compressedData));
			const [ _, buffer ] = await Promise.all([
				pipeline(input, deflate),
				(async () => {
					const chunks: Buffer[] = [];
					for await (const chunk of deflate) {
						chunks.push(chunk);
					}

					return Buffer.concat(chunks);
				})(),
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
