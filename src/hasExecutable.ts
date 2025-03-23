import { execa } from 'execa';

export async function hasExecutable(executable: string) {
	const hasExecutable = execa(executable).then(() => true, () => false);

	if (!hasExecutable) {
		console.warn(`Executable %o not found`, executable);
	}

	return hasExecutable;
}
