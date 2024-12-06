
export type ZipCompression =
	| 'store'
	| 'deflate'
;

export type ZipUnixPermissions = {
	type: 'unix';
	unixPermissions: number;
};

export type ZipDosPermissions = {
	type: 'dos';
	dosPermissions: number;
};

export type ZipPermissions =
	| ZipUnixPermissions
	| ZipDosPermissions
;

export type ZipFileEntry = {
	type: 'file';
	path: string;
	date: Date;
	comment: string;
	permissions: ZipPermissions;
	compression: ZipCompression;
	content: Uint8Array;
};

export type ZipDirectoryEntry = {
	type: 'directory';
	path: string;
	date: Date;
	comment: string;
	permissions: ZipPermissions;
};

export type ZipEntry =
	| ZipFileEntry
	| ZipDirectoryEntry
;

export type Zip = {
	comment: string;
	entries: ZipEntry[];
}
