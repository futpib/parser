import zlib from 'node:zlib';
import { Unparser } from "./unparser.js";
import { Zip, ZipEntry, ZipFileEntry } from "./zip.js";
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ZipEndOfCentralDirectoryRecord } from './zipParser.js';

const uint16LEUnparser: Unparser<number, Uint8Array> = async function * (uint16LE) {
	const buffer = Buffer.alloc(2);
	buffer.writeUInt16LE(uint16LE);
	yield buffer;
}

const uint32LEUnparser: Unparser<number, Uint8Array> = async function * (uint32LE) {
	const buffer = Buffer.alloc(4);
	buffer.writeUInt32LE(uint32LE);
	yield buffer;
}

const uint16LEPrefixedUint8ArrayUnparser: Unparser<Uint8Array, Uint8Array> = async function * (uint8Array, unparserContext) {
	yield * uint16LEUnparser(uint8Array.length, unparserContext);
	yield uint8Array;
}

const uint16LEPrefixedStringUnparser: Unparser<string, Uint8Array> = async function * (string, unparserContext) {
	yield * uint16LEPrefixedUint8ArrayUnparser(Buffer.from(string, 'utf8'), unparserContext);
}

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
}

const zipCompressionMethodUnparser: Unparser<'store' | 'deflate', Uint8Array> = async function * (compressionMethod, unparserContext) {
	if (compressionMethod === 'store') {
		yield * uint16LEUnparser(0, unparserContext);
	} else {
		yield * uint16LEUnparser(8, unparserContext);
	}
}

export const zipEndOfCentralDirectoryRecordUnparser: Unparser<ZipEndOfCentralDirectoryRecord, Uint8Array> = async function * (zipEndOfCentralDirectoryRecord, unparserContext) {
	yield Buffer.from('504b0506', 'hex');
	yield * uint16LEUnparser(zipEndOfCentralDirectoryRecord.numberOfThisDisk, unparserContext);
	yield * uint16LEUnparser(zipEndOfCentralDirectoryRecord.numberOfTheDiskWithTheStartOfTheCentralDirectory, unparserContext);
	yield * uint16LEUnparser(zipEndOfCentralDirectoryRecord.totalNumberOfEntriesInTheCentralDirectoryOnThisDisk, unparserContext);
	yield * uint16LEUnparser(zipEndOfCentralDirectoryRecord.totalNumberOfEntriesInTheCentralDirectory, unparserContext);
	yield * uint32LEUnparser(zipEndOfCentralDirectoryRecord.sizeOfTheCentralDirectory, unparserContext);
	yield * uint32LEUnparser(zipEndOfCentralDirectoryRecord.offsetOfStartOfCentralDirectoryWithRespectToTheStartingDiskNumber, unparserContext);

	yield * uint16LEPrefixedStringUnparser(zipEndOfCentralDirectoryRecord.zipFileComment, unparserContext);
}

export const zipUnparser: Unparser<Zip, Uint8Array> = async function * (zip, unparserContext) {
	const compressedContentByZipFileEntry = new Map<ZipFileEntry, undefined | Promise<Uint8Array>>(
		zip.entries.flatMap(zipEntry => {
			if (zipEntry.type !== 'file') {
				return [];
			}

			if (zipEntry.compression === 'store') {
				return [[zipEntry, Promise.resolve(zipEntry.content)]];
			}

			const uncompressedContent = zipEntry.content;

			const deflate = zlib.createDeflateRaw();
			const input = Readable.from(Buffer.from(uncompressedContent));

			const promise = Promise.all([
				pipeline(input, deflate),
				(async () => {
					const chunks: Buffer[] = [];
					for await (const chunk of deflate) {
						chunks.push(chunk);
					}

					return Buffer.concat(chunks);
				})(),
			]);

			return [[zipEntry, promise.then(([, compressedContent]) => compressedContent)]];
		}),
	);

	const filePathByZipEntry = new Map<ZipEntry, string>(
		zip.entries.map(zipEntry => [zipEntry, zipEntry.type === 'file' ? zipEntry.path : zipEntry.path + '/']),
	);

	const localHeaderPositionByZipEntry = new Map<ZipEntry, number>();

	for (const zipEntry of zip.entries) {
		localHeaderPositionByZipEntry.set(zipEntry, unparserContext.position);

		yield Buffer.from('504b0304', 'hex');

		yield * uint16LEUnparser(10, unparserContext); // version needed to extract
		yield * uint16LEUnparser(0, unparserContext); // general purpose bit flag

		if (zipEntry.type === 'file') {
			yield * zipCompressionMethodUnparser(zipEntry.compression, unparserContext);
		} else {
			yield * uint16LEUnparser(0, unparserContext);
		}

		yield * dosDateTimeUnparser(zipEntry.date, unparserContext);

		if (zipEntry.type === 'file') {
			const compressedContent = await compressedContentByZipFileEntry.get(zipEntry)!;

			yield * uint32LEUnparser(0, unparserContext); // crc32 // TODO
			yield * uint32LEUnparser(compressedContent.length, unparserContext);
			yield * uint32LEUnparser(zipEntry.content.length, unparserContext);
		} else {
			yield * uint32LEUnparser(0, unparserContext);
			yield * uint32LEUnparser(0, unparserContext);
			yield * uint32LEUnparser(0, unparserContext);
		}

		const filePath = filePathByZipEntry.get(zipEntry)!;

		const filePathBuffer = Buffer.from(filePath, 'utf8');
		const extraFieldBuffer = Buffer.alloc(0);
		yield * uint16LEUnparser(filePathBuffer.length, unparserContext);
		yield * uint16LEUnparser(extraFieldBuffer.length, unparserContext);
		yield filePathBuffer;
		yield extraFieldBuffer;

		if (zipEntry.type === 'file') {
			const compressedContent = await compressedContentByZipFileEntry.get(zipEntry)!;

			yield compressedContent;
		}
	}

	const startOfCentralDirectoryPosition = unparserContext.position;

	for (const zipEntry of zip.entries) {
		yield Buffer.from('504b0102', 'hex');

		if (zipEntry.hostSystem === 'unix') {
			yield 0; // zip specification version
			yield 3; // host system
		} else {
			yield 0;
			yield 0;
		}

		yield * uint16LEUnparser(0, unparserContext); // version needed to extract
		yield * uint16LEUnparser(0, unparserContext); // general purpose bit flag

		if (zipEntry.type === 'file') {
			yield * zipCompressionMethodUnparser(zipEntry.compression, unparserContext);
		} else {
			yield * uint16LEUnparser(0, unparserContext);
		}

		yield * dosDateTimeUnparser(zipEntry.date, unparserContext);

		if (zipEntry.type === 'file') {
			const compressedContent = await compressedContentByZipFileEntry.get(zipEntry)!;

			yield * uint32LEUnparser(0, unparserContext); // crc32 // TODO
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

		yield * uint16LEUnparser(0, unparserContext); // disk number start
		yield * uint16LEUnparser(0, unparserContext); // internal file attributes

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
}
