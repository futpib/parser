import test from 'ava';

import { fetchCid } from './fetchCid.js';

const cid = 'bafybeicb3qajmwy6li7hche2nkucvytaxcyxhwhphmi73tgydjzmyoqoda';

test('fetchCid', async t => {
	await Promise.all([
		fetchCid(cid),
		fetchCid(cid),
		fetchCid(cid),
	]);

	await Promise.all([
		fetchCid(cid),
		fetchCid(cid),
		fetchCid(cid),
	]);

	t.pass();
});
