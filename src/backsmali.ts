import fs from 'node:fs/promises';
import { execa } from 'execa';
import { temporaryDirectory, temporaryFile } from 'tempy';
import path from 'node:path';
import { smaliClass } from './smali.js';

export async function baksmaliClass(
	dexStream: Uint8Array | AsyncIterable<Uint8Array>,
	smaliFilePath: string,
): Promise<string> {
	const inputFilePath = temporaryFile();
	const outputDirectoryPath = temporaryDirectory();

	await fs.writeFile(inputFilePath, dexStream);

	await execa('baksmali', [
		'disassemble',
		'--classes', 'L' + smaliFilePath + ';',
		'--output', outputDirectoryPath,
		inputFilePath,
	]);

	await fs.unlink(inputFilePath);

	const smaliFilePath_ = path.join(outputDirectoryPath, smaliFilePath + '.smali');

	const smali = await fs.readFile(smaliFilePath_, 'utf8');

	await fs.rm(outputDirectoryPath, {
		recursive: true,
	});

	return smali;
}

export async function backsmaliSmaliIsolateClass(
	dexStream: Uint8Array | AsyncIterable<Uint8Array>,
	smaliFilePath: string,
): Promise<Uint8Array> {
	const smali = await baksmaliClass(dexStream, smaliFilePath);
	return smaliClass(smali);
}
