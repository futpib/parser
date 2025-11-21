import { getParserName, type Parser, setParserName } from './parser.js';
import { parseArrayElements } from './arrayParserHelper.js';
import { promiseCompose } from './promiseCompose.js';
import { createTupleParser } from './tupleParser.js';

export const createSeparatedArrayParser = <ElementOutput, Sequence>(
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

	const separatedArrayParser: Parser<ElementOutput[], Sequence> = async parserContext => {
		return parseArrayElements(
			parserContext,
			iterationIndex => iterationIndex === 0 ? elementParser : separatorThenElementParser,
			{ returnOnNoMatch: false },
		);
	};

	setParserName(separatedArrayParser, getParserName(elementParser, 'anonymousSeparatedArrayChild') + '*');

	return separatedArrayParser;
};
