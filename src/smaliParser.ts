import invariant from 'invariant';
import { type Simplify } from 'type-fest';
import { type DalvikBytecode, type DalvikBytecodeOperation, dalvikBytecodeOperationCompanion } from './dalvikBytecodeParser.js';
import {
	type DalvikExecutableAccessFlags, dalvikExecutableAccessFlagsDefault, type DalvikExecutableAnnotation, type DalvikExecutableClassAnnotations, type DalvikExecutableClassData, type DalvikExecutableClassDefinition, type DalvikExecutableClassMethodAnnotation, type DalvikExecutableClassParameterAnnotation, type DalvikExecutableCode, type DalvikExecutableField, dalvikExecutableFieldEquals, type DalvikExecutableFieldWithAccess, type DalvikExecutableMethod, dalvikExecutableMethodEquals, type DalvikExecutableMethodWithAccess, type DalvikExecutablePrototype, isDalvikExecutableField, isDalvikExecutableMethod,
} from './dalvikExecutable.js';
import { createExactSequenceParser } from './exactSequenceParser.js';
import { cloneParser, type Parser, setParserName } from './parser.js';
import { type ParserContext } from './parserContext.js';
import { promiseCompose } from './promiseCompose.js';
import { createTupleParser } from './tupleParser.js';
import { createUnionParser } from './unionParser.js';
import { createArrayParser } from './arrayParser.js';
import { jsonNumberParser, jsonStringParser } from './jsonParser.js';
import { createNonEmptyArrayParser } from './nonEmptyArrayParser.js';
import { createOptionalParser } from './optionalParser.js';
import { createNegativeLookaheadParser } from './negativeLookaheadParser.js';
import { createSeparatedArrayParser } from './separatedArrayParser.js';
import { smaliMemberNameParser, smaliTypeDescriptorParser } from './dalvikExecutableParser/stringSyntaxParser.js';
import { createDisjunctionParser } from './disjunctionParser.js';
import { formatSizes } from './dalvikBytecodeParser/formatSizes.js';
import { operationFormats } from './dalvikBytecodeParser/operationFormats.js';
import { createSeparatedNonEmptyArrayParser } from './separatedNonEmptyArrayParser.js';
import { parserCreatorCompose } from './parserCreatorCompose.js';
import { type IndexIntoMethodIds } from './dalvikExecutableParser/typedNumbers.js';
import { createDebugLogInputParser } from './debugLogInputParser.js';
import { createDebugLogParser } from './debugLogParser.js';
import { createElementParser } from './elementParser.js';
import { createTerminatedArrayParser } from './terminatedArrayParser.js';

function shortyFromLongy(longy: string): string {
	if (longy.startsWith('[')) {
		return 'L';
	}

	return longy.slice(0, 1);
}

function getOperationFormatSize(operation: SmaliCodeOperation): number {
	if (operation.operation === 'packed-switch-payload') {
		return (operation.branchOffsetIndices.length * 2) + 4;
	}

	if (operation.operation === 'sparse-switch-payload') {
		return (operation.branchOffsetIndices.length * 4) + 2;
	}

	if (operation.operation === 'fill-array-data-payload') {
		const dataSize = operation.data.length; // in bytes
		const paddingSize = dataSize % 2; // 1 if odd, 0 if even
		const totalBytes = 8 + dataSize + paddingSize; // header (8 bytes) + data + padding
		return totalBytes / 2; // Convert to code units (1 code unit = 2 bytes)
	}

	const operationFormat = operationFormats[operation.operation as keyof typeof operationFormats];
	invariant(operationFormat, 'Unknown operation format for "%s" (operation: %o)', operation.operation, operation);

	const operationSize = formatSizes[operationFormat];
	invariant(operationSize, 'Unknown operation size for format %s of operation %s', operationFormat, operation.operation);

	return operationSize;
}

const smaliNewlinesParser: Parser<void, string> = promiseCompose(
	createNonEmptyArrayParser(createExactSequenceParser('\n')),
	_newlines => undefined,
);

const smaliSingleWhitespaceParser = createExactSequenceParser(' ');

const smaliWhitespaceParser: Parser<void, string> = promiseCompose(
	createArrayParser(smaliSingleWhitespaceParser),
	_indentation => undefined,
);

const smaliSingleIndentationParser = createExactSequenceParser('    ');

const smaliIndentationParser: Parser<void, string> = promiseCompose(
	createArrayParser(smaliSingleIndentationParser),
	_indentation => undefined,
);

export const smaliCommentParser: Parser<string, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('#'),
		(async (parserContext: ParserContext<string, string>) => {
			const characters: string[] = [];

			while (true) {
				const character = await parserContext.peek(0);

				parserContext.invariant(character !== undefined, 'Unexpected end of input');

				invariant(character !== undefined, 'Unexpected end of input');

				if (character !== '\n') {
					characters.push(character);

					parserContext.skip(1);

					continue;
				}

				parserContext.skip(1);

				break;
			}

			return characters.join('');
		}),
	]),
	([
		_hash,
		comment,
	]) => comment,
);

const smaliIndentedCommentParser: Parser<string, string> = promiseCompose(
	createTupleParser([
		createNonEmptyArrayParser(smaliSingleIndentationParser),
		smaliCommentParser,
	]),
	([
		_indentation,
		comment,
	]) => comment,
);

const smaliCommentsOrNewlinesParser: Parser<string[], string> = promiseCompose(
	createArrayParser(createUnionParser<undefined | string, string, string>([
		smaliNewlinesParser,
		smaliIndentedCommentParser,
		smaliCommentParser,
	])),
	newlinesOrComments => newlinesOrComments.filter((newlineOrComment): newlineOrComment is string => typeof newlineOrComment === 'string'),
);

const smaliLineEndPraser: Parser<undefined | string, string> = promiseCompose(
	createTupleParser([
		createOptionalParser(smaliWhitespaceParser),
		createUnionParser<undefined | string, string, string>([
			smaliNewlinesParser,
			smaliCommentParser,
		]),
	]),
	([
		_optionalWhitespace,
		newlineOrComment,
	]) => newlineOrComment,
);

const smaliIdentifierParser: Parser<string, string> = async (parserContext: ParserContext<string, string>) => {
	const characters: string[] = [];

	while (true) {
		const character = await parserContext.peek(0);

		parserContext.invariant(character !== undefined, 'Unexpected end of input');

		invariant(character !== undefined, 'Unexpected end of input');

		if (
			character === '_'
			|| (
				character >= 'a' && character <= 'z'
			)
			|| (
				character >= 'A' && character <= 'Z'
			)
			|| (
				character >= '0' && character <= '9'
			)
		) {
			parserContext.skip(1);

			characters.push(character);

			continue;
		}

		parserContext.invariant(characters.length > 0, 'Expected at least one character');

		break;
	}

	return characters.join('');
};

setParserName(smaliIdentifierParser, 'smaliIdentifierParser');

const elementParser = createElementParser<string>();

const smaliHexNumberParser: Parser<number, string> = promiseCompose(
	createTupleParser([
		createOptionalParser(createExactSequenceParser('-')),
		createExactSequenceParser('0x'),
		createArrayParser(parserCreatorCompose(
			() => elementParser,
			character => async parserContext => {
				parserContext.invariant(
					(
						(character >= '0' && character <= '9')
						|| (character >= 'a' && character <= 'f')
						|| (character >= 'A' && character <= 'F')
					),
					'Expected "0" to "9", "a" to "f", "A" to "F", got "%s"',
					character,
				);

				return character;
			},
		)()),
		createOptionalParser(createExactSequenceParser('L')),
	]),
	([
		optionalMinus,
		_0x,
		valueCharacters,
		_optionalL,
	]) => {
		const sign = optionalMinus ? -1 : 1;

		return sign * Number.parseInt(valueCharacters.join(''), 16);
	},
);

const smaliNumberParser = createUnionParser<number, string>([
	promiseCompose(
		createTupleParser([
			createNegativeLookaheadParser(createUnionParser([
				createExactSequenceParser('0x'),
				createExactSequenceParser('-0x'),
			])),
			jsonNumberParser,
			createOptionalParser(createUnionParser([
				createExactSequenceParser('f'),
				createExactSequenceParser('F'),
			])),
		]),
		([
			_not0x,
			number,
			optionalFloatSuffix,
		]) => {
			// If there's an 'f' or 'F' suffix, convert to 32-bit float precision
			// to match what would be stored in a DEX file
			if (optionalFloatSuffix) {
				const float32Array = new Float32Array(1);
				float32Array[0] = number;
				return float32Array[0];
			}

			return number;
		},
	),
	smaliHexNumberParser,
]);

setParserName(smaliNumberParser, 'smaliNumberParser');

const smaliQuotedStringParser: Parser<string, string> = promiseCompose(
	jsonStringParser,
	string => string.replaceAll(String.raw`\'`, '\''),
);

// Parser for smali character literals (e.g., 'a', ':', '\'', '\\')
const smaliCharacterLiteralParser: Parser<number, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('\''),
		createDisjunctionParser<string, string>([
			// Handle escape sequences (must come before regular characters)
			promiseCompose(createExactSequenceParser(String.raw`\\`), () => '\\'),
			promiseCompose(createExactSequenceParser(String.raw`\'`), () => '\''),
			promiseCompose(createExactSequenceParser(String.raw`\"`), () => '"'),
			promiseCompose(createExactSequenceParser(String.raw`\n`), () => '\n'),
			promiseCompose(createExactSequenceParser(String.raw`\r`), () => '\r'),
			promiseCompose(createExactSequenceParser(String.raw`\t`), () => '\t'),
			promiseCompose(createExactSequenceParser(String.raw`\b`), () => '\b'),
			promiseCompose(createExactSequenceParser(String.raw`\f`), () => '\f'),
			// Handle regular characters (not a single quote)
			parserCreatorCompose(
				() => createElementParser<string>(),
				character => async parserContext => {
					parserContext.invariant(character !== '\'', 'Unexpected single quote');
					return character;
				},
			)(),
		]),
		createExactSequenceParser('\''),
	]),
	([, character]) => character.charCodeAt(0),
);

setParserName(smaliCharacterLiteralParser, 'smaliCharacterLiteralParser');

// Parser that matches identifier continuation characters (letters, digits, $, -, _)
const smaliIdentifierContinuationParser: Parser<string, string> = async (parserContext: ParserContext<string, string>) => {
	const character = await parserContext.peek(0);
	
	parserContext.invariant(character !== undefined, 'Unexpected end of input');
	
	invariant(character !== undefined, 'Unexpected end of input');
	
	parserContext.invariant(
		(character >= 'a' && character <= 'z')
		|| (character >= 'A' && character <= 'Z')
		|| (character >= '0' && character <= '9')
		|| character === '$'
		|| character === '-'
		|| character === '_',
		'Expected identifier continuation character, got "%s"',
		character,
	);
	
	parserContext.skip(1);
	
	return character;
};

setParserName(smaliIdentifierContinuationParser, 'smaliIdentifierContinuationParser');

// Helper to create an access flag parser with word boundary check
const createAccessFlagParser = (keyword: string): Parser<typeof keyword, string> => promiseCompose(
	createTupleParser([
		createExactSequenceParser(keyword),
		createNegativeLookaheadParser(smaliIdentifierContinuationParser),
	]),
	([flag]) => flag,
);

const smaliAccessFlagsParser: Parser<DalvikExecutableAccessFlags, string> = promiseCompose(
	createSeparatedArrayParser(
		createUnionParser<keyof DalvikExecutableAccessFlags | 'declared-synchronized', string>([
			createAccessFlagParser('public'),
			createAccessFlagParser('protected'),
			createAccessFlagParser('private'),
			createAccessFlagParser('final'),
			createAccessFlagParser('bridge'),
			createAccessFlagParser('synthetic'),
			createAccessFlagParser('varargs'),
			createAccessFlagParser('static'),
			createAccessFlagParser('constructor'),
			createAccessFlagParser('abstract'),
			createAccessFlagParser('native'),
			createAccessFlagParser('volatile'),
			createAccessFlagParser('transient'),
			createAccessFlagParser('synchronized'),
			createAccessFlagParser('declared-synchronized'),
			createAccessFlagParser('strict'),
			createAccessFlagParser('interface'),
			createAccessFlagParser('annotation'),
			createAccessFlagParser('enum'),
		]),
		smaliSingleWhitespaceParser,
	),
	accessFlagNames => {
		const accessFlags = dalvikExecutableAccessFlagsDefault();

		for (const accessFlagName of accessFlagNames) {
			if (accessFlagName === 'declared-synchronized') {
				accessFlags.declaredSynchronized = true;
			} else {
				accessFlags[accessFlagName] = true;
			}
		}

		return accessFlags;
	},
);

const smaliClassDeclarationParser: Parser<Pick<DalvikExecutableClassDefinition<unknown>, 'accessFlags' | 'class'>, string> = promiseCompose(
	createTupleParser([
		smaliCommentsOrNewlinesParser,
		createExactSequenceParser('.class '),
		createOptionalParser(promiseCompose(
			createTupleParser([
				smaliAccessFlagsParser,
				smaliSingleWhitespaceParser,
			]),
			([
				accessFlags,
			]) => accessFlags,
		)),
		smaliTypeDescriptorParser,
		smaliLineEndPraser,
	]),
	([
		_commentsOrNewlines,
		_dotClass,
		accessFlags = dalvikExecutableAccessFlagsDefault(),
		classPath,
	]) => ({
		accessFlags,
		class: classPath,
	}),
);

setParserName(smaliClassDeclarationParser, 'smaliClassDeclarationParser');

const smaliSuperDeclarationParser: Parser<Pick<DalvikExecutableClassDefinition<unknown>, 'superclass'>, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('.super '),
		smaliTypeDescriptorParser,
		smaliLineEndPraser,
	]),
	([
		_super,
		superclass,
		_newline,
	]) => ({
		superclass,
	}),
);

setParserName(smaliSuperDeclarationParser, 'smaliSuperDeclarationParser');

const smaliInterfaceDeclarationParser: Parser<string, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('.implements '),
		smaliTypeDescriptorParser,
		smaliLineEndPraser,
	]),
	([
		_interface,
		interface_,
		_newline,
	]) => interface_,
);

setParserName(smaliInterfaceDeclarationParser, 'smaliInterfaceDeclarationParser');

const smaliSourceDeclarationParser: Parser<Pick<DalvikExecutableClassDefinition<unknown>, 'sourceFile'>, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('.source '),
		smaliQuotedStringParser,
		smaliLineEndPraser,
	]),
	([
		_source,
		sourceFile,
		_newline,
	]) => ({
		sourceFile,
	}),
);

type SmaliAnnotationElement = {
	name: string;
	value: unknown; // TODO
};

const smaliEnumValueParser: Parser<DalvikExecutableField, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('.enum '),
		smaliTypeDescriptorParser,
		createExactSequenceParser('->'),
		smaliMemberNameParser,
		createExactSequenceParser(':'),
		smaliTypeDescriptorParser,
	]),
	([
		_enum,
		classType,
		_arrow,
		fieldName,
		_colon,
		fieldType,
	]) => ({
		class: classType,
		type: fieldType,
		name: fieldName,
	}),
);

setParserName(smaliEnumValueParser, 'smaliEnumValueParser');

const smaliMethodPrototypeParser: Parser<DalvikExecutablePrototype, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('('),
		createArrayParser(smaliTypeDescriptorParser),
		createExactSequenceParser(')'),
		smaliTypeDescriptorParser,
	]),
	([
		_openParenthesis,
		parameters,
		_closeParenthesis,
		returnType,
	]) => ({
		parameters,
		returnType,
		shorty: shortyFromLongy(returnType) + parameters.map(parameter => {
			if (parameter === 'V') {
				return '';
			}

			return shortyFromLongy(parameter);
		}).join(''),
	}),
);

setParserName(smaliMethodPrototypeParser, 'smaliMethodPrototypeParser');

const smaliParametersMethodParser: Parser<DalvikExecutableMethod, string> = promiseCompose(
	createTupleParser([
		smaliTypeDescriptorParser,
		createExactSequenceParser('->'),
		smaliMemberNameParser,
		smaliMethodPrototypeParser,
	]),
	([
		classPath,
		_separator,
		methodName,
		prototype,
	]) => ({
		class: classPath,
		prototype,
		name: methodName,
	}),
);

setParserName(smaliParametersMethodParser, 'smaliParametersMethodParser');

const smaliAnnotationElementParser: Parser<SmaliAnnotationElement, string> = promiseCompose(
	createTupleParser([
		smaliIndentationParser,
		smaliIdentifierParser,
		createExactSequenceParser(' = '),
		createDisjunctionParser([
			smaliEnumValueParser,
			smaliQuotedStringParser,
			smaliParametersMethodParser,
			smaliTypeDescriptorParser,
			smaliNumberParser,
			promiseCompose(
				createExactSequenceParser('null'),
				() => null,
			),
			promiseCompose(
				createTupleParser([
					createExactSequenceParser('{\n'),
					createSeparatedArrayParser(
						promiseCompose(
							createTupleParser([
								smaliIndentationParser,
								smaliEnumValueParser,
							]),
							([
								_indentation,
								value,
							]) => value,
						),
						createExactSequenceParser(',\n'),
					),
					smaliLineEndPraser,
					smaliIndentationParser,
					createExactSequenceParser('}'),
				]),
				([
					_openBrace,
					value,
					_closeBrace,
				]) => value,
			),
			promiseCompose(
				createTupleParser([
					createExactSequenceParser('{\n'),
					createSeparatedArrayParser(
						promiseCompose(
							createTupleParser([
								smaliIndentationParser,
								smaliTypeDescriptorParser,
							]),
							([
								_indentation,
								value,
							]) => value,
						),
						createExactSequenceParser(',\n'),
					),
					smaliLineEndPraser,
					smaliIndentationParser,
					createExactSequenceParser('}'),
				]),
				([
					_openBrace,
					value,
					_closeBrace,
				]) => value,
			),
			promiseCompose(
				createTupleParser([
					createExactSequenceParser('{\n'),
					createSeparatedArrayParser(
						promiseCompose(
							createTupleParser([
								smaliIndentationParser,
								smaliQuotedStringParser,
							]),
							([
								_indentation,
								value,
							]) => value,
						),
						createExactSequenceParser(',\n'),
					),
					smaliLineEndPraser,
					smaliIndentationParser,
					createExactSequenceParser('}'),
				]),
				([
					_openBrace,
					value,
					_closeBrace,
				]) => value,
			),
			promiseCompose(
				createTupleParser([
					createExactSequenceParser('{\n'),
					createSeparatedArrayParser(
						promiseCompose(
							createTupleParser([
								smaliIndentationParser,
								smaliNumberParser,
							]),
							([
								_indentation,
								value,
							]) => value,
						),
						createExactSequenceParser(',\n'),
					),
					smaliLineEndPraser,
					smaliIndentationParser,
					createExactSequenceParser('}'),
				]),
				([
					_openBrace,
					value,
					_closeBrace,
				]) => value,
			),
		]),
		smaliLineEndPraser,
	]),
	([
		_indentation,
		name,
		_equalsSign,
		value,
		_newline,
	]) => ({
		name,
		value,
	}),
);

setParserName(smaliAnnotationElementParser, 'smaliAnnotationElementParser');

type SmaliAnnotation = {
	type: string;
	elements: SmaliAnnotationElement[];
	visibility: 'build' | 'runtime' | 'system';
};

export const smaliAnnotationParser: Parser<SmaliAnnotation, string> = promiseCompose(
	createTupleParser([
		smaliIndentationParser,
		createExactSequenceParser('.annotation '),
		createUnionParser<'build' | 'runtime' | 'system', string, string>([
			createExactSequenceParser('build'),
			createExactSequenceParser('runtime'),
			createExactSequenceParser('system'),
		]),
		smaliSingleWhitespaceParser,
		smaliTypeDescriptorParser,
		smaliLineEndPraser,
		createArrayParser(smaliAnnotationElementParser),
		smaliIndentationParser,
		createExactSequenceParser('.end annotation\n'),
	]),
	([
		_indentation0,
		_annotation,
		visibility,
		_space,
		type,
		_newline,
		elements,
		_indentation1,
		_endAnnotation,
	]) => ({
		type,
		elements,
		visibility,
	}),
);

setParserName(smaliAnnotationParser, 'smaliAnnotationParser');

type SmaliField = {
	field: DalvikExecutableFieldWithAccess;
	annotations: SmaliAnnotation[];
	initialValue?: number | string | boolean | null;
};

export const smaliFieldParser: Parser<SmaliField, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('.field '),
		createOptionalParser(promiseCompose(
			createTupleParser([
				smaliAccessFlagsParser,
				smaliSingleWhitespaceParser,
			]),
			([accessFlags, _space]) => accessFlags,
		)),
		smaliMemberNameParser,
		createExactSequenceParser(':'),
		smaliTypeDescriptorParser,
		createOptionalParser(promiseCompose(
			createTupleParser([
				createExactSequenceParser(' = '),
				createUnionParser<number | string | boolean | null, string>([
					smaliCharacterLiteralParser,
					smaliNumberParser,
					smaliQuotedStringParser,
					promiseCompose(
						createExactSequenceParser('true'),
						() => true,
					),
					promiseCompose(
						createExactSequenceParser('false'),
						() => false,
					),
					promiseCompose(
						createExactSequenceParser('null'),
						() => null,
					),
				]),
			]),
			([
				_equals,
				value,
			]) => value,
		)),
		smaliLineEndPraser,
		createOptionalParser(promiseCompose(
			createTupleParser([
				createSeparatedArrayParser(
					smaliAnnotationParser,
					smaliNewlinesParser,
				),
				createExactSequenceParser('.end field\n'),
			]),
			([
				annotations,
				_endField,
			]) => annotations,
		)),
	]),
	([
		_field,
		accessFlags,
		name,
		_colon,
		type,
		initialValue,
		_newline,
		annotations,
	]) => ({
		field: {
			accessFlags: accessFlags ?? dalvikExecutableAccessFlagsDefault(),
			field: {
				class: 'FILLED_LATER',
				type,
				name,
			},
		},
		annotations: annotations ?? [],
		...(initialValue !== undefined ? { initialValue } : {}),
	}),
);

setParserName(smaliFieldParser, 'smaliFieldParser');

type SmaliFields = {
	staticFields: SmaliField[];
	instanceFields: SmaliField[];
};

const smaliFieldsParser: Parser<SmaliFields, string> = promiseCompose(
	createSeparatedNonEmptyArrayParser<string[] | SmaliField, string>(
		smaliFieldParser,
		smaliCommentsOrNewlinesParser,
	),
	fieldsAndComments => {
		let type: 'staticField' | 'instanceField' = 'instanceField';

		const staticFields: SmaliField[] = [];
		const instanceFields: SmaliField[] = [];

		for (const fieldOrComment of fieldsAndComments) {
			if (Array.isArray(fieldOrComment)) {
				for (const comment of fieldOrComment) {
					if (comment === ' static fields') {
						type = 'staticField';
					}

					if (comment === ' instance fields') {
						type = 'instanceField';
					}
				}

				continue;
			}

			invariant(typeof fieldOrComment === 'object', 'Expected field or comment');

			const field = fieldOrComment;

			if (
				type === 'staticField'
				|| field.field.accessFlags.static
			) {
				staticFields.push(field);

				continue;
			}

			if (type === 'instanceField') {
				instanceFields.push(field);

				continue;
			}

			invariant(false, 'Expected field type');
		}

		return {
			staticFields,
			instanceFields,
		};
	},
);

setParserName(smaliFieldsParser, 'smaliFieldsParser');

const smaliShortyFieldTypeParser: Parser<string, string> = createUnionParser([
	createExactSequenceParser('Z'),
	createExactSequenceParser('B'),
	createExactSequenceParser('S'),
	createExactSequenceParser('C'),
	createExactSequenceParser('I'),
	createExactSequenceParser('J'),
	createExactSequenceParser('F'),
	createExactSequenceParser('D'),
]);

setParserName(smaliShortyFieldTypeParser, 'smaliShortyFieldTypeParser');

const smaliShortyReturnTypeParser: Parser<string, string> = createUnionParser([
	createExactSequenceParser('V'),
	smaliShortyFieldTypeParser,
]);

setParserName(smaliShortyReturnTypeParser, 'smaliShortyReturnTypeParser');

function shortyGetInsSize(shorty: string): number {
	let size = 0;

	for (const char of shorty.slice(1)) {
		if (char === 'J' || char === 'D') {
			size += 2;
		} else if (char !== 'V') {
			size += 1;
		}
	}

	return size;
}

const smaliCodeRegistersParser: Parser<number, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('    .registers '),
		smaliNumberParser,
		smaliLineEndPraser,
	]),
	([
		_registers,
		registers,
		_newline,
	]) => registers,
);

setParserName(smaliCodeRegistersParser, 'smaliCodeRegistersParser');

const smaliCodeLineParser: Parser<number, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('    .line '),
		smaliNumberParser,
		smaliLineEndPraser,
	]),
	([
		_line,
		line,
		_newline,
	]) => line,
);

setParserName(smaliCodeLineParser, 'smaliCodeLineParser');

type SmaliRegister = {
	prefix: 'v' | 'p';
	index: number;
};

function isSmaliRegister(value: unknown): value is SmaliRegister {
	return (
		value !== null
		&& typeof value === 'object'
		&& 'prefix' in value
		&& 'index' in value
		&& typeof (value as SmaliRegister).prefix === 'string'
		&& typeof (value as SmaliRegister).index === 'number'
	);
}

const smaliParametersRegisterParser: Parser<SmaliRegister, string> = promiseCompose(
	createUnionParser<['v' | 'p', number], string>([
		createTupleParser([
			createExactSequenceParser('v'),
			smaliNumberParser,
		]),
		createTupleParser([
			createExactSequenceParser('p'),
			smaliNumberParser,
		]),
	]),
	([
		prefix,
		index,
	]) => ({
		prefix,
		index,
	}),
);

setParserName(smaliParametersRegisterParser, 'smaliParametersRegisterParser');

const smaliCodeLocalParser: Parser<SmaliRegister, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('    .local '),
		smaliParametersRegisterParser,
		createOptionalParser(createTupleParser([
			createExactSequenceParser(','),
			smaliWhitespaceParser,
			smaliQuotedStringParser,
			createExactSequenceParser(':'),
			smaliTypeDescriptorParser,
		])),
		smaliLineEndPraser,
	]),
	([
		_local,
		local,
		_newlocal,
	]) => local,
);

setParserName(smaliCodeLocalParser, 'smaliCodeLocalParser');

type SmaliCodeParameter = {
	register: SmaliRegister;
	annotation: SmaliAnnotation | undefined;
};

export const smaliCodeParameterParser: Parser<SmaliCodeParameter, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('    .param '),
		smaliParametersRegisterParser,
		createOptionalParser(createTupleParser([
			createExactSequenceParser(','),
			smaliWhitespaceParser,
			smaliQuotedStringParser,
			smaliWhitespaceParser,
		])),
		createOptionalParser(smaliWhitespaceParser),
		smaliCommentsOrNewlinesParser,
		createOptionalParser(createTupleParser([
			smaliAnnotationParser,
			smaliIndentationParser,
			createExactSequenceParser('.end param\n'),
		])),
	]),
	([
		_parameter,
		register,
		_optionalCommaAndString,
		_whitespace,
		_commentOrNewline,
		optionalAnnotation,
	]) => {
		let annotation: undefined | SmaliAnnotation;

		if (optionalAnnotation) {
			annotation = optionalAnnotation[0];
		}

		return {
			register,
			annotation,
		};
	},
);

setParserName(smaliCodeParameterParser, 'smaliCodeParameterParser');

const smaliCodeLabelParser: Parser<string, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser(':'),
		smaliIdentifierParser,
	]),
	([
		_label,
		label,
	]) => label,
);

setParserName(smaliCodeLabelParser, 'smaliCodeLabelParser');

const smaliCodeLabelLineParser: Parser<string, string> = promiseCompose(
	createTupleParser([
		smaliIndentationParser,
		smaliCodeLabelParser,
		smaliLineEndPraser,
	]),
	([
		_label,
		label,
		_newlabel,
	]) => label,
);

setParserName(smaliCodeLabelLineParser, 'smaliCodeLabelLineParser');

type SmaliCatchDirective = {
	type: string | undefined; // undefined for .catchall
	startLabel: string;
	endLabel: string;
	handlerLabel: string;
};

const smaliCatchDirectiveParser: Parser<SmaliCatchDirective, string> = promiseCompose(
	createTupleParser([
		smaliIndentationParser,
		createExactSequenceParser('.catch'),
		createUnionParser<string | undefined, string, string>([
			promiseCompose(
				createExactSequenceParser('all'),
				() => undefined as undefined,
			),
			promiseCompose(
				createTupleParser([
					createExactSequenceParser(' '),
					smaliTypeDescriptorParser,
				]),
				([
					_space,
					type,
				]) => type,
			),
		]),
		createExactSequenceParser(' {'),
		smaliCodeLabelParser,
		createExactSequenceParser(' .. '),
		smaliCodeLabelParser,
		createExactSequenceParser('} '),
		smaliCodeLabelParser,
		smaliLineEndPraser,
	]),
	([
		_indentation,
		_catch,
		type,
		_openBrace,
		startLabel,
		_dots,
		endLabel,
		_closeBrace,
		handlerLabel,
		_newline,
	]) => ({
		type,
		startLabel,
		endLabel,
		handlerLabel,
	}),
);

setParserName(smaliCatchDirectiveParser, 'smaliCatchDirectiveParser');

type SmaliLabeledCatchDirective = {
	labels: string[];
	catchDirective: SmaliCatchDirective;
};

const smaliLabeledCatchDirectiveParser: Parser<SmaliLabeledCatchDirective, string> = promiseCompose(
	createTupleParser([
		createArrayParser(smaliCodeLineParser),
		createOptionalParser(smaliCodeLocalParser),
		createArrayParser(smaliCodeLabelLineParser),
		smaliCatchDirectiveParser,
	]),
	([
		_lines,
		_local,
		labels,
		catchDirective,
	]) => ({
		labels,
		catchDirective,
	}),
);

setParserName(smaliLabeledCatchDirectiveParser, 'smaliLabeledCatchDirectiveParser');

const smaliParametersRegisterRangeParser: Parser<SmaliRegister[], string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('{'),
		smaliParametersRegisterParser,
		createExactSequenceParser(' .. '),
		smaliParametersRegisterParser,
		createExactSequenceParser('}'),
	]),
	([
		_openBrace,
		startRegister,
		_dotDot,
		endRegister,
		_closeBrace,
	]) => {
		invariant(
			startRegister.prefix === endRegister.prefix,
			'Register range must use the same prefix',
		);

		invariant(
			startRegister.index <= endRegister.index,
			'Register range start must be less than or equal to end',
		);

		const registers: SmaliRegister[] = [];
		for (let i = startRegister.index; i <= endRegister.index; i++) {
			registers.push({
				prefix: startRegister.prefix,
				index: i,
			});
		}

		return registers;
	},
);

setParserName(smaliParametersRegisterRangeParser, 'smaliParametersRegisterRangeParser');

const smaliParametersRegisterListParser: Parser<SmaliRegister[], string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('{'),
		createArrayParser(promiseCompose(
			createTupleParser([
				smaliParametersRegisterParser,
				createOptionalParser(createExactSequenceParser(', ')),
			]),
			([
				parameter,
				_comma,
			]) => parameter,
		)),
		createExactSequenceParser('}'),
	]),
	([
		_openBrace,
		parameters,
		_closeBrace,
	]) => parameters,
);

setParserName(smaliParametersRegisterListParser, 'smaliParametersRegisterListParser');

const smaliParametersRegistersParser: Parser<SmaliRegister[], string> = createUnionParser([
	smaliParametersRegisterRangeParser,
	smaliParametersRegisterListParser,
]);

setParserName(smaliParametersRegistersParser, 'smaliParametersRegistersParser');

const smaliParametersStringParser: Parser<string, string> = cloneParser(smaliQuotedStringParser);

setParserName(smaliParametersStringParser, 'smaliParametersStringParser');

const smaliParametersIntegerParser: Parser<number | bigint, string> = promiseCompose(
	createTupleParser([
		createOptionalParser(createExactSequenceParser('-')),
		createExactSequenceParser('0x'),
		async parserContext => {
			const characters: string[] = [];

			while (true) {
				const character = await parserContext.peek(0);

				parserContext.invariant(character !== undefined, 'Unexpected end of input');

				invariant(character !== undefined, 'Unexpected end of input');

				if (
					(character >= '0' && character <= '9')
					|| (character >= 'a' && character <= 'f')
					|| (character >= 'A' && character <= 'F')
				) {
					characters.push(character);

					parserContext.skip(1);

					continue;
				}

				break;
			}

			return characters.join('');
		},
		createOptionalParser(createExactSequenceParser('L')),
	]),
	([
		optionalMinus,
		_0x,
		value,
		optionalL,
	]) => {
		if (optionalL) {
			const sign = optionalMinus ? -1n : 1n;

			return sign * BigInt('0x' + value);
		}

		const sign = optionalMinus ? -1 : 1;

		return sign * Number.parseInt(value, 16);
	},
);

setParserName(smaliParametersIntegerParser, 'smaliParametersIntegerParser');

const smaliParametersLabelParser: Parser<string, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser(':'),
		smaliIdentifierParser,
	]),
	([
		_label,
		label,
	]) => label,
);

setParserName(smaliParametersLabelParser, 'smaliParametersLabelParser');

const smaliParametersTypeParser: Parser<string, string> = cloneParser(smaliTypeDescriptorParser);

setParserName(smaliParametersTypeParser, 'smaliParametersTypeParser');

const smaliParametersFieldParser: Parser<DalvikExecutableField, string> = promiseCompose(
	createTupleParser([
		smaliTypeDescriptorParser,
		createExactSequenceParser('->'),
		smaliMemberNameParser,
		createExactSequenceParser(':'),
		smaliTypeDescriptorParser,
	]),
	([
		classPath,
		_separator,
		fieldName,
		_colon,
		type,
	]) => ({
		class: classPath,
		name: fieldName,
		type,
	}),
);

setParserName(smaliParametersFieldParser, 'smaliParametersFieldParser');

type SmaliCodeOperationParameter =
	| SmaliRegister
	| SmaliRegister[]
	| string
	| DalvikExecutableMethod
;

const smaliCodeOperationParametersParser: Parser<SmaliCodeOperationParameter[], string> = createArrayParser(promiseCompose(
	createTupleParser([
		createUnionParser<SmaliCodeOperationParameter, string>([
			smaliParametersRegisterParser,
			smaliParametersRegistersParser,
			smaliParametersStringParser,
			smaliParametersIntegerParser,
			promiseCompose(
				createTupleParser([
					createNegativeLookaheadParser(smaliParametersIntegerParser),
					smaliNumberParser,
				]),
				([ _notInteger, number ]) => number,
			),
			smaliParametersLabelParser,
			promiseCompose(
				createTupleParser([
					createNegativeLookaheadParser(smaliParametersMethodParser),
					createNegativeLookaheadParser(smaliParametersFieldParser),
					smaliParametersTypeParser,
				]),
				([
					_notMethod,
					_notField,
					type,
				]) => type,
			),
			smaliParametersMethodParser,
			smaliParametersFieldParser,
		]),
		createOptionalParser(createExactSequenceParser(', ')),
	]),
	([
		parameter,
		_comma,
	]) => parameter,
));

setParserName(smaliCodeOperationParametersParser, 'smaliCodeOperationParametersParser');

const smaliCodeOperationNameParser: Parser<string, string> = promiseCompose(
	createTupleParser([
		promiseCompose(
			createSeparatedArrayParser(
				smaliIdentifierParser,
				createExactSequenceParser('-'),
			),
			parts => parts.join('-'),
		),
		createOptionalParser(promiseCompose(
			createTupleParser([
				createExactSequenceParser('/'),
				smaliIdentifierParser,
			]),
			([ slash, name ]) => slash + name,
		)),
	]),
	([
		name,
		optionalSlashName,
	]) => name + (optionalSlashName || ''),
);

setParserName(smaliCodeOperationNameParser, 'smaliCodeOperationNameParser');

type SmaliOneLineCodeOperation = {
	operation: string;
	parameters: SmaliCodeOperationParameter[];
};

const smaliOneLineCodeOperationParser: Parser<SmaliOneLineCodeOperation, string> = promiseCompose(
	createTupleParser([
		smaliSingleIndentationParser,
		smaliCodeOperationNameParser,
		promiseCompose(
			createOptionalParser(createTupleParser([
				smaliSingleWhitespaceParser,
				smaliCodeOperationParametersParser,
			])),
			undefinedOrParameters => undefinedOrParameters === undefined ? [] : undefinedOrParameters[1],
		),
		smaliLineEndPraser,
	]),
	([
		_indent,
		operation,
		parameters,
		_newline,
	]) => ({
		operation,
		parameters,
	}),
);

setParserName(smaliOneLineCodeOperationParser, 'smaliOneLineCodeOperationParser');

type SmaliCodeOperationLabelsBody = string[];

const createMultilineSmaliCodeOperationLabelsBodyParser: (operationName: string) => Parser<SmaliCodeOperationLabelsBody, string> = operationName => promiseCompose(
	createTupleParser([
		createArrayParser(promiseCompose(
			createTupleParser([
				smaliIndentationParser,
				smaliCodeLabelParser,
				smaliLineEndPraser,
			]),
			([
				_indentation,
				label,
				_newline,
			]) => label,
		)),
		smaliIndentationParser,
		createExactSequenceParser('.end '),
		createExactSequenceParser(operationName),
		smaliLineEndPraser,
	]),
	([
		labels,
	]) => labels,
);

type SmaliCodeOperationLabelMapBody = Array<readonly [number | bigint, string]>;

const createMultilineSmaliCodeOperationLabelMapBodyParser: (operationName: string) => Parser<SmaliCodeOperationLabelMapBody, string> = operationName => promiseCompose(
	createTupleParser([
		createArrayParser(promiseCompose(
			createTupleParser([
				smaliIndentationParser,
				smaliParametersIntegerParser,
				createExactSequenceParser(' -> '),
				smaliCodeLabelParser,
				smaliLineEndPraser,
			]),
			([
				_indentation,
				key,
				_arrow,
				label,
				_newline,
			]) => [
				key,
				label,
			] as const,
		)),
		smaliIndentationParser,
		createExactSequenceParser('.end '),
		createExactSequenceParser(operationName),
		smaliLineEndPraser,
	]),
	([
		labels,
	]) => labels,
);

type SmaliCodeOperationIntegersBody = Array<number | bigint>;

const createMultilineSmaliCodeOperationIntegersBodyParser: (operationName: string) => Parser<SmaliCodeOperationIntegersBody, string> = operationName => promiseCompose(
	createTupleParser([
		createArrayParser(promiseCompose(
			createTupleParser([
				smaliIndentationParser,
				smaliParametersIntegerParser,
				smaliLineEndPraser,
			]),
			([
				_indentation,
				key,
			]) => key,
		)),
		smaliIndentationParser,
		createExactSequenceParser('.end '),
		createExactSequenceParser(operationName),
		smaliLineEndPraser,
	]),
	([
		labels,
	]) => labels,
);

type SmaliCodeOperationBody =
	| SmaliCodeOperationLabelsBody
	| SmaliCodeOperationIntegersBody
	| SmaliCodeOperationLabelMapBody
;

const createMultilineSmaliCodeOperationBodyParser: (operationName: string) => Parser<SmaliCodeOperationBody, string> = operationName => createUnionParser([
	createMultilineSmaliCodeOperationLabelsBodyParser(operationName),
	createMultilineSmaliCodeOperationIntegersBodyParser(operationName),
	createMultilineSmaliCodeOperationLabelMapBodyParser(operationName),
]);

type SmaliMultilineCodeOperation = {
	operation: string;
	parameters: SmaliCodeOperationParameter[];
	body: SmaliCodeOperationBody;
};

const smaliMultilineCodeOperationParser: Parser<SmaliMultilineCodeOperation, string> = parserCreatorCompose(
	() => promiseCompose(
		createTupleParser([
			smaliSingleIndentationParser,
			createExactSequenceParser('.'),
			smaliCodeOperationNameParser,
			promiseCompose(
				createOptionalParser(createTupleParser([
					smaliSingleWhitespaceParser,
					smaliCodeOperationParametersParser,
				])),
				undefinedOrParameters => undefinedOrParameters === undefined ? [] : undefinedOrParameters[1],
			),
			smaliLineEndPraser,
		]),
		([
			_indent,
			_dot,
			operation,
			parameters,
			_newline,
		]) => ({
			operation,
			parameters,
		}),
	),
	({ operation, parameters }) => promiseCompose(
		createMultilineSmaliCodeOperationBodyParser(operation),
		body => ({
			operation,
			parameters,
			body,
		}),
	),
)();

setParserName(smaliMultilineCodeOperationParser, 'smaliMultilineCodeOperationParser');

type SmaliLooseCodeOperation =
	| SmaliOneLineCodeOperation
	| SmaliMultilineCodeOperation
;

const smaliLooseCodeOperationParser: Parser<SmaliLooseCodeOperation, string> = createUnionParser([
	smaliOneLineCodeOperationParser,
	smaliMultilineCodeOperationParser,
]);

setParserName(smaliLooseCodeOperationParser, 'smaliLooseCodeOperationParser');

type SmaliCodeOperationFromDalvikBytecodeOperation<T extends DalvikBytecodeOperation> =
	T extends { branchOffsets: number[] }
		? Simplify<Omit<T, 'branchOffsets'> & { branchOffsetIndices: number[] }>
		: T extends { branchOffset: number }
			? Simplify<Omit<T, 'branchOffset'> & { branchOffsetIndex: number }>
			: T extends { methodIndex: IndexIntoMethodIds }
				? Simplify<Omit<T, 'methodIndex'> & { method: DalvikExecutableMethod }>
				: T
;

type SmaliCodeOperation = SmaliCodeOperationFromDalvikBytecodeOperation<DalvikBytecodeOperation>;

export const smaliCodeOperationParser: Parser<SmaliCodeOperation, string> = promiseCompose(
	smaliLooseCodeOperationParser,
	operation => {
		const operation_ = {
			operation: operation.operation,
			// Line,
			// local,
			// parameters: (operation as any).parameters,
		} as any; // TODO

		if ('body' in operation) {
			const operationDexName = payloadOperationSmaliNameToDexName.get(operation.operation);

			invariant(operationDexName, 'Unknown payload operation for %s', operation.operation);

			operation_.operation = operationDexName;

			if (operationDexName === 'sparse-switch-payload') {
				const map = new Map<number | bigint, string>(operation.body as SmaliCodeOperationLabelMapBody);
				operation_.keys = [ ...map.keys() ];
				operation_.branchLabels = [ ...map.values() ];
			} else if (operationDexName === 'fill-array-data-payload') {
				// Get elementWidth from parameters (first parameter)
				const elementWidth = operation.parameters[0];
				invariant(typeof elementWidth === 'number', 'Expected elementWidth to be a number');

				operation_.elementWidth = elementWidth;

				// Convert integer values to bytes (little-endian)
				const values = operation.body as SmaliCodeOperationIntegersBody;
				const data: number[] = [];

				for (const value of values) {
					const numberValue = typeof value === 'bigint' ? Number(value) : value;

					// Convert to bytes based on elementWidth (little-endian)
					for (let i = 0; i < elementWidth; i++) {
						data.push((numberValue >> (i * 8)) & 0xFF);
					}
				}

				operation_.data = data;
			} else {
				operation_.branchLabels = operation.body;
			}
		}

		const hasRegisters = Array.isArray(operation.parameters.at(0));
		if (hasRegisters) {
			operation_.registers = [];
		}

		for (const parameter of (operation as unknown as { parameters: unknown[] }).parameters.flat() ?? []) {
			if (isDalvikExecutableMethod(parameter)) {
				operation_.method = parameter;

				continue;
			}

			if (isDalvikExecutableField(parameter)) {
				operation_.field = parameter;

				continue;
			}

			if (isSmaliRegister(parameter)) {
				operation_.registers ||= [];

				operation_.registers.push(parameter);

				continue;
			}

			if (typeof parameter === 'string') {
				if (operationsWithTypeArgument.has(operation_.operation)) {
					operation_.type = parameter;

					continue;
				}

				if (operationsWithBranchLabelArgument.has(operation_.operation)) {
					operation_.branchLabel = parameter;

					continue;
				}

				operation_.string = parameter;

				continue;
			}

			if (typeof parameter === 'number' || typeof parameter === 'bigint') {
				// Skip for fill-array-data-payload, already handled in body processing
				if (operation_.operation === 'fill-array-data-payload') {
					continue;
				}

				// Const-wide operations always use bigint values
				if (operationsWithBigintValue.has(operation_.operation)) {
					operation_.value = typeof parameter === 'number' ? BigInt(parameter) : parameter;
				} else {
					operation_.value = parameter;
				}

				continue;
			}

			invariant(false, 'TODO: parameter: %s, operation: %s', JSON.stringify(parameter), JSON.stringify(operation));
		}

		return operation_;
	},
);

setParserName(smaliCodeOperationParser, 'smaliCodeOperationParser');

const operationsWithTypeArgument = new Set<DalvikBytecodeOperation['operation']>([
	'new-instance',
	'new-array',
	'filled-new-array',
	'filled-new-array/range',
	'check-cast',
	'instance-of',
	'const-class',
]);

const operationsWithBigintValue = new Set<DalvikBytecodeOperation['operation']>([
	'const-wide/16',
	'const-wide/32',
	'const-wide',
]);

const operationsWithBranchLabelArgument = new Set<DalvikBytecodeOperation['operation']>([
	'goto',
	'goto/16',
	'goto/32',
	'if-eq',
	'if-ne',
	'if-lt',
	'if-ge',
	'if-gt',
	'if-le',
	'if-eqz',
	'if-nez',
	'if-ltz',
	'if-gez',
	'if-gtz',
	'if-lez',
	'packed-switch',
	'sparse-switch',
	'fill-array-data',
]);

const payloadOperationSmaliNameToDexName = new Map<string, string>(Object.entries({
	'packed-switch': 'packed-switch-payload',
	'sparse-switch': 'sparse-switch-payload',
	'array-data': 'fill-array-data-payload',
}));

function isOperationWithLabels(value: unknown): value is DalvikBytecodeOperation & {
	labels: Set<string>;
} {
	return (
		typeof value === 'object'
		&& value !== null
		&& 'labels' in value
		&& value.labels instanceof Set
	);
}

const smaliAnnotatedCodeOperationParser: Parser<SmaliCodeOperation, string> = promiseCompose(
	createTupleParser([
		createArrayParser(smaliCodeLineParser),
		createOptionalParser(smaliCodeLocalParser),
		createArrayParser(smaliCodeLabelLineParser),
		smaliCodeOperationParser,
	]),
	([
		_lines,
		_local,
		labels,
		operation,
	]) => {
		if (labels.length > 0) {
			(operation as any).labels = new Set(labels);
		}

		return operation;
	},
);

setParserName(smaliOneLineCodeOperationParser, 'smaliOneLineCodeOperationParser');

type SmaliExecutableCode<DalvikBytecode> = {
	dalvikExecutableCode: DalvikExecutableCode<DalvikBytecode>;
	parameterAnnotations: SmaliCodeParameter[]; // TODO?: SmaliAnnotation[]
	methodAnnotations: SmaliAnnotation[];
};

const smaliExecutableCodeParser: Parser<SmaliExecutableCode<DalvikBytecode>, string> = promiseCompose(
	createTupleParser([
		createOptionalParser(smaliCodeRegistersParser),
		createArrayParser(smaliAnnotationParser),
		createArrayParser(smaliCodeParameterParser),
		createOptionalParser(smaliCommentsOrNewlinesParser),
		createSeparatedArrayParser(
			smaliAnnotationParser,
			smaliCommentsOrNewlinesParser,
		),
		createArrayParser(promiseCompose(
			createTupleParser([
				createOptionalParser(smaliCommentsOrNewlinesParser),
				createDisjunctionParser([
					smaliIndentedCommentParser,
					smaliAnnotatedCodeOperationParser,
					smaliLabeledCatchDirectiveParser,
				]),
			]),
			([
				_commentsOrNewlinesParser,
				operation,
			]) => operation,
		)),
	]),
	([
		registersSize,
		annotations1,
		parameters,
		_leadingCommentsOrNewlines,
		annotations2,
		instructionsAndCatchDirectives,
	]) => {
		const annotations = [ ...annotations1, ...annotations2 ];
		const instructions: SmaliCodeOperation[] = [];
		const catchDirectives: SmaliCatchDirective[] = [];
		const catchDirectiveLabels: Map<SmaliCatchDirective, string[]> = new Map();

		for (const item of instructionsAndCatchDirectives) {
			if (item && typeof item === 'object') {
				if ('labels' in item && 'catchDirective' in item) {
					// This is a SmaliLabeledCatchDirective
					const labeledCatch = item as SmaliLabeledCatchDirective;
					catchDirectives.push(labeledCatch.catchDirective);
					catchDirectiveLabels.set(labeledCatch.catchDirective, labeledCatch.labels);
				} else if ('type' in item && 'startLabel' in item && 'endLabel' in item && 'handlerLabel' in item) {
					// This is a bare SmaliCatchDirective (shouldn't happen with current parser structure)
					catchDirectives.push(item as SmaliCatchDirective);
				} else if (item !== undefined) {
					// This is a SmaliCodeOperation
					instructions.push(item as SmaliCodeOperation);
				}
			}
		}

		if (
			registersSize === undefined
			&& parameters !== undefined
		) {
			registersSize = parameters.length;
		}

		invariant(
			registersSize !== undefined,
			'Expected registers size to be defined',
		);

		for (const [ operationIndex, operation ] of instructions.entries()) {
			if (
				'branchLabel' in operation
				&& typeof operation.branchLabel === 'string'
			) {
				for (const [ targetOperationIndex, targetOperation ] of instructions.entries()) {
					if (!isOperationWithLabels(targetOperation)) {
						continue;
					}

					if (!targetOperation.labels.has(operation.branchLabel)) {
						continue;
					}

					delete (operation as any).branchLabel;
					(operation as any).branchOffsetIndex = targetOperationIndex - operationIndex;

					break;
				}
			}

			if (
				'branchLabels' in operation
				&& typeof operation.branchLabels === 'object'
				&& Array.isArray(operation.branchLabels)
			) {
				const sourceOperations = instructions.filter((sourceOperation, sourceOperationIndex) => (
					'branchOffsetIndex' in sourceOperation
					&& typeof sourceOperation.branchOffsetIndex === 'number'
					&& sourceOperation.branchOffsetIndex + sourceOperationIndex === operationIndex
				));

				invariant(
					sourceOperations.length === 1,
					'Expected exactly one source operation to point to %s',
					JSON.stringify(operation),
				);

				const [ sourceOperation ] = sourceOperations;
				const sourceOperationIndex = instructions.indexOf(sourceOperation);

				(operation as any).branchOffsetIndices = operation.branchLabels.map((branchLabel: string) => {
					for (const [ targetOperationIndex, targetOperation ] of instructions.entries()) {
						if (!isOperationWithLabels(targetOperation)) {
							continue;
						}

						if (!targetOperation.labels.has(branchLabel)) {
							continue;
						}

						return targetOperationIndex - sourceOperationIndex;
					}

					invariant(false, 'Expected to find branch label %s', branchLabel);
				});

				delete (operation as any).branchLabels;
			}
		}

		const branchOffsetByBranchOffsetIndex = new Map<number, number>();

		let operationOffset = 0;

		for (const [ operationIndex, operation ] of instructions.entries()) {
			const operationSize = getOperationFormatSize(operation);

			branchOffsetByBranchOffsetIndex.set(
				operationIndex,
				operationOffset,
			);

			operationOffset += operationSize;
		}

		for (const [ operationIndex, operation ] of instructions.entries()) {
			if (
				'branchOffsetIndex' in operation
				&& typeof operation.branchOffsetIndex === 'number'
			) {
				const operationOffset = branchOffsetByBranchOffsetIndex.get(operationIndex + operation.branchOffsetIndex);
				invariant(
					operationOffset !== undefined,
					'Expected branch offset for operation index %s, but got undefined',
					operation.branchOffsetIndex,
				);

				const branchOffset = branchOffsetByBranchOffsetIndex.get(operationIndex);
				invariant(
					branchOffset !== undefined,
					'Expected branch offset for operation index %s, but got undefined',
					operationIndex,
				);

				(operation as any).branchOffset = operationOffset - branchOffset;
			}

			if (
				'branchOffsetIndices' in operation
				&& typeof operation.branchOffsetIndices === 'object'
				&& Array.isArray(operation.branchOffsetIndices)
			) {
				const sourceOperations = instructions.filter((sourceOperation, sourceOperationIndex) => (
					'branchOffsetIndex' in sourceOperation
					&& typeof sourceOperation.branchOffsetIndex === 'number'
					&& sourceOperation.branchOffsetIndex + sourceOperationIndex === operationIndex
				));

				invariant(
					sourceOperations.length === 1,
					'Expected exactly one source operation to point to %s',
					JSON.stringify(operation),
				);

				const [ sourceOperation ] = sourceOperations;
				const sourceOperationIndex = instructions.indexOf(sourceOperation);

				(operation as any).branchOffsets = operation.branchOffsetIndices.map((branchOffsetIndex: number) => {
					const operationOffset = branchOffsetByBranchOffsetIndex.get(sourceOperationIndex + branchOffsetIndex);
					invariant(
						operationOffset !== undefined,
						'Expected branch offset for operation index %s, but got undefined',
						sourceOperationIndex + branchOffsetIndex,
					);

					const branchOffset = branchOffsetByBranchOffsetIndex.get(sourceOperationIndex);
					invariant(
						branchOffset !== undefined,
						'Expected branch offset for operation index %s, but got undefined',
						sourceOperationIndex,
					);

					return operationOffset - branchOffset;
				});
			}
		}

		// Build label-to-index mapping
		// Labels attached to instructions map to that instruction's index
		// Labels before catch directives should map to the position they mark
		const labelToIndexMap = new Map<string, number>();

		// First, map labels from instructions
		for (const [ operationIndex, operation ] of instructions.entries()) {
			if (
				operation
				&& typeof operation === 'object'
				&& 'labels' in operation
				&& operation.labels instanceof Set
			) {
				for (const label of operation.labels) {
					labelToIndexMap.set(label, operationIndex);
				}
			}
		}

		// Now handle labels from catch directives
		// We need to figure out where each catch directive appears in the original sequence
		let instructionArrayIndex = 0;
		for (let i = 0; i < instructionsAndCatchDirectives.length; i++) {
			const item = instructionsAndCatchDirectives[i];
			if (item && typeof item === 'object' && 'labels' in item && 'catchDirective' in item) {
				// This is a catch directive with labels
				// These labels should map to the current instruction index
				// (which is where the next instruction would be)
				const labeledCatch = item as SmaliLabeledCatchDirective;
				for (const label of labeledCatch.labels) {
					labelToIndexMap.set(label, instructionArrayIndex);
				}
			} else if (item !== undefined && !(item && typeof item === 'object' && 'type' in item && 'startLabel' in item)) {
				// This is an instruction, increment the counter
				instructionArrayIndex++;
			}
		}

		// Build tries array from catch directives
		const triesByRange = new Map<string, {
			startAddress: number;
			instructionCount: number;
			handlers: Array<{ type: string; address: number }>;
			catchAllAddress: number | undefined;
		}>();

		for (const catchDirective of catchDirectives) {
			// Find the start and end instruction indices
			const startIndex = labelToIndexMap.get(catchDirective.startLabel);
			const endIndex = labelToIndexMap.get(catchDirective.endLabel);
			const handlerIndex = labelToIndexMap.get(catchDirective.handlerLabel);

			invariant(startIndex !== undefined, 'Expected to find start label %s', catchDirective.startLabel);
			invariant(endIndex !== undefined, 'Expected to find end label %s', catchDirective.endLabel);
			invariant(handlerIndex !== undefined, 'Expected to find handler label %s', catchDirective.handlerLabel);

			const startAddress = branchOffsetByBranchOffsetIndex.get(startIndex);
			const endAddress = branchOffsetByBranchOffsetIndex.get(endIndex);
			const handlerAddress = branchOffsetByBranchOffsetIndex.get(handlerIndex);

			invariant(startAddress !== undefined, 'Expected start address for index %s', startIndex);
			invariant(endAddress !== undefined, 'Expected end address for index %s', endIndex);
			invariant(handlerAddress !== undefined, 'Expected handler address for index %s', handlerIndex);

			const instructionCount = endAddress - startAddress;
			const rangeKey = `${startAddress}-${instructionCount}`;

			let tryEntry = triesByRange.get(rangeKey);
			if (!tryEntry) {
				tryEntry = {
					startAddress,
					instructionCount,
					handlers: [],
					catchAllAddress: undefined,
				};
				triesByRange.set(rangeKey, tryEntry);
			}

			if (catchDirective.type === undefined) {
				// .catchall
				tryEntry.catchAllAddress = handlerAddress;
			} else {
				// .catch Type
				tryEntry.handlers.push({
					type: catchDirective.type,
					address: handlerAddress,
				});
			}
		}

		const tries = Array.from(triesByRange.values()).map(tryEntry => ({
			startAddress: tryEntry.startAddress,
			instructionCount: tryEntry.instructionCount,
			handler: {
				handlers: tryEntry.handlers,
				catchAllAddress: tryEntry.catchAllAddress,
				size: tryEntry.catchAllAddress !== undefined
					? (tryEntry.handlers.length === 0 ? 0 : -tryEntry.handlers.length)
					: tryEntry.handlers.length,
			},
		}));

		for (const operation of instructions) {
			delete (operation as any).labels;
			delete (operation as any).branchOffsetIndex;
			delete (operation as any).branchOffsetIndices;
		}

		return {
			dalvikExecutableCode: {
				registersSize,
				insSize: -1, // TODO
				outsSize: -1, // TODO
				debugInfo: undefined, // TODO
				instructions: instructions as any, // TODO
				tries,
				// _annotations,
			},
			parameterAnnotations: parameters.filter(parameter => parameter.annotation !== undefined),
			methodAnnotations: annotations,
		};
	},
);

setParserName(smaliExecutableCodeParser, 'smaliExecutableCodeParser');

// TODO: ???
const sortRegistersOperations = new Set<DalvikBytecodeOperation['operation']>([
	'if-eq',
	'if-ne',
]);

// All 12x format operations need register reversal because:
// - Bytecode format is B|A (B in high nibble, A in low nibble)
// - nibblesParser returns [B, A]
// - Smali syntax is "op vA, vB" (destination first)
// - So we need to reverse to get [A, B]
const reverseRegistersOperations = new Set<DalvikBytecodeOperation['operation']>([
	// Move operations
	'move',
	'move-wide',
	'move-object',

	// Unary operations (negation, bitwise not)
	'neg-int',
	'not-int',
	'neg-long',
	'not-long',
	'neg-float',
	'neg-double',

	// Type conversion operations
	'int-to-long',
	'int-to-float',
	'int-to-double',
	'long-to-int',
	'long-to-float',
	'long-to-double',
	'float-to-int',
	'float-to-long',
	'float-to-double',
	'double-to-int',
	'double-to-long',
	'double-to-float',
	'int-to-byte',
	'int-to-char',
	'int-to-short',

	// Binary operations with /2addr suffix
	'add-int/2addr',
	'sub-int/2addr',
	'mul-int/2addr',
	'div-int/2addr',
	'rem-int/2addr',
	'and-int/2addr',
	'or-int/2addr',
	'xor-int/2addr',
	'shl-int/2addr',
	'shr-int/2addr',
	'ushr-int/2addr',

	'add-long/2addr',
	'sub-long/2addr',
	'mul-long/2addr',
	'div-long/2addr',
	'rem-long/2addr',
	'and-long/2addr',
	'or-long/2addr',
	'xor-long/2addr',
	'shl-long/2addr',
	'shr-long/2addr',
	'ushr-long/2addr',

	'add-float/2addr',
	'sub-float/2addr',
	'mul-float/2addr',
	'div-float/2addr',
	'rem-float/2addr',

	'add-double/2addr',
	'sub-double/2addr',
	'mul-double/2addr',
	'div-double/2addr',
	'rem-double/2addr',
]);

function normalizeOperation(operation: DalvikBytecodeOperation): DalvikBytecodeOperation {
	if (
		sortRegistersOperations.has(operation.operation)
		&& 'registers' in operation
	) {
		operation.registers.sort((a, b) => a - b);
	}

	if (
		reverseRegistersOperations.has(operation.operation)
		&& 'registers' in operation
	) {
		operation.registers.reverse();
	}

	return operation;
}

type SmaliMethod<DalvikBytecode> = {
	dalvikExecutableMethodWithAccess: DalvikExecutableMethodWithAccess<DalvikBytecode>;
	parameterAnnotations: SmaliCodeParameter[];
	methodAnnotations: SmaliAnnotation[];
};

export const smaliMethodParser: Parser<SmaliMethod<DalvikBytecode>, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('.method '),
		createOptionalParser(promiseCompose(
			createTupleParser([
				smaliAccessFlagsParser,
				smaliSingleWhitespaceParser,
			]),
			([accessFlags]) => accessFlags,
		)),
		smaliMemberNameParser,
		smaliMethodPrototypeParser,
		smaliLineEndPraser,
		smaliExecutableCodeParser,
		createArrayParser(smaliCodeLineParser),
		createExactSequenceParser('.end method\n'),
	]),
	([
		_method,
		accessFlagsOrUndefined,
		name,
		prototype,
		_newline,
		{
			dalvikExecutableCode,
			parameterAnnotations,
			methodAnnotations,
		},
		_lines,
		_endMethod,
	]) => {
		const accessFlags = accessFlagsOrUndefined ?? dalvikExecutableAccessFlagsDefault();
		let code: DalvikExecutableCode<DalvikBytecode> | undefined = dalvikExecutableCode;

		if (accessFlags.native && code.instructions.length === 0) {
			code = undefined;
		}

		if (code) {
			const insSize = (accessFlags.static ? 0 : 1) + shortyGetInsSize(prototype.shorty);

			code.insSize = insSize;

			for (const operation of code.instructions) {
				const smaliRegisters = dalvikBytecodeOperationCompanion.getRegisters(operation) as unknown[] as SmaliRegister[]; // TODO

				if (smaliRegisters.length === 0) {
					continue;
				}

				const registers: number[] = smaliRegisters.map(({ prefix, index }) => {
					if (prefix === 'v') {
						return index;
					}

					if (prefix === 'p') {
						return code.registersSize - insSize + index;
					}

					invariant(false, 'Expected prefix to be v or p');
				});

				(operation as any).registers = registers; // TODO
			}

			let outsSize = 0;

			for (const operation of code.instructions) {
				if (!operation.operation.startsWith('invoke-')) {
					continue;
				}

				const registers = dalvikBytecodeOperationCompanion.getRegisters(operation);

				outsSize = Math.max(outsSize, registers.length); // TODO?: two words for wide types?
			}

			code.outsSize = outsSize;
		}

		return {
			dalvikExecutableMethodWithAccess: {
				accessFlags,
				method: {
					class: 'FILLED_LATER',
					prototype,
					name,
				},
				code: code?.instructions.length
					? {
						...code,
						instructions: code.instructions.map(normalizeOperation),
					}
					: undefined,
			},
			parameterAnnotations,
			methodAnnotations,
		};
	},
);

setParserName(smaliMethodParser, 'smaliMethodParser');

type SmaliMethods = Pick<DalvikExecutableClassData<DalvikBytecode>, 'directMethods' | 'virtualMethods'> & {
	parameterAnnotations: DalvikExecutableClassParameterAnnotation[];
	methodAnnotations: DalvikExecutableClassMethodAnnotation[];
};

const smaliMethodsParser: Parser<SmaliMethods, string> = promiseCompose(
	createArrayParser<string[] | SmaliMethod<DalvikBytecode>, string>(createDisjunctionParser<string[] | SmaliMethod<DalvikBytecode>, string, string>([
		smaliMethodParser,
		smaliCommentsOrNewlinesParser,
	])),
	methodsAndComments => {
		let type: 'directMethod' | 'virtualMethod' = 'directMethod';

		const directMethods: Array<DalvikExecutableMethodWithAccess<DalvikBytecode>> = [];
		const virtualMethods: Array<DalvikExecutableMethodWithAccess<DalvikBytecode>> = [];

		const parameterAnnotations: DalvikExecutableClassParameterAnnotation[] = [];
		const methodAnnotations: DalvikExecutableClassMethodAnnotation[] = [];

		function pushParameterAnnotation(annotation: DalvikExecutableClassParameterAnnotation) {
			if (annotation.annotations.length === 0) {
				return;
			}

			const existingMethod = parameterAnnotations.find(parameterAnnotation => dalvikExecutableMethodEquals(
				parameterAnnotation.method,
				annotation.method,
			));

			if (existingMethod) {
				for (const [ index, parameterAnnotations_ ] of annotation.annotations.entries()) {
					const existingParameterAnnotations = existingMethod.annotations.at(index);

					if (existingParameterAnnotations) {
						existingParameterAnnotations.push(...parameterAnnotations_);
					} else {
						existingMethod.annotations[index] = parameterAnnotations_;
					}
				}

				return;
			}

			parameterAnnotations.push(annotation);
		}

		for (const methodOrComment of methodsAndComments) {
			if (Array.isArray(methodOrComment)) {
				for (const comment of methodOrComment) {
					if (comment === ' direct methods') {
						type = 'directMethod';
					}

					if (comment === ' virtual methods') {
						type = 'virtualMethod';
					}
				}

				continue;
			}

			invariant(typeof methodOrComment === 'object', 'Expected method or comment');

			const method = methodOrComment;

			if (method.methodAnnotations.length > 0) {
				methodAnnotations.push({
					method: method.dalvikExecutableMethodWithAccess.method,
					annotations: method.methodAnnotations.map(annotation => ({
						type: annotation.type,
						visibility: annotation.visibility,
						elements: annotation.elements as any ?? [], // TODO
					})),
				});
			}

			// Create an annotations array for all parameters, not just those with annotations
			// In smali, instance methods have p0 as 'this', p1 as first param, etc.
			// But DEX parameter annotations only include the actual parameters (not 'this')
			const isStatic = method.dalvikExecutableMethodWithAccess.accessFlags.static;
			const smaliRegisterOffset = isStatic ? 0 : 1; // P0 is 'this' for instance methods

			const allParameterAnnotations = method.dalvikExecutableMethodWithAccess.method.prototype.parameters.map((_, parameterIndex) => {
				const smaliRegisterIndex = parameterIndex + smaliRegisterOffset;
				const parameterAnnotation = method.parameterAnnotations.find(pa => pa.register.prefix === 'p' && pa.register.index === smaliRegisterIndex);

				if (parameterAnnotation?.annotation) {
					return [ {
						type: parameterAnnotation.annotation.type,
						visibility: parameterAnnotation.annotation.visibility,
						elements: parameterAnnotation.annotation.elements as any ?? [], // TODO
					} ];
				}

				return [];
			});

			// Only push parameter annotations if there are some actual annotations
			if (allParameterAnnotations.some(annotations => annotations.length > 0)) {
				pushParameterAnnotation({
					method: method.dalvikExecutableMethodWithAccess.method,
					annotations: allParameterAnnotations,
				});
			}

			if (type === 'directMethod') {
				directMethods.push(method.dalvikExecutableMethodWithAccess);

				continue;
			}

			if (type === 'virtualMethod') {
				virtualMethods.push(method.dalvikExecutableMethodWithAccess);

				continue;
			}

			invariant(false, 'Expected method type');
		}

		return {
			directMethods,
			virtualMethods,
			parameterAnnotations,
			methodAnnotations,
		};
	},
);

setParserName(smaliMethodsParser, 'smaliMethodsParser');

export const smaliParser: Parser<DalvikExecutableClassDefinition<DalvikBytecode>, string> = promiseCompose(
	createTupleParser([
		smaliClassDeclarationParser,
		smaliSuperDeclarationParser,
		createOptionalParser(smaliSourceDeclarationParser),
		createOptionalParser(promiseCompose(
			createTupleParser([
				smaliCommentsOrNewlinesParser,
				createNonEmptyArrayParser(smaliInterfaceDeclarationParser),
			]),
			([
				_commentsOrNewlines,
				interfaces,
			]) => interfaces,
		)),
		createOptionalParser(promiseCompose(
			createTupleParser([
				smaliCommentsOrNewlinesParser,
				createSeparatedNonEmptyArrayParser<SmaliAnnotation, string>(
					smaliAnnotationParser,
					smaliCommentsOrNewlinesParser,
				),
			]),
			([
				_commentsOrNewlines,
				classAnnotations,
			]) => classAnnotations,
		)),
		createOptionalParser(promiseCompose(
			createTupleParser([
				smaliCommentsOrNewlinesParser,
				smaliFieldsParser,
			]),
			([
				_commentsOrNewlines,
				fields,
			]) => fields,
		)),
		smaliMethodsParser,
	]),
	([
		{
			accessFlags,
			class: class_,
		},
		{
			superclass,
		},
		sourceFileObject,
		interfaces,
		classAnnotations,
		smaliFields,
		methods,
	]) => {
		const sourceFile = sourceFileObject?.sourceFile;
		// Create staticValues array matching DEX format:
		// - Find the last static field with a non-default initializer
		// - Create array up to that index with values/nulls
		// - Fields after the last initializer are not included
		// - Default values (false, null) are not considered initializers
		const staticFieldsList = smaliFields?.staticFields ?? [];
		let lastIndexWithInitializer = -1;
		for (let i = staticFieldsList.length - 1; i >= 0; i--) {
			const initValue = staticFieldsList[i].initialValue;
			// Only consider non-default values as initializers
			// Numbers, strings, and true are non-default
			// false and null are default values
			if (initValue !== undefined && typeof initValue === 'number') {
				lastIndexWithInitializer = i;
				break;
			}

			if (initValue !== undefined && typeof initValue === 'string') {
				lastIndexWithInitializer = i;
				break;
			}

			if (initValue === true) {
				lastIndexWithInitializer = i;
				break;
			}
		}

		const staticValues = lastIndexWithInitializer === -1
			? []
			: staticFieldsList
				.slice(0, lastIndexWithInitializer + 1)
				.map(smaliField => {
					if (smaliField.initialValue === undefined) {
						// For integer types without initializer, DEX stores 0
						if (smaliField.field.field.type === 'I' || smaliField.field.field.type === 'B' || smaliField.field.field.type === 'S') {
							return 0;
						}
						// For long types without initializer, DEX stores 0n
						if (smaliField.field.field.type === 'J') {
							return 0n;
						}
						// For float/double types without initializer, DEX stores 0
						if (smaliField.field.field.type === 'F' || smaliField.field.field.type === 'D') {
							return 0;
						}
						// For boolean types without initializer, DEX stores false
						if (smaliField.field.field.type === 'Z') {
							return false;
						}
						// For other types (reference types, etc.), return null
						return null;
					}

					// Numeric values are stored in static values array
					if (typeof smaliField.initialValue === 'number') {
						// Convert to BigInt for long (J) types
						if (smaliField.field.field.type === 'J') {
							return BigInt(smaliField.initialValue);
						}
						return smaliField.initialValue;
					}

					// String values should be stored as undefined (they're handled differently in DEX)
					if (typeof smaliField.initialValue === 'string') {
						return undefined;
					}

					// Boolean true is a non-default value and should be in staticValues
					if (smaliField.initialValue === true) {
						return true;
					}

					// Boolean false and null are default values
					// For boolean fields with explicit false, return false
					if (smaliField.initialValue === false && smaliField.field.field.type === 'Z') {
						return false;
					}

					// For null or other default values, return null
					return null;
				});
		const fields = {
			staticFields: smaliFields?.staticFields.map(({ field }) => field) ?? [],
			instanceFields: smaliFields?.instanceFields.map(({ field }) => field) ?? [],
		};

		const annotations: DalvikExecutableClassAnnotations = {
			classAnnotations: classAnnotations as any ?? [], // TODO
			fieldAnnotations: [],
			methodAnnotations: methods.methodAnnotations,
			parameterAnnotations: methods.parameterAnnotations,
		};

		for (const smaliField of [ ...(smaliFields?.staticFields ?? []), ...(smaliFields?.instanceFields ?? []) ]) {
			if (smaliField.annotations.length === 0) {
				continue;
			}

			const existingFieldAnnotations = annotations.fieldAnnotations.find(fieldAnnotation => dalvikExecutableFieldEquals(
				fieldAnnotation.field,
				smaliField.field.field,
			));

			if (existingFieldAnnotations) {
				existingFieldAnnotations.annotations ??= [];
				existingFieldAnnotations.annotations.push(...smaliField.annotations as any); // TODO
				continue;
			}

			annotations.fieldAnnotations.push({
				field: smaliField.field.field,
				annotations: smaliField.annotations as any, // TODO
			});
		}

		// Compute synthetic flag from members if not explicitly set
		// This matches baksmali behavior where synthetic flag at class level is not output
		// but can be inferred from all members being synthetic
		const allMembers = [
			...fields.staticFields,
			...fields.instanceFields,
			...methods.directMethods,
			// Note: virtualMethods are not included, matching DEX parser behavior
		];

		const allMembersAreSynthetic = (
			allMembers.every(member => member.accessFlags.synthetic)
			&& allMembers.length > 0
		);

		const finalAccessFlags = {
			...accessFlags,
			// Use the synthetic flag from the class declaration, or compute it from members if not set
			synthetic: accessFlags.synthetic || allMembersAreSynthetic,
		};

		return {
			accessFlags: finalAccessFlags,
			class: class_,
			superclass,
			sourceFile,
			annotations: (
				(
					annotations.classAnnotations?.length
					|| annotations.fieldAnnotations?.length
					|| annotations.methodAnnotations?.length
					|| annotations.parameterAnnotations?.length
				)
					? ({
						classAnnotations: annotations.classAnnotations,
						fieldAnnotations: annotations.fieldAnnotations.map(fieldAnnotation => ({
							...fieldAnnotation,
							field: {
								...fieldAnnotation.field,
								class: class_,
							},
						})),
						methodAnnotations: annotations.methodAnnotations.map(methodAnnotation => ({
							...methodAnnotation,
							method: {
								...methodAnnotation.method,
								class: class_,
							},
						})),
						parameterAnnotations: annotations.parameterAnnotations.map(parameterAnnotation => ({
							...parameterAnnotation,
							method: {
								...parameterAnnotation.method,
								class: class_,
							},
						})),
					})
					: undefined
			),
			classData: (
				(
					methods.directMethods.length > 0
					|| methods.virtualMethods.length > 0
					|| (fields?.staticFields.length ?? 0)
					|| (fields?.instanceFields.length ?? 0)
				)
					? ({
						directMethods: methods.directMethods.map(method => ({
							...method,
							method: {
								...method.method,
								class: class_,
							},
						})),
						virtualMethods: methods.virtualMethods.map(method => ({
							...method,
							method: {
								...method.method,
								class: class_,
							},
						})),
						staticFields: (fields?.staticFields ?? []).map(field => ({
							...field,
							field: {
								...field.field,
								class: class_,
							},
						})),
						instanceFields: (fields?.instanceFields ?? []).map(field => ({
							...field,
							field: {
								...field.field,
								class: class_,
							},
						})),
					})
					: undefined
			),
			interfaces: interfaces ?? [],
			staticValues,
		};
	},
);

setParserName(smaliParser, 'smaliParser');
