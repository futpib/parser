import JSZip from 'jszip';
import { type ZipEntry } from './zip.js';
import { arbitraryZip } from './arbitraryZip.js';

function addZipEntryToZip(zip: JSZip, zipEntry: ZipEntry) {
	const options = {
		comment: zipEntry.comment,
		date: zipEntry.date,
		// unixPermissions: zipEntry.permissions.type === 'unix' ? zipEntry.permissions.unixPermissions : undefined,
		// dosPermissions: zipEntry.permissions.type === 'dos' ? zipEntry.permissions.dosPermissions : undefined,
	};

	if (zipEntry.type === 'file') {
		zip.file<'uint8array'>(zipEntry.path, zipEntry.content, {
			compression: zipEntry.compression.toUpperCase() as any,
			compressionOptions: undefined,
			binary: true,
			...options,
		});
	} else {
		zip.file(zipEntry.path, null, {
			dir: true,
			...options,
		});
	}
}

export const arbitraryZipStream = arbitraryZip.map(zip => {
	const jsZip = new JSZip();

	for (const zipEntry of zip.entries) {
		addZipEntryToZip(jsZip, zipEntry);
	}

	const zipInternalStream = jsZip.generateInternalStream({
		type: 'uint8array',
		comment: zip.comment,
		platform: zip.entries.at(0)?.hostSystem.toUpperCase() as any,
	});

	const zipStream = new ReadableStream<Uint8Array>({
		start(controller) {
			zipInternalStream.on('data', (chunk: Uint8Array) => {
				controller.enqueue(chunk);
			});

			zipInternalStream.on('end', () => {
				controller.close();
			});

			zipInternalStream.on('error', (error: Error) => {
				controller.error(error);
			});

			zipInternalStream.resume();
		},
	});

	return [ zip, zipStream ] as const;
});
