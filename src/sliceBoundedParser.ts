import { getParserName, Parser, setParserName } from "./parser.js";

export const createSliceBoundedParser = <Output, Sequence>(
	childParser: Parser<Output, Sequence>,
	sliceEnd: number,
): Parser<Output, Sequence> => {
	const sliceBoundedParser: typeof childParser = async parserContext => {
		const childParserContext = parserContext.lookahead({
			sliceEnd: parserContext.position + sliceEnd,
		});

		try {
			const value = await childParser(childParserContext);
			childParserContext.unlookahead();
			return value;
		} finally {
			childParserContext.dispose();
		}
	};

	setParserName(sliceBoundedParser, [
		'sliceBounded(',
		getParserName(childParser, 'anonymousSliceBoundedChild'),
		',',
		sliceEnd,
		')',
	].join(''));

	return sliceBoundedParser;
}
