import * as fc from 'fast-check';
import { type ZipDosPermissions, type ZipUnixPermissions } from './zip.js';

const arbitraryZipUnixPermissions = fc.record<ZipUnixPermissions>({
	type: fc.constant('unix'),
	unixPermissions: (
		fc.nat({ max: 0b0000_0001_1111_1111 })
			.filter(unixPermissions => unixPermissions > 0)
	),
});

const arbitraryZipDosPermissions = fc.record<ZipDosPermissions>({
	type: fc.constant('dos'),
	dosPermissions: (
		fc.nat({ max: 0b0011_1111 })
	),
});

export const createArbitraryZipPermissions = (type: 'unix' | 'dos') => {
	if (type === 'unix') {
		return arbitraryZipUnixPermissions;
	}

	return arbitraryZipDosPermissions;
};
