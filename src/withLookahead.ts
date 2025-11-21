import { type ParserContext } from './parserContext.js';

/**
 * Helper function that executes a callback with a lookahead parser context.
 * Ensures proper cleanup of the lookahead context via dispose() in a finally block.
 * 
 * This pattern is commonly used when you need to try parsing with lookahead
 * but want to ensure the lookahead context is properly disposed regardless of success or failure.
 * 
 * @param parserContext - The parent parser context
 * @param callback - Async function that receives the lookahead context and returns a result
 * @param options - Optional lookahead options (e.g., debugName)
 * @returns The result from the callback
 */
export const withLookahead = async <T, Sequence, Element>(
	parserContext: ParserContext<Sequence, Element>,
	callback: (lookaheadContext: ParserContext<Sequence, Element>) => Promise<T> | T,
	options?: Parameters<ParserContext<Sequence, Element>['lookahead']>[0],
): Promise<T> => {
	const lookaheadContext = parserContext.lookahead(options);

	try {
		return await callback(lookaheadContext);
	} finally {
		lookaheadContext.dispose();
	}
};
