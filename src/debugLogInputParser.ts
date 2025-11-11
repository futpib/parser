import { type Parser } from './parser.js';

export const createDebugLogInputParser = <Sequence>({
	maxLookahead = 8,
}: {
	maxLookahead?: number;
} = {}): Parser<void, Sequence> => async parserContext => {
	let lookahead = maxLookahead;

	while (lookahead > 0) {
		const sequence = await parserContext.peekSequence(0, lookahead);

		if (!sequence) {
			lookahead -= 1;
			continue;
		}

		let prettySequence: unknown = sequence;

		if (prettySequence instanceof Uint8Array) {
			prettySequence = Buffer.from(prettySequence).toString('hex');
		}

		console.log('debugLogInput (position: %s): %s', parserContext.position, prettySequence);

		break;
	}
};
