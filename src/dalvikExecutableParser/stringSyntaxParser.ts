import { type Parser, setParserName } from '../parser.js';
import { promiseCompose } from '../promiseCompose.js';
import { createSeparatedArrayParser } from '../separatedArrayParser.js';
import { createExactSequenceParser } from '../exactSequenceParser.js';
import { createUnionParser } from '../unionParser.js';
import { createTupleParser } from '../tupleParser.js';
import { createArrayParser } from '../arrayParser.js';
import { createNonEmptyArrayParser } from '../nonEmptyArrayParser.js';
import { createPredicateElementParser } from '../predicateElementParser.js';

function isSmaliSimpleNameChar(character: string): boolean {
	return (
		(character >= 'a' && character <= 'z')
		|| (character >= 'A' && character <= 'Z')
		|| (character >= '0' && character <= '9')
		|| character === ' '
		|| character === '$'
		|| character === '-'
		|| character === '_'
		|| character === '\u00A0'
		|| (character >= '\u00A1' && character <= '\u1FFF')
		|| (character >= '\u2000' && character <= '\u200A')
		|| (character >= '\u2010' && character <= '\u2027')
		|| character === '\u202F'
		|| (character >= '\u2030' && character <= '\uD7FF')
		|| (character >= '\uE000' && character <= '\uFFEF')
		|| (character >= '\uD800' && character <= '\uDBFF')
	);
}

export const smaliSimpleNameParser: Parser<string, string> = promiseCompose(
	createNonEmptyArrayParser(createPredicateElementParser(isSmaliSimpleNameChar)),
	characters => characters.join(''),
);

setParserName(smaliSimpleNameParser, 'smaliSimpleNameParser');

export const smaliMemberNameParser: Parser<string, string> = createUnionParser([
	smaliSimpleNameParser,
	promiseCompose(
		createTupleParser([
			createExactSequenceParser('<'),
			smaliSimpleNameParser,
			createExactSequenceParser('>'),
		]),
		strings => strings.join(''),
	),
]);

setParserName(smaliMemberNameParser, 'smaliMemberNameParser');

const smaliFullClassNameParser: Parser<string, string> = promiseCompose(
	createSeparatedArrayParser(
		smaliMemberNameParser,
		createExactSequenceParser('/'),
	),
	pathSegments => pathSegments.join('/'),
);

setParserName(smaliFullClassNameParser, 'smaliFullClassNameParser');

const smaliNonArrayFieldTypeDescriptorParser: Parser<string, string> = createUnionParser([
	createExactSequenceParser('Z'),
	createExactSequenceParser('B'),
	createExactSequenceParser('S'),
	createExactSequenceParser('C'),
	createExactSequenceParser('I'),
	createExactSequenceParser('J'),
	createExactSequenceParser('F'),
	createExactSequenceParser('D'),
	promiseCompose(
		createTupleParser([
			createExactSequenceParser('L'),
			smaliFullClassNameParser,
			createExactSequenceParser(';'),
		]),
		strings => strings.join(''),
	),
]);

setParserName(smaliNonArrayFieldTypeDescriptorParser, 'smaliNonArrayFieldTypeDescriptorParser');

const smaliFieldTypeDescriptorParser: Parser<string, string> = promiseCompose(
	createTupleParser([
		createArrayParser(createExactSequenceParser('[')),
		smaliNonArrayFieldTypeDescriptorParser,
	]),
	([ strings, string ]) => strings.join('') + string,
);

setParserName(smaliFieldTypeDescriptorParser, 'smaliFieldTypeDescriptorParser');

export const smaliTypeDescriptorParser: Parser<string, string> = createUnionParser([
	createExactSequenceParser('V'),
	smaliFieldTypeDescriptorParser,
]);

setParserName(smaliTypeDescriptorParser, 'smaliTypeDescriptorParser');
