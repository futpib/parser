import fs from 'node:fs/promises';
import { execa } from 'execa';
import { temporaryFile } from 'tempy';

export async function smaliClass(smaliStream: AsyncIterable<string>) {
	const inputFilePath = temporaryFile();
	const outputFilePath = temporaryFile();

	await fs.writeFile(inputFilePath, smaliStream);

	await execa('smali', [
		'assemble',
		'--output', outputFilePath,
		inputFilePath,
	]);

	await fs.unlink(inputFilePath);

	const dex = await fs.readFile(outputFilePath);

	await fs.unlink(outputFilePath);

	return dex;
}
