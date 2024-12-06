import * as fc from 'fast-check';

type FileSystemDirectory = {
	type: 'directory';
	name: string;
	entries: FileSystemEntry[];
};

type FileSystemFile = {
	type: 'file';
	name: string;
	content: Uint8Array;
};

export type FileSystemEntry =
	| FileSystemFile
	| FileSystemDirectory
;

export const arbitraryFileSystemEntry = fc.letrec((tie) => ({
	entry: fc.oneof<[
		fc.Arbitrary<FileSystemFile>,
		fc.Arbitrary<FileSystemDirectory>,
	]>(
		fc.record<FileSystemFile>({
			type: fc.constant('file'),
			name: fc.string(),
			content: fc.uint8Array(),
		}),
		fc.record<FileSystemDirectory>({
			type: fc.constant('directory'),
			name: fc.string(),
			entries: fc.array(tie('entry') as fc.Arbitrary<FileSystemEntry>),
		}),
	),
})).entry;
