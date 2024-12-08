import { getParserName, type Parser, setParserName } from './parser.js';

export const createDebugLogParser = <Output, Sequence>(
	childParser: Parser<Output, Sequence>,
): Parser<Output, Sequence> => {
	let idCounter = 0;

	const debugLogParser: typeof childParser = async parserContext => {
		const id = idCounter++;
		const initialPosition = parserContext.position;

		console.debug(
			'%s %s: started (position: %s)',
			getParserName(childParser),
			id,
			initialPosition,
		);

		try {
			const result = await childParser(parserContext);

			console.debug(
				'%s %s: finished (position: %s, consumed: %s): %o',
				getParserName(childParser),
				id,
				parserContext.position,
				parserContext.position - initialPosition,
				result,
			);

			return result;
		} catch (error) {
			console.debug(
				'%s %s: failed (position: %s, consumed: %s): %o',
				getParserName(childParser),
				id,
				parserContext.position,
				parserContext.position - initialPosition,
				error,
			);

			throw error;
		}
	};

	return setParserName(debugLogParser, [
		'debugLog(',
		getParserName(childParser),
		')',
	].join(''));
};
