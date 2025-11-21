import { getParserName, type Parser, setParserName } from './parser.js';
import { parseArrayElements } from './arrayParserHelper.js';
import { promiseCompose } from './promiseCompose.js';
import { createTupleParser } from './tupleParser.js';

export const createSeparatedNonEmptyArrayParser = <ElementOutput, Sequence>(
	elementParser: Parser<ElementOutput, Sequence>,
	separatorParser: Parser<unknown, Sequence>,
): Parser<ElementOutput[], Sequence> => {
	const separatorThenElementParser: Parser<ElementOutput, Sequence> = promiseCompose(
		createTupleParser([
			separatorParser,
			elementParser,
		]),
		([ , element ]) => element,
	);

	const separatedNonEmptyArrayParser: Parser<ElementOutput[], Sequence> = async parserContext => {
		const elements = await parseArrayElements(
			parserContext,
			iterationIndex => iterationIndex === 0 ? elementParser : separatorThenElementParser,
			{ returnOnNoMatch: false },
		);

		parserContext.invariant(
			elements.length > 0,
			'Expected elementParser (%s) to match at least once',
			getParserName(elementParser, 'anonymousSeparatedNonEmptyArrayChild'),
		);

		return elements;
	};

	setParserName(separatedNonEmptyArrayParser, getParserName(elementParser, 'anonymousSeparatedNonEmptyArrayChild') + '+');

	return separatedNonEmptyArrayParser;
};
