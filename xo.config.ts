import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const tsOverridesModule = require('eslint-config-xo-typescript-overrides');

const tsOverrides = tsOverridesModule.default || tsOverridesModule;

export default [
	...tsOverrides,
	{
		rules: {
			'ava/no-ignored-test-files': 'off',
		},
	},
];
