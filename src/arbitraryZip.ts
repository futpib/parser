import * as fc from 'fast-check';
import invariant from 'invariant';
import {
	type Zip,
	type ZipDirectoryEntry,
	type ZipFileEntry,
	type ZipEntry,
	type ZipEntryAttributes,
} from './zip.js';
import { arbitraryDosDateTime } from './arbitraryDosDateTime.js';

const arbitraryPath = fc.string({ minLength: 1 }).filter(path => {
	const pathSegments = path.split('/');
	const pathHasEmptySegments = pathSegments.some(segment => segment.length === 0);

	if (pathHasEmptySegments) {
		return false;
	}

	return true;
});

const createArbitraryZipEntry = (platform: 'unix' | 'dos') => fc.oneof<[
	fc.Arbitrary<ZipFileEntry>,
	fc.Arbitrary<ZipDirectoryEntry>,
]>(
	fc.record<ZipFileEntry>({
		type: fc.constant('file'),
		path: arbitraryPath,
		date: arbitraryDosDateTime,
		comment: fc.string(),
		hostSystem: fc.constant(platform),
		attributes: fc.record<ZipEntryAttributes>({
			directory: fc.constant(false),
		}),
		compression: fc.oneof(
			fc.constant('store' as const),
			fc.constant('deflate' as const),
		),
		content: fc.uint8Array(),
	}).filter(zipFileEntry => {
		if (
			zipFileEntry.content.length === 0
			&& zipFileEntry.compression === 'deflate'
		) {
			return false;
		}

		return true;
	}),
	fc.record<ZipDirectoryEntry>({
		type: fc.constant('directory'),
		path: arbitraryPath,
		date: arbitraryDosDateTime,
		comment: fc.string(),
		hostSystem: fc.constant(platform),
		attributes: fc.record<ZipEntryAttributes>({
			directory: fc.constant(false),
		}),
	}),
);

const createArbitraryZipEntries = (platform: 'unix' | 'dos') => (
	fc
		.array(createArbitraryZipEntry(platform))
		.map(entries => {
			const seenPaths = new Set<string>();
			const seenDirectoryPaths = new Set<string>();

			const normalizedEntries: typeof entries = [];

			for (const entry of entries) {
				if (seenPaths.has(entry.path)) {
					continue;
				}

				seenPaths.add(entry.path);

				if (entry.type === 'directory') {
					seenDirectoryPaths.add(entry.path);

					continue;
				}

				invariant(entry.type === 'file', 'Unexpected entry type %s.', entry.type);

				const directories = entry.path.split('/').slice(0, -1);

				for (const depth of Array.from({ length: directories.length }).map((_, index) => index)) {
					const directoryPath = directories.slice(0, depth + 1).join('/');

					if (directoryPath.length === 0) {
						continue;
					}

					if (!seenDirectoryPaths.has(directoryPath)) {
						normalizedEntries.push({
							type: 'directory',
							path: directoryPath,
							date: entry.date,
							comment: '',
							hostSystem: platform,
							attributes: {
								directory: true,
							},
						});

						seenDirectoryPaths.add(directoryPath);
					}
				}

				normalizedEntries.push(entry);
			}

			return normalizedEntries;
		})
);

export const arbitraryZip = fc.oneof(
	fc.constant('unix' as const),
	fc.constant('dos' as const),
).chain(platform => fc.record<Zip>({
	comment: fc.string(),
	entries: createArbitraryZipEntries(platform),
}));
