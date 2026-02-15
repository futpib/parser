import { execa } from 'execa';

export async function hasExecutable(executable: string) {
	const hasExecutable = await execa(executable).then(() => true).catch(() => false);

	if (!hasExecutable) {
		console.warn('Executable %o not found', executable);
	}

	return hasExecutable;
}
