import { execa } from 'execa';

export async function hasExecutable(executable: string) {
	const hasExecutable = execa(executable).catch(() => false).then(() => true);

	if (!hasExecutable) {
		console.warn('Executable %o not found', executable);
	}

	return hasExecutable;
}
