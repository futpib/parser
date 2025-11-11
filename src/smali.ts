import fs from 'node:fs/promises';
import { execa } from 'execa';
import { temporaryFile } from 'tempy';

export async function smaliClass(smaliStream: string | AsyncIterable<string>): Promise<Uint8Array> {
	const inputFilePath = temporaryFile();
	const outputFilePath = temporaryFile();

	await fs.writeFile(inputFilePath, smaliStream);

	const smaliResult = await execa('smali', [
		'assemble',
		'--output',
		outputFilePath,
		inputFilePath,
	]);

	if (smaliResult.stderr) {
		throw new Error(`smali error: ${smaliResult.stderr}`);
	}

	await fs.unlink(inputFilePath);

	const dex = await fs.readFile(outputFilePath);

	await fs.unlink(outputFilePath);

	return dex;
}
