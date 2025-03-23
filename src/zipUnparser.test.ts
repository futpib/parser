import { testProp } from '@fast-check/ava';
import { temporaryFile } from 'tempy';
import { execa } from 'execa';
import fsPromises from 'node:fs/promises';
import { runUnparser } from './unparser.js';
import { zipUnparser } from './zipUnparser.js';
import { uint8ArrayUnparserOutputCompanion } from './unparserOutputCompanion.js';
import { runParser } from './parser.js';
import { zipParser } from './zipParser.js';
import { uint8ArrayParserInputCompanion } from './parserInputCompanion.js';
import { arbitraryZip } from './arbitraryZip.js';
import { hasExecutable } from './hasExecutable.js';

const hasZipinfoPromise = hasExecutable('zipinfo');
const has7zPromise = hasExecutable('7z');

async function zipinfo(zipFilePath: string) {
	const { stdout } = await execa('zipinfo', [
		'-v',
		zipFilePath,
	], {
		reject: false,
	});

	return {
		isEmptyZipfile: stdout.endsWith('Empty zipfile.'),
	};
}

async function _7zList(zipFilePath: string) {
	const { stdout } = await execa('7z', [
		'l',
		zipFilePath,
	], {
		reject: false,
	});

	if (/Errors: \d+$/.test(stdout)) {
		throw new Error(`7z reports errors: ${stdout}`);
	}

	return {
		isEmptyZipfile: false, // TODO
	};
}

testProp(
	'zip',
	[
		arbitraryZip,
	],
	async (t, zip) => {
		const actualStream = runUnparser(zipUnparser, zip, uint8ArrayUnparserOutputCompanion);
		const actual = await runParser(zipParser, actualStream, uint8ArrayParserInputCompanion);

		const isDeepEqual = t.deepEqual(actual, zip);

		if (!isDeepEqual) {
			return;
		}

		const hasZipinfo = await hasZipinfoPromise;
		const has7z = await has7zPromise;

		if (!hasZipinfo && !has7z) {
			return;
		}

		const temporaryFilePath = temporaryFile({
			extension: 'zip',
		});

		const zipStream = runUnparser(zipUnparser, zip, uint8ArrayUnparserOutputCompanion);

		await fsPromises.writeFile(temporaryFilePath, zipStream);

		if (has7z) {
			const {
				isEmptyZipfile,
			} = await _7zList(temporaryFilePath);

			if (isEmptyZipfile) {
				t.deepEqual(
					actual.entries,
					[],
					'7z reports the zipfile as empty, but it has entries',
				);
			}
		}

		if (hasZipinfo) {
			const {
				isEmptyZipfile,
			} = await zipinfo(temporaryFilePath);

			if (isEmptyZipfile) {
				t.deepEqual(
					actual.entries.filter(entry => entry.type === 'file'),
					[],
					'zipinfo reports the zipfile as empty, but it has file entries',
				);
			}
		}

		await fsPromises.unlink(temporaryFilePath);
	},
	{
		verbose: true,
	},
);
