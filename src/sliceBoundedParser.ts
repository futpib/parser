import { getParserName, type Parser, setParserName } from './parser.js';

export const createSliceBoundedParser = <Output, Sequence>(
	childParser: Parser<Output, Sequence>,
	sliceEnd: number,
	mustConsumeAll = true,
): Parser<Output, Sequence> => {
	const sliceBoundedParser: typeof childParser = async parserContext => {
		const absoluteSliceEnd = parserContext.position + sliceEnd;

		using childParserContext = parserContext.lookahead({
			sliceEnd: absoluteSliceEnd,
		});

		const value = await childParser(childParserContext);

		childParserContext.invariant(
			(
				!mustConsumeAll
				|| childParserContext.position === absoluteSliceEnd
			),
			'child parser must consume all input in the slice (%s in total, up to position %s), instead consumed %s up to position %s',
			sliceEnd,
			absoluteSliceEnd,
			childParserContext.position - parserContext.position,
			childParserContext.position,
		);

		childParserContext.unlookahead();
		return value;
	};

	setParserName(sliceBoundedParser, [
		'sliceBounded(',
		getParserName(childParser, 'anonymousSliceBoundedChild'),
		',',
		sliceEnd,
		',',
		mustConsumeAll,
		')',
	].join(''));

	return sliceBoundedParser;
};
