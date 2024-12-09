
export type ZipCompression =
	| 'store'
	| 'deflate'
;

export type ZipEntryAttributes = {
};

type ZipEntryCommon = {
	path: string;
	date: Date;
	comment: string;
	hostSystem: 'unix' | 'dos';
	attributes: ZipEntryAttributes;
};

export type ZipFileEntry = ZipEntryCommon & {
	type: 'file';
	compression: ZipCompression;
	content: Uint8Array;
};

export type ZipDirectoryEntry = ZipEntryCommon & {
	type: 'directory';
};

export type ZipEntry =
	| ZipFileEntry
	| ZipDirectoryEntry
;

export type Zip = {
	comment: string;
	entries: ZipEntry[];
};
