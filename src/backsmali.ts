import fs from 'node:fs/promises';
import { execa } from 'execa';
import { temporaryDirectory, temporaryFile } from 'tempy';
import path from 'node:path';

export async function baksmaliClass(dexStream: AsyncIterable<Uint8Array>, smaliFilePath: string) {
	const inputFilePath = temporaryFile();
	const outputDirectoryPath = temporaryDirectory();

	await fs.writeFile(inputFilePath, dexStream);

	await execa('baksmali', [
		'disassemble',
		'--classes', 'L' + smaliFilePath + ';',
		'--output', outputDirectoryPath,
		inputFilePath,
	], {
		stdin: dexStream,
	});

	await fs.unlink(inputFilePath);

	const smaliFilePath_ = path.join(outputDirectoryPath, smaliFilePath + '.smali');

	const smali = await fs.readFile(smaliFilePath_, 'utf8');

	await fs.rm(outputDirectoryPath, {
		recursive: true,
	});

	return smali;
}
