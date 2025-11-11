import zlib from 'node:zlib';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { type Unparser } from './unparser.js';
import { type Zip, type ZipEntry, type ZipFileEntry } from './zip.js';
import { type ZipEndOfCentralDirectoryRecord, type ZipLocalFileHeader } from './zipParser.js';
import { uint8ArrayAsyncIterableToUint8Array } from './uint8Array.js';

const uint16LEUnparser: Unparser<number, Uint8Array> = async function * (uint16LE) {
	const buffer = Buffer.alloc(2);
	buffer.writeUInt16LE(uint16LE);
	yield buffer;
};

const uint32LEUnparser: Unparser<number, Uint8Array> = async function * (uint32LE) {
	const buffer = Buffer.alloc(4);
	buffer.writeUInt32LE(uint32LE);
	yield buffer;
};

const uint16LEPrefixedUint8ArrayUnparser: Unparser<Uint8Array, Uint8Array> = async function * (uint8Array, unparserContext) {
	yield * uint16LEUnparser(uint8Array.length, unparserContext);
	yield uint8Array;
};

const uint16LEPrefixedStringUnparser: Unparser<string, Uint8Array> = async function * (string, unparserContext) {
	yield * uint16LEPrefixedUint8ArrayUnparser(Buffer.from(string, 'utf8'), unparserContext);
};

const dosDateTimeUnparser: Unparser<Date, Uint8Array> = async function * (date, unparserContext) {
	yield * uint16LEUnparser(
		(
			date.getUTCSeconds() / 2
			| date.getUTCMinutes() << 5
			| date.getUTCHours() << 11
		),
		unparserContext,
	);
	yield * uint16LEUnparser(
		(
			date.getUTCDate()
			| (date.getUTCMonth() + 1) << 5
			| (date.getUTCFullYear() - 1980) << 9
		),
		unparserContext,
	);
};

const zipCompressionMethodUnparser: Unparser<'store' | 'deflate', Uint8Array> = async function * (compressionMethod, unparserContext) {
	yield * (compressionMethod === 'store' ? uint16LEUnparser(0, unparserContext) : uint16LEUnparser(8, unparserContext));
};

export const zipEndOfCentralDirectoryRecordUnparser: Unparser<ZipEndOfCentralDirectoryRecord, Uint8Array> = async function * (zipEndOfCentralDirectoryRecord, unparserContext) {
	yield Buffer.from('504b0506', 'hex');
	yield * uint16LEUnparser(zipEndOfCentralDirectoryRecord.numberOfThisDisk, unparserContext);
	yield * uint16LEUnparser(zipEndOfCentralDirectoryRecord.numberOfTheDiskWithTheStartOfTheCentralDirectory, unparserContext);
	yield * uint16LEUnparser(zipEndOfCentralDirectoryRecord.totalNumberOfEntriesInTheCentralDirectoryOnThisDisk, unparserContext);
	yield * uint16LEUnparser(zipEndOfCentralDirectoryRecord.totalNumberOfEntriesInTheCentralDirectory, unparserContext);
	yield * uint32LEUnparser(zipEndOfCentralDirectoryRecord.sizeOfTheCentralDirectory, unparserContext);
	yield * uint32LEUnparser(zipEndOfCentralDirectoryRecord.offsetOfStartOfCentralDirectoryWithRespectToTheStartingDiskNumber, unparserContext);

	yield * uint16LEPrefixedStringUnparser(zipEndOfCentralDirectoryRecord.zipFileComment, unparserContext);
};

const zipDataDescriptorUnparser: Unparser<{
	crc32: number;
	compressedSize: number;
	uncompressedSize: number;
}, Uint8Array> = async function * ({
	crc32,
	compressedSize,
	uncompressedSize,
}, unparserContext) {
	yield Buffer.from('504b0708', 'hex');
	yield * uint32LEUnparser(crc32, unparserContext);
	yield * uint32LEUnparser(compressedSize, unparserContext);
	yield * uint32LEUnparser(uncompressedSize, unparserContext);
};

const zipLocalFileHeaderUnparser: Unparser<ZipLocalFileHeader, Uint8Array> = async function * ({
	versionNeededToExtract,
	generalPurposeBitFlag,
	compressionMethod,
	lastModifiedFile,
	crc32,
	compressedSize,
	uncompressedSize,

	filePath,
	extraField,
}, unparserContext) {
	yield Buffer.from('504b0304', 'hex');

	yield * uint16LEUnparser(versionNeededToExtract, unparserContext);
	yield * uint16LEUnparser(generalPurposeBitFlag, unparserContext);
	yield * zipCompressionMethodUnparser(compressionMethod, unparserContext);
	yield * dosDateTimeUnparser(lastModifiedFile, unparserContext);
	yield * uint32LEUnparser(crc32, unparserContext);
	yield * uint32LEUnparser(compressedSize, unparserContext);
	yield * uint32LEUnparser(uncompressedSize, unparserContext);

	const filePathBuffer = Buffer.from(filePath, 'utf8');

	yield * uint16LEUnparser(filePathBuffer.length, unparserContext);
	yield * uint16LEUnparser(extraField.length, unparserContext);
	yield filePathBuffer;
	yield extraField;
};

export const createZipUnparser = ({
	dataDescriptor = false,
}: {
	dataDescriptor?: boolean;
} = {}): Unparser<Zip, Uint8Array> => async function * (zip, unparserContext) {
	const compressedContentByZipFileEntry = new Map<ZipFileEntry, undefined | Promise<Uint8Array>>(zip.entries.flatMap(zipEntry => {
		if (zipEntry.type !== 'file') {
			return [];
		}

		if (zipEntry.compression === 'store') {
			return [ [ zipEntry, Promise.resolve(zipEntry.content) ] ];
		}

		const uncompressedContent = zipEntry.content;

		const deflate = zlib.createDeflateRaw();
		const input = Readable.from(Buffer.from(uncompressedContent));

		const promise = Promise.all([
			pipeline(input, deflate),
			uint8ArrayAsyncIterableToUint8Array(deflate),
		]);

		return [ [ zipEntry, promise.then(([ , compressedContent ]) => compressedContent) ] ];
	}));

	const filePathByZipEntry = new Map<ZipEntry, string>(zip.entries.map(zipEntry => [ zipEntry, zipEntry.type === 'file' ? zipEntry.path : zipEntry.path + '/' ]));

	const localHeaderPositionByZipEntry = new Map<ZipEntry, number>();

	for (const zipEntry of zip.entries) {
		localHeaderPositionByZipEntry.set(zipEntry, unparserContext.position);

		const filePath = filePathByZipEntry.get(zipEntry)!;

		const zipLocalFileHeader: ZipLocalFileHeader = {
			versionNeededToExtract: 20,
			generalPurposeBitFlag: 0,
			compressionMethod: 'store',
			lastModifiedFile: zipEntry.date,
			crc32: 0,
			compressedSize: 0,
			uncompressedSize: 0,
			filePath,
			extraField: Buffer.alloc(0),
		};

		let shouldWriteDataDescriptor = false;

		if (zipEntry.type === 'file') {
			const compressedContent = await compressedContentByZipFileEntry.get(zipEntry)!;

			zipLocalFileHeader.compressionMethod = zipEntry.compression;
			zipLocalFileHeader.crc32 = 0; // TODO
			zipLocalFileHeader.compressedSize = compressedContent.length;
			zipLocalFileHeader.uncompressedSize = zipEntry.content.length;

			if (dataDescriptor) {
				shouldWriteDataDescriptor = true;

				zipLocalFileHeader.generalPurposeBitFlag |= 0b0000_0000_0000_1000;
				zipLocalFileHeader.crc32 = 0;
				zipLocalFileHeader.compressedSize = 0;
				zipLocalFileHeader.uncompressedSize = 0;
			}
		}

		yield * zipLocalFileHeaderUnparser(zipLocalFileHeader, unparserContext);

		if (zipEntry.type === 'file') {
			const compressedContent = await compressedContentByZipFileEntry.get(zipEntry)!;

			yield compressedContent;

			if (shouldWriteDataDescriptor) {
				yield * zipDataDescriptorUnparser({
					crc32: zipLocalFileHeader.crc32,
					compressedSize: zipLocalFileHeader.compressedSize,
					uncompressedSize: zipLocalFileHeader.uncompressedSize,
				}, unparserContext);
			}
		}
	}

	const startOfCentralDirectoryPosition = unparserContext.position;

	for (const zipEntry of zip.entries) {
		yield Buffer.from('504b0102', 'hex');

		if (zipEntry.hostSystem === 'unix') {
			yield 0; // Zip specification version
			yield 3; // Host system
		} else {
			yield 0;
			yield 0;
		}

		yield * uint16LEUnparser(0, unparserContext); // Version needed to extract
		yield * uint16LEUnparser(0, unparserContext); // General purpose bit flag

		yield * (zipEntry.type === 'file' ? zipCompressionMethodUnparser(zipEntry.compression, unparserContext) : uint16LEUnparser(0, unparserContext));

		yield * dosDateTimeUnparser(zipEntry.date, unparserContext);

		if (zipEntry.type === 'file') {
			const compressedContent = await compressedContentByZipFileEntry.get(zipEntry)!;

			yield * uint32LEUnparser(0, unparserContext); // Crc32 // TODO
			yield * uint32LEUnparser(compressedContent.length, unparserContext);
			yield * uint32LEUnparser(zipEntry.content.length, unparserContext);
		} else {
			yield * uint32LEUnparser(0, unparserContext);
			yield * uint32LEUnparser(0, unparserContext);
			yield * uint32LEUnparser(0, unparserContext);
		}

		const filePath = filePathByZipEntry.get(zipEntry)!;

		const filePathBuffer = Buffer.from(filePath, 'utf8');
		yield * uint16LEUnparser(filePathBuffer.length, unparserContext);
		const extraFieldBuffer = Buffer.alloc(0);
		yield * uint16LEUnparser(extraFieldBuffer.length, unparserContext);
		const fileCommentBuffer = Buffer.from(zipEntry.comment, 'utf8');
		yield * uint16LEUnparser(fileCommentBuffer.length, unparserContext);

		yield * uint16LEUnparser(0, unparserContext); // Disk number start
		yield * uint16LEUnparser(0, unparserContext); // Internal file attributes

		if (zipEntry.hostSystem === 'unix') {
			yield * uint32LEUnparser(
				(
					0
					| (
						zipEntry.type === 'directory'
							? (0b0100_0000_0000_0000 << 16)
							: (0b1000_0000_0000_0000 << 16)
					)
				) >>> 0,
				unparserContext,
			);
		} else {
			yield * uint32LEUnparser(
				(
					0
					| (
						zipEntry.type === 'directory'
							? 0b0001_0000
							: 0
					)
				),
				unparserContext,
			);
		}

		const localHeaderPosition = localHeaderPositionByZipEntry.get(zipEntry)!;

		yield * uint32LEUnparser(localHeaderPosition, unparserContext);

		yield filePathBuffer;
		yield extraFieldBuffer;
		yield fileCommentBuffer;
	}

	const endOfCentralDirectoryPosition = unparserContext.position;
	const sizeOfTheCentralDirectory = endOfCentralDirectoryPosition - startOfCentralDirectoryPosition;

	yield * zipEndOfCentralDirectoryRecordUnparser({
		numberOfThisDisk: 0,
		numberOfTheDiskWithTheStartOfTheCentralDirectory: 0,
		totalNumberOfEntriesInTheCentralDirectoryOnThisDisk: zip.entries.length,
		totalNumberOfEntriesInTheCentralDirectory: zip.entries.length,
		sizeOfTheCentralDirectory,
		offsetOfStartOfCentralDirectoryWithRespectToTheStartingDiskNumber: startOfCentralDirectoryPosition,
		zipFileComment: zip.comment,
	}, unparserContext);
};

export const zipUnparser = createZipUnparser();
