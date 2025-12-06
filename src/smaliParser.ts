import invariant from 'invariant';
import { type Simplify } from 'type-fest';
import { type RawDalvikBytecodeOperation, rawDalvikBytecodeOperationCompanion } from './dalvikBytecodeParser.js';
import { type DalvikBytecodeOperation, type DalvikBytecode, getOperationSizeInCodeUnits } from './dalvikBytecodeParser/addressConversion.js';
import {
	type DalvikExecutableAccessFlags, dalvikExecutableAccessFlagsDefault, type DalvikExecutableAnnotation, type DalvikExecutableClassAnnotations, type DalvikExecutableClassData, type DalvikExecutableClassDefinition, type DalvikExecutableClassMethodAnnotation, type DalvikExecutableClassParameterAnnotation, type DalvikExecutableCode, type DalvikExecutableDebugInfo, type DalvikExecutableEncodedValue, type DalvikExecutableField, dalvikExecutableFieldEquals, type DalvikExecutableFieldWithAccess, type DalvikExecutableMethod, dalvikExecutableMethodEquals, type DalvikExecutableMethodWithAccess, type DalvikExecutablePrototype, isDalvikExecutableField, isDalvikExecutableMethod,
} from './dalvikExecutable.js';
import { createExactSequenceParser } from './exactSequenceParser.js';
import { createObjectParser } from './objectParser.js';
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
import { createSeparatedNonEmptyArrayParser } from './separatedNonEmptyArrayParser.js';
import { parserCreatorCompose } from './parserCreatorCompose.js';
import { type IndexIntoMethodIds } from './dalvikExecutableParser/typedNumbers.js';
import { createElementParser } from './elementParser.js';
import { createTerminatedArrayParser } from './terminatedArrayParser.js';
import { createParserAccessorParser } from './parserAccessorParser.js';
import { createRegExpParser } from './regexpParser.js';

function shortyFromLongy(longy: string): string {
	if (longy.startsWith('[')) {
		return 'L';
	}

	return longy.slice(0, 1);
}


// Helper function to convert raw annotation element values to tagged encoded values
function convertToTaggedEncodedValue(wrappedValue: SmaliAnnotationElementValue): DalvikExecutableEncodedValue {
	const { kind, value } = wrappedValue;

	// Handle type descriptors
	if (kind === 'type') {
		if (Array.isArray(value)) {
			// Array of type descriptors
			return { type: 'array', value: value.map(v => ({ type: 'type', value: v })) };
		}
		// Single type descriptor
		return { type: 'type', value };
	}

	// Handle string literals
	if (kind === 'string') {
		if (Array.isArray(value)) {
			// Array of strings
			return { type: 'array', value: value.map(v => ({ type: 'string', value: v })) };
		}
		// Single string
		return { type: 'string', value };
	}

	// Handle enum values
	if (kind === 'enum') {
		if (Array.isArray(value)) {
			// Array of enum values
			return { type: 'array', value: value.map(v => ({ type: 'enum', value: v })) };
		}
		// Single enum value
		return { type: 'enum', value };
	}

	// Handle raw values (everything else)
	// Handle null
	if (value === null) {
		return { type: 'null', value: null };
	}

	// Handle boolean
	if (typeof value === 'boolean') {
		return { type: 'boolean', value };
	}

	// Handle numbers - we need to determine the type based on context
	// For annotation elements from smali, we'll use 'int' as the default
	if (typeof value === 'number') {
		// Check if it's a float or integer
		if (!Number.isInteger(value)) {
			return { type: 'float', value };
		}
		// For integers, default to 'int' type
		// The actual byte/short/int distinction would need more context
		return { type: 'int', value };
	}

	// Handle bigint
	if (typeof value === 'bigint') {
		return { type: 'long', value };
	}

	// Handle DalvikExecutableField (including enums)
	if (isDalvikExecutableField(value)) {
		// Note: We can't distinguish between 'field' and 'enum' without more context
		// Default to 'field' type - the context in smali might help distinguish later
		return { type: 'field', value };
	}

	// Handle DalvikExecutableMethod
	if (isDalvikExecutableMethod(value)) {
		return { type: 'method', value };
	}

	// Handle DalvikExecutablePrototype (method type)
	if (typeof value === 'object' && value !== null && 'returnType' in value && 'parameters' in value && 'shorty' in value) {
		return { type: 'methodType', value: value as DalvikExecutablePrototype };
	}

	// Handle annotations (subannotations)
	if (typeof value === 'object' && value !== null && 'type' in value && 'elements' in value) {
		const subannotation = value as SmaliSubannotation;
		// Convert subannotation to DalvikExecutableAnnotation
		const annotation: DalvikExecutableAnnotation = {
			type: subannotation.type,
			visibility: 'build', // Subannotations default to 'build' visibility
			elements: subannotation.elements.map(element => ({
				name: element.name,
				value: convertToTaggedEncodedValue(element.value),
			})),
		};
		return { type: 'annotation', value: annotation };
	}

	// Handle arrays
	if (Array.isArray(value)) {
		return { type: 'array', value: value.map(v => convertToTaggedEncodedValue({ kind: 'raw', value: v })) };
	}

	// Fallback - this shouldn't happen in well-formed smali
	throw new Error(`Cannot convert value to tagged encoded value: ${JSON.stringify(value)}`);
}


const smaliNewlinesParser: Parser<undefined, string> = promiseCompose(
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
		promiseCompose(
			createRegExpParser(/[^\n]*/),
			match => match[0],
		),
		createExactSequenceParser('\n'),
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
	createArrayParser(createUnionParser([
		smaliNewlinesParser,
		smaliIndentedCommentParser,
		smaliCommentParser,
	])),
	newlinesOrComments => newlinesOrComments.filter((newlineOrComment): newlineOrComment is string => typeof newlineOrComment === 'string'),
);

const smaliLineEndPraser: Parser<undefined | string, string> = promiseCompose(
	createTupleParser([
		createOptionalParser(smaliWhitespaceParser),
		createUnionParser([
			smaliNewlinesParser,
			smaliCommentParser,
		]),
	]),
	([
		_optionalWhitespace,
		newlineOrComment,
	]) => newlineOrComment,
);

const smaliIdentifierParser: Parser<string, string> = promiseCompose(
	createRegExpParser(/[a-zA-Z0-9_]+/),
	match => match[0],
);

setParserName(smaliIdentifierParser, 'smaliIdentifierParser');

const smaliHexNumberParser: Parser<number | bigint, string> = promiseCompose(
	createRegExpParser(/-?0x([0-9a-fA-F]+)(L)?/),
	match => {
		const hexDigits = match[1]!;
		const optionalL = match[2];

		// If the 'L' suffix is present, use BigInt for long values
		if (optionalL) {
			const sign = match[0].startsWith('-') ? -1n : 1n;
			return sign * BigInt('0x' + hexDigits);
		}

		const sign = match[0].startsWith('-') ? -1 : 1;
		return sign * Number.parseInt(hexDigits, 16);
	},
);

const smaliNumberParser = createUnionParser([
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
	promiseCompose(
		smaliHexNumberParser,
		value => {
			// For smaliNumberParser, we need to ensure we return a number
			// BigInt values from hex parser should be converted if they fit in number range
			if (typeof value === 'bigint') {
				// This shouldn't happen in contexts where smaliNumberParser is used
				// (registers, line numbers, etc) but if it does, convert to number
				return Number(value);
			}
			return value;
		},
	),
]);

setParserName(smaliNumberParser, 'smaliNumberParser');

// Parser for field initial values that can include BigInt
const smaliFieldValueParser = createUnionParser([
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

const smaliQuotedStringParser: Parser<string, string> = promiseCompose(
	jsonStringParser,
	string => string.replaceAll(String.raw`\'`, '\''),
);

// Parser for smali character literals (e.g., 'a', ':', '\'', '\\')
const smaliCharacterLiteralParser: Parser<number, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('\''),
		createDisjunctionParser([
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
const createAccessFlagParser = <const T extends string>(keyword: T): Parser<T, string> => promiseCompose(
	createTupleParser([
		createExactSequenceParser(keyword) as Parser<T, string>,
		createNegativeLookaheadParser(smaliIdentifierContinuationParser),
	]),
	([flag]) => flag,
);

const smaliAccessFlagsParser: Parser<DalvikExecutableAccessFlags, string> = promiseCompose(
	createSeparatedArrayParser(
		createUnionParser([
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

const smaliSuperDeclarationParser: Parser<Pick<DalvikExecutableClassDefinition<unknown>, 'superclass'>, string> = createObjectParser({
	_super: createExactSequenceParser('.super '),
	superclass: smaliTypeDescriptorParser,
	_newline: smaliLineEndPraser,
});

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

const smaliSourceDeclarationParser: Parser<Pick<DalvikExecutableClassDefinition<unknown>, 'sourceFile'>, string> = createObjectParser({
	_source: createExactSequenceParser('.source '),
	sourceFile: smaliQuotedStringParser,
	_newline: smaliLineEndPraser,
});

// Wrapper type to distinguish different value types in smali annotation elements
type SmaliAnnotationElementValue =
	| { kind: 'type'; value: string | string[] }
	| { kind: 'string'; value: string | string[] }
	| { kind: 'enum'; value: DalvikExecutableField | DalvikExecutableField[] }
	| { kind: 'raw'; value: unknown };

type SmaliAnnotationElement = {
	name: string;
	value: SmaliAnnotationElementValue;
};

const smaliEnumValueParser: Parser<DalvikExecutableField, string> = createObjectParser({
	_enum: createExactSequenceParser('.enum '),
	class: smaliTypeDescriptorParser,
	_arrow: createExactSequenceParser('->'),
	name: smaliMemberNameParser,
	_colon: createExactSequenceParser(':'),
	type: smaliTypeDescriptorParser,
});

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

const smaliParametersMethodParser: Parser<DalvikExecutableMethod, string> = createObjectParser({
	class: smaliTypeDescriptorParser,
	_separator: createExactSequenceParser('->'),
	name: smaliMemberNameParser,
	prototype: smaliMethodPrototypeParser,
});

setParserName(smaliParametersMethodParser, 'smaliParametersMethodParser');

type SmaliSubannotation = {
	type: string;
	elements: SmaliAnnotationElement[];
};

// Forward declaration to handle circular reference
let smaliSubannotationParser: Parser<SmaliSubannotation, string>;

const smaliAnnotationElementParser: Parser<SmaliAnnotationElement, string> = promiseCompose(
	createTupleParser([
		smaliIndentationParser,
		smaliIdentifierParser,
		createExactSequenceParser(' = '),
		createDisjunctionParser([
			createObjectParser({
				kind: 'raw' as const,
				value: createParserAccessorParser(() => smaliSubannotationParser),
			}),
			createObjectParser({
				kind: 'enum' as const,
				value: smaliEnumValueParser,
			}),
			createObjectParser({
				kind: 'string' as const,
				value: smaliQuotedStringParser,
			}),
			createObjectParser({
				kind: 'raw' as const,
				value: smaliParametersMethodParser,
			}),
			createObjectParser({
				kind: 'type' as const,
				value: smaliTypeDescriptorParser,
			}),
			createObjectParser({
				kind: 'raw' as const,
				value: smaliNumberParser,
			}),
			createObjectParser({
				kind: 'raw' as const,
				value: true as const,
				_true: createExactSequenceParser('true'),
			}),
			createObjectParser({
				kind: 'raw' as const,
				value: false as const,
				_false: createExactSequenceParser('false'),
			}),
			promiseCompose(
				createExactSequenceParser('null'),
				() => ({ kind: 'raw' as const, value: null }),
			),
			createObjectParser({
				kind: 'raw' as const,
				value: [] as const,
				_emptyBraces: createExactSequenceParser('{}'),
			}),
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
				]) => ({ kind: 'enum' as const, value }),
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
				]) => ({ kind: 'type' as const, value }),
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
				]) => ({ kind: 'string' as const, value }),
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
				]) => ({ kind: 'raw' as const, value }),
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
	]): SmaliAnnotationElement => ({
		name,
		value: value as SmaliAnnotationElementValue,
	}),
);

setParserName(smaliAnnotationElementParser, 'smaliAnnotationElementParser');

// Now define the subannotation parser
smaliSubannotationParser = createObjectParser({
	_subannotation: createExactSequenceParser('.subannotation '),
	type: smaliTypeDescriptorParser,
	_newline: smaliLineEndPraser,
	elements: createArrayParser(smaliAnnotationElementParser),
	_indentation: smaliIndentationParser,
	_endSubannotation: createExactSequenceParser('.end subannotation'),
});

setParserName(smaliSubannotationParser, 'smaliSubannotationParser');

type SmaliAnnotation = {
	type: string;
	elements: SmaliAnnotationElement[];
	visibility: 'build' | 'runtime' | 'system';
};

export const smaliAnnotationParser: Parser<SmaliAnnotation, string> = createObjectParser({
	_indentation0: smaliIndentationParser,
	_annotation: createExactSequenceParser('.annotation '),
	visibility: createUnionParser([
		createExactSequenceParser('build' as const),
		createExactSequenceParser('runtime' as const),
		createExactSequenceParser('system' as const),
	]),
	_space: smaliSingleWhitespaceParser,
	type: smaliTypeDescriptorParser,
	_newline: smaliLineEndPraser,
	elements: createArrayParser(smaliAnnotationElementParser),
	_indentation1: smaliIndentationParser,
	_endAnnotation: createExactSequenceParser('.end annotation\n'),
});

setParserName(smaliAnnotationParser, 'smaliAnnotationParser');

type SmaliField = {
	field: DalvikExecutableFieldWithAccess;
	annotations: SmaliAnnotation[];
	initialValue?: number | bigint | string | boolean | null;
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
				createUnionParser([
					smaliCharacterLiteralParser,
					smaliFieldValueParser,
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

const smaliParametersRegisterParser: Parser<SmaliRegister, string> = createUnionParser([
	createObjectParser({
		prefix: createExactSequenceParser('v' as const),
		index: smaliNumberParser,
	}),
	createObjectParser({
		prefix: createExactSequenceParser('p' as const),
		index: smaliNumberParser,
	}),
]);

setParserName(smaliParametersRegisterParser, 'smaliParametersRegisterParser');

type SmaliCodeLocal = {
	register: SmaliRegister;
	name: string | undefined;
	type: string | undefined;
	signature: string | undefined;
};

const smaliCodeLocalParser: Parser<SmaliCodeLocal, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('    .local '),
		smaliParametersRegisterParser,
		createOptionalParser(createTupleParser([
			createExactSequenceParser(','),
			smaliWhitespaceParser,
			smaliQuotedStringParser,
			createExactSequenceParser(':'),
			smaliTypeDescriptorParser,
			createOptionalParser(createTupleParser([
				createExactSequenceParser(','),
				smaliWhitespaceParser,
				smaliQuotedStringParser,
			])),
		])),
		smaliLineEndPraser,
	]),
	([
		_local,
		register,
		nameAndType,
	]) => ({
		register,
		name: nameAndType?.[2],
		type: nameAndType?.[4],
		signature: nameAndType?.[5]?.[2],
	}),
);

setParserName(smaliCodeLocalParser, 'smaliCodeLocalParser');

const smaliCodeEndLocalParser: Parser<SmaliRegister, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('    .end local '),
		smaliParametersRegisterParser,
		smaliLineEndPraser,
	]),
	([
		_endLocal,
		register,
		_newline,
	]) => register,
);

setParserName(smaliCodeEndLocalParser, 'smaliCodeEndLocalParser');

const smaliCodeRestartLocalParser: Parser<SmaliRegister, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('    .restart local '),
		smaliParametersRegisterParser,
		smaliLineEndPraser,
	]),
	([
		_restartLocal,
		register,
		_newline,
	]) => register,
);

setParserName(smaliCodeRestartLocalParser, 'smaliCodeRestartLocalParser');

const smaliCodePrologueEndParser: Parser<true, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('    .prologue'),
		smaliLineEndPraser,
	]),
	() => true as const,
);

setParserName(smaliCodePrologueEndParser, 'smaliCodePrologueEndParser');

const smaliCodeEpilogueBeginParser: Parser<true, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('    .epilogue'),
		smaliLineEndPraser,
	]),
	() => true as const,
);

setParserName(smaliCodeEpilogueBeginParser, 'smaliCodeEpilogueBeginParser');

type SmaliCodeParameter = {
	register: SmaliRegister;
	name: string | undefined;
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
		optionalCommaAndString,
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
			name: optionalCommaAndString?.[2],
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

const smaliCatchDirectiveParser: Parser<SmaliCatchDirective, string> = createObjectParser({
	_indentation: smaliIndentationParser,
	_catch: createExactSequenceParser('.catch'),
	type: createUnionParser([
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
	_openBrace: createExactSequenceParser(' {'),
	startLabel: smaliCodeLabelParser,
	_dots: createExactSequenceParser(' .. '),
	endLabel: smaliCodeLabelParser,
	_closeBrace: createExactSequenceParser('} '),
	handlerLabel: smaliCodeLabelParser,
	_newline: smaliLineEndPraser,
});

setParserName(smaliCatchDirectiveParser, 'smaliCatchDirectiveParser');

type SmaliLabeledCatchDirective = {
	labels: string[];
	catchDirective: SmaliCatchDirective;
};

const smaliLabeledCatchDirectiveParser: Parser<SmaliLabeledCatchDirective, string> = createObjectParser({
	_lines: createArrayParser(smaliCodeLineParser),
	_local: createOptionalParser(smaliCodeLocalParser),
	labels: createArrayParser(smaliCodeLabelLineParser),
	catchDirective: smaliCatchDirectiveParser,
});

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
	createRegExpParser(/-?0x([0-9a-fA-F]+)([Lts])?/),
	match => {
		const hexDigits = match[1]!;
		const optionalSuffix = match[2];

		if (optionalSuffix === 'L') {
			const sign = match[0].startsWith('-') ? -1n : 1n;

			return sign * BigInt('0x' + hexDigits);
		}

		const sign = match[0].startsWith('-') ? -1 : 1;

		return sign * Number.parseInt(hexDigits, 16);
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

const smaliParametersFieldParser: Parser<DalvikExecutableField, string> = createObjectParser({
	class: smaliTypeDescriptorParser,
	_separator: createExactSequenceParser('->'),
	name: smaliMemberNameParser,
	_colon: createExactSequenceParser(':'),
	type: smaliTypeDescriptorParser,
});

setParserName(smaliParametersFieldParser, 'smaliParametersFieldParser');

type SmaliCodeOperationParameter =
	| SmaliRegister
	| SmaliRegister[]
	| string
	| number
	| bigint
	| DalvikExecutableMethod
	| DalvikExecutableField
;

const smaliCodeOperationParametersParser: Parser<SmaliCodeOperationParameter[], string> = createArrayParser(promiseCompose(
	createTupleParser([
		createUnionParser([
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

const smaliOneLineCodeOperationParser: Parser<SmaliOneLineCodeOperation, string> = createObjectParser({
	_indent: smaliSingleIndentationParser,
	operation: smaliCodeOperationNameParser,
	parameters: promiseCompose(
		createOptionalParser(createTupleParser([
			smaliSingleWhitespaceParser,
			smaliCodeOperationParametersParser,
		])),
		undefinedOrParameters => undefinedOrParameters === undefined ? [] : undefinedOrParameters[1],
	),
	_newline: smaliLineEndPraser,
});

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

// SmaliCodeOperation transforms DalvikBytecodeOperation:
// - targetInstructionIndex -> branchOffsetIndex (intermediate form during parsing, relative)
// - targetInstructionIndices -> branchOffsetIndices (intermediate form during parsing, relative)
// - methodIndex -> method (resolved)
type SmaliCodeOperationFromDalvikOperation<T extends DalvikBytecodeOperation> =
	T extends { targetInstructionIndices: number[] }
		? Simplify<Omit<T, 'targetInstructionIndices'> & { branchOffsetIndices: number[] }>
		: T extends { targetInstructionIndex: number }
			? Simplify<Omit<T, 'targetInstructionIndex'> & { branchOffsetIndex: number }>
			: T extends { methodIndex: IndexIntoMethodIds }
				? Simplify<Omit<T, 'methodIndex'> & { method: DalvikExecutableMethod }>
				: T
;

type SmaliCodeOperation = SmaliCodeOperationFromDalvikOperation<DalvikBytecodeOperation>;

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
					// Use BigInt for bitwise operations to preserve full precision
					const bigIntValue = typeof value === 'bigint' ? value : BigInt(value);

					// Convert to bytes based on elementWidth (little-endian)
					for (let i = 0; i < elementWidth; i++) {
						data.push(Number((bigIntValue >> BigInt(i * 8)) & 0xFFn));
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

type SmaliDebugDirective =
	| { type: 'line'; line: number }
	| { type: 'startLocal'; local: SmaliCodeLocal }
	| { type: 'endLocal'; register: SmaliRegister }
	| { type: 'restartLocal'; register: SmaliRegister }
	| { type: 'setPrologueEnd' }
	| { type: 'setEpilogueBegin' };

type SmaliAnnotatedCodeOperation = {
	debugDirectives: SmaliDebugDirective[];
	labels: string[];
	operation: SmaliCodeOperation;
};

const smaliAnnotatedCodeOperationParser: Parser<SmaliAnnotatedCodeOperation, string> = promiseCompose(
	createTupleParser([
		createArrayParser(smaliCodeLineParser),
		createOptionalParser(smaliCodeLocalParser),
		createOptionalParser(smaliCodeEndLocalParser),
		createOptionalParser(smaliCodeRestartLocalParser),
		createOptionalParser(smaliCodePrologueEndParser),
		createOptionalParser(smaliCodeEpilogueBeginParser),
		createArrayParser(smaliCodeLabelLineParser),
		smaliCodeOperationParser,
	]),
	([
		lines,
		local,
		endLocal,
		restartLocal,
		prologueEnd,
		epilogueBegin,
		labels,
		operation,
	]) => {
		const debugDirectives: SmaliDebugDirective[] = [];

		for (const line of lines) {
			debugDirectives.push({ type: 'line', line });
		}

		if (local) {
			debugDirectives.push({ type: 'startLocal', local });
		}

		if (endLocal) {
			debugDirectives.push({ type: 'endLocal', register: endLocal });
		}

		if (restartLocal) {
			debugDirectives.push({ type: 'restartLocal', register: restartLocal });
		}

		if (prologueEnd) {
			debugDirectives.push({ type: 'setPrologueEnd' });
		}

		if (epilogueBegin) {
			debugDirectives.push({ type: 'setEpilogueBegin' });
		}

		return {
			debugDirectives,
			labels,
			operation,
		};
	},
);

setParserName(smaliAnnotatedCodeOperationParser, 'smaliAnnotatedCodeOperationParser');

type SmaliExecutableCode<DalvikBytecode> = {
	dalvikExecutableCode: DalvikExecutableCode<DalvikBytecode>;
	parameters: SmaliCodeParameter[];
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
		const annotatedOperations: SmaliAnnotatedCodeOperation[] = [];
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
				} else if ('debugDirectives' in item && 'labels' in item && 'operation' in item) {
					// This is a SmaliAnnotatedCodeOperation
					const annotated = item as SmaliAnnotatedCodeOperation;
					annotatedOperations.push(annotated);
					const operation = annotated.operation;
					if (annotated.labels.length > 0) {
						(operation as any).labels = new Set(annotated.labels);
					}
					instructions.push(operation);
				} else if (item !== undefined) {
					// This is a SmaliCodeOperation (fallback)
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

		// Convert branchOffsetIndex (relative) to targetInstructionIndex (absolute)
		for (const [ operationIndex, operation ] of instructions.entries()) {
			if (
				'branchOffsetIndex' in operation
				&& typeof operation.branchOffsetIndex === 'number'
			) {
				// branchOffsetIndex is the relative instruction index from the label
				// targetInstructionIndex is the absolute instruction index
				(operation as any).targetInstructionIndex = operationIndex + operation.branchOffsetIndex;
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

				// For payload instructions, branchOffsetIndices contains instruction-relative indices
				// from the source switch instruction. Convert to absolute instruction indices.
				(operation as any).targetInstructionIndices = operation.branchOffsetIndices.map((branchOffsetIndex: number) => {
					// branchOffsetIndex is relative to the source operation
					return sourceOperationIndex + branchOffsetIndex;
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
		// Now using instruction indices directly instead of code unit offsets
		const triesByRange = new Map<string, {
			startInstructionIndex: number;
			instructionCount: number;
			handlers: Array<{ type: string; handlerInstructionIndex: number }>;
			catchAllInstructionIndex: number | undefined;
		}>();

		for (const catchDirective of catchDirectives) {
			// Find the start and end instruction indices
			const startIndex = labelToIndexMap.get(catchDirective.startLabel);
			const endIndex = labelToIndexMap.get(catchDirective.endLabel);
			const handlerIndex = labelToIndexMap.get(catchDirective.handlerLabel);

			invariant(startIndex !== undefined, 'Expected to find start label %s', catchDirective.startLabel);
			invariant(endIndex !== undefined, 'Expected to find end label %s', catchDirective.endLabel);
			invariant(handlerIndex !== undefined, 'Expected to find handler label %s', catchDirective.handlerLabel);

			// Use instruction indices directly
			const startInstructionIndex = startIndex;
			const instructionCount = endIndex - startIndex;
			const handlerInstructionIndex = handlerIndex;

			const rangeKey = `${startInstructionIndex}-${instructionCount}`;

			let tryEntry = triesByRange.get(rangeKey);
			if (!tryEntry) {
				tryEntry = {
					startInstructionIndex,
					instructionCount,
					handlers: [],
					catchAllInstructionIndex: undefined as number | undefined,
				};
				triesByRange.set(rangeKey, tryEntry);
			}

			if (catchDirective.type === undefined) {
				// .catchall
				tryEntry.catchAllInstructionIndex = handlerInstructionIndex;
			} else {
				// .catch Type
				tryEntry.handlers.push({
					type: catchDirective.type,
					handlerInstructionIndex,
				});
			}
		}

		const tries = Array.from(triesByRange.values()).map(tryEntry => ({
			startInstructionIndex: tryEntry.startInstructionIndex,
			instructionCount: tryEntry.instructionCount,
			handler: {
				handlers: tryEntry.handlers,
				catchAllInstructionIndex: tryEntry.catchAllInstructionIndex,
			},
		}));

		// Build debug info from debug directives
		// Debug info still uses code unit offsets (addressDiff), so we need to build the mapping
		// IMPORTANT: Must be done BEFORE deleting branchOffsetIndices, as getOperationSizeInCodeUnits uses it
		const codeUnitOffsetByInstructionIndex = new Map<number, number>();
		let codeUnitOffset = 0;
		for (let i = 0; i < instructions.length; i++) {
			codeUnitOffsetByInstructionIndex.set(i, codeUnitOffset);
			codeUnitOffset += getOperationSizeInCodeUnits(instructions[i]);
		}
		codeUnitOffsetByInstructionIndex.set(instructions.length, codeUnitOffset);
		// Alias for backward compatibility with debug info code
		const branchOffsetByBranchOffsetIndex = codeUnitOffsetByInstructionIndex;

		for (const operation of instructions) {
			delete (operation as any).labels;
			delete (operation as any).branchOffsetIndex;
			delete (operation as any).branchOffsetIndices;
		}

		type DebugByteCodeValue = DalvikExecutableDebugInfo['bytecode'][number];
		let debugInfo: DalvikExecutableDebugInfo | undefined;
		const debugBytecode: DebugByteCodeValue[] = [];
		let currentLine: number | undefined;
		let lineStart: number | undefined;

		// Helper to convert SmaliRegister to register number
		const getRegisterNum = (register: SmaliRegister): number => {
			// In Smali, 'v' registers start from 0, 'p' registers are parameters
			// For now, we'll just use the index. The actual conversion may need
			// to account for registersSize and parameter mapping.
			if (register.prefix === 'v') {
				return register.index;
			} else {
				// 'p' registers: need to map to actual register numbers
				// p0 starts at (registersSize - insSize)
				// For now, just use the index as we don't have accurate insSize
				return register.index;
			}
		};

		// Helper to emit accumulated line/address changes as special opcode or explicit opcodes
		const emitPendingChanges = (lineDiff: number, addressDiff: number) => {
			// Special opcode formula: opcode = 0x0A + (line_diff + 4) + 15 * addr_diff
			// Valid when: line_diff ∈ [-4, 10] and addr_diff ∈ [0, 17] and result ≤ 0xFF
			if (lineDiff >= -4 && lineDiff <= 10 && addressDiff >= 0) {
				const adjusted = (lineDiff + 4) + 15 * addressDiff;
				const opcode = 0x0A + adjusted;
				if (opcode <= 0xFF) {
					debugBytecode.push({
						type: 'special',
						value: opcode,
					});
					return;
				}
			}

			// Fall back to explicit opcodes
			if (addressDiff > 0) {
				debugBytecode.push({
					type: 'advancePc',
					addressDiff,
				});
			}
			if (lineDiff !== 0) {
				debugBytecode.push({
					type: 'advanceLine',
					lineDiff,
				});
			}
		};

		let accumulatedAddressDiff = 0;
		let accumulatedLineDiff = 0;
		let lastAddress = 0;
		let hasEmittedFirstDebugEvent = false;

		for (let i = 0; i < annotatedOperations.length; i++) {
			const annotated = annotatedOperations[i];
			const operationAddress = branchOffsetByBranchOffsetIndex.get(i) ?? 0;

			// Accumulate address difference (only after we've started tracking)
			if (i > 0 && hasEmittedFirstDebugEvent) {
				accumulatedAddressDiff += operationAddress - lastAddress;
			}
			lastAddress = operationAddress;

			// Process line directives first to update accumulatedLineDiff
			for (const directive of annotated.debugDirectives) {
				if (directive.type === 'line') {
					if (lineStart === undefined) {
						lineStart = directive.line;
						currentLine = directive.line;
					} else if (currentLine !== undefined) {
						accumulatedLineDiff += directive.line - currentLine;
						currentLine = directive.line;
					}
				}
			}

			// Emit accumulated changes before any other debug events
			const hasOtherDebugEvents = annotated.debugDirectives.some(d =>
				d.type !== 'line'
			);

			if (hasOtherDebugEvents && (accumulatedLineDiff !== 0 || accumulatedAddressDiff !== 0 || !hasEmittedFirstDebugEvent)) {
				emitPendingChanges(accumulatedLineDiff, accumulatedAddressDiff);
				accumulatedLineDiff = 0;
				accumulatedAddressDiff = 0;
				hasEmittedFirstDebugEvent = true;
			}

			// Emit other debug directives
			for (const directive of annotated.debugDirectives) {
				if (directive.type === 'startLocal') {
					debugBytecode.push({
						type: 'startLocal',
						registerNum: getRegisterNum(directive.local.register),
						name: directive.local.name,
						type_: directive.local.type,
					});
				} else if (directive.type === 'endLocal') {
					debugBytecode.push({
						type: 'endLocal',
						registerNum: getRegisterNum(directive.register),
					});
				} else if (directive.type === 'restartLocal') {
					debugBytecode.push({
						type: 'restartLocal',
						registerNum: getRegisterNum(directive.register),
					});
				} else if (directive.type === 'setPrologueEnd') {
					debugBytecode.push({
						type: 'setPrologueEnd',
					});
				} else if (directive.type === 'setEpilogueBegin') {
					debugBytecode.push({
						type: 'setEpilogueBegin',
					});
				}
			}
		}

		// Emit any remaining accumulated changes at the end
		if (accumulatedLineDiff !== 0 || accumulatedAddressDiff !== 0) {
			emitPendingChanges(accumulatedLineDiff, accumulatedAddressDiff);
		}

		if (lineStart !== undefined) {
			// Extract parameter names from .param directives
			const parameterNames: Array<undefined | string> = [];
			// TODO: Extract from parameters array if needed

			// If we have a lineStart but no bytecode, we need to emit a special opcode
			// to establish the initial state. The special value 0x0E (14) means:
			// adjusted = 14 - 10 = 4, line_diff = 4 % 15 - 4 = 0, pc_diff = 4 / 15 = 0
			if (debugBytecode.length === 0) {
				debugBytecode.push({
					type: 'special',
					value: 0x0A + 4, // 14 in decimal
				});
			}

			debugInfo = {
				lineStart,
				parameterNames,
				bytecode: debugBytecode,
			};
		}

		return {
			dalvikExecutableCode: {
				registersSize,
				insSize: -1, // TODO
				outsSize: -1, // TODO
				debugInfo,
				instructions: instructions as any, // TODO
				tries,
				// _annotations,
			},
			parameters,
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
			parameters,
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
				const smaliRegisters = rawDalvikBytecodeOperationCompanion.getRegisters(operation as RawDalvikBytecodeOperation) as unknown[] as SmaliRegister[]; // TODO

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

				const registers = rawDalvikBytecodeOperationCompanion.getRegisters(operation as RawDalvikBytecodeOperation);

				outsSize = Math.max(outsSize, registers.length); // TODO?: two words for wide types?
			}

			code.outsSize = outsSize;

			// Populate debug info parameter names
			// The parameter count is insSize minus 1 for non-static methods (to exclude 'this')
			if (code.debugInfo) {
				const paramCount = accessFlags.static ? insSize : insSize - 1;
				const paramNames: Array<undefined | string> = Array(paramCount).fill(undefined);

				// Map parameter names from .param directives
				// For non-static methods: p0 is 'this', p1 is first param (index 0)
				// For static methods: p0 is first param (index 0)
				for (const param of parameters) {
					if (param.register.prefix === 'p' && param.name) {
						const pRegister = param.register.index;
						// Adjust for 'this' parameter in non-static methods
						const paramIndex = accessFlags.static ? pRegister : pRegister - 1;
						if (paramIndex >= 0 && paramIndex < paramCount) {
							paramNames[paramIndex] = param.name;
						}
					}
				}

				code.debugInfo.parameterNames = paramNames;
			}
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
	createArrayParser(createDisjunctionParser([
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
						elements: annotation.elements.map(element => ({
							name: element.name,
							value: convertToTaggedEncodedValue(element.value),
						})),
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
						elements: parameterAnnotation.annotation.elements.map(element => ({
							name: element.name,
							value: convertToTaggedEncodedValue(element.value),
						})),
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

		// Sort parameter annotations by method index in the combined method list
		// to match the order in the DEX file's annotations directory
		const allMethods = [...directMethods, ...virtualMethods];
		parameterAnnotations.sort((a, b) => {
			const indexA = allMethods.findIndex(m => dalvikExecutableMethodEquals(m.method, a.method));
			const indexB = allMethods.findIndex(m => dalvikExecutableMethodEquals(m.method, b.method));
			return indexA - indexB;
		});

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
			// Numbers, bigints, strings, and true are non-default
			// false and null are default values
			if (initValue !== undefined && typeof initValue === 'number') {
				lastIndexWithInitializer = i;
				break;
			}

			if (initValue !== undefined && typeof initValue === 'bigint') {
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
					const fieldType = smaliField.field.field.type;

					if (smaliField.initialValue === undefined) {
						// For integer types without initializer, DEX stores 0
						if (fieldType === 'I') {
							return { type: 'int' as const, value: 0 };
						}
						if (fieldType === 'B') {
							return { type: 'byte' as const, value: 0 };
						}
						if (fieldType === 'S') {
							return { type: 'short' as const, value: 0 };
						}
						if (fieldType === 'C') {
							return { type: 'char' as const, value: 0 };
						}
						// For long types without initializer, DEX stores 0n
						if (fieldType === 'J') {
							return { type: 'long' as const, value: 0n };
						}
						// For float/double types without initializer, DEX stores 0
						if (fieldType === 'F') {
							return { type: 'float' as const, value: 0 };
						}
						if (fieldType === 'D') {
							return { type: 'double' as const, value: 0 };
						}
						// For boolean types without initializer, DEX stores false
						if (fieldType === 'Z') {
							return { type: 'boolean' as const, value: false };
						}
						// For other types (reference types, etc.), return null
						return { type: 'null' as const, value: null };
					}

					// Numeric values are stored in static values array
					if (typeof smaliField.initialValue === 'number') {
						// Convert to BigInt for long (J) types
						if (fieldType === 'J') {
							return { type: 'long' as const, value: BigInt(smaliField.initialValue) };
						}
						if (fieldType === 'B') {
							return { type: 'byte' as const, value: smaliField.initialValue };
						}
						if (fieldType === 'S') {
							return { type: 'short' as const, value: smaliField.initialValue };
						}
						if (fieldType === 'C') {
							return { type: 'char' as const, value: smaliField.initialValue };
						}
						if (fieldType === 'F') {
							return { type: 'float' as const, value: smaliField.initialValue };
						}
						if (fieldType === 'D') {
							return { type: 'double' as const, value: smaliField.initialValue };
						}
						// Default to int for other numeric types
						return { type: 'int' as const, value: smaliField.initialValue };
					}

					// BigInt values for long (J) types
					if (typeof smaliField.initialValue === 'bigint') {
						return { type: 'long' as const, value: smaliField.initialValue };
					}

					// String values should be stored as string type
					if (typeof smaliField.initialValue === 'string') {
						return { type: 'string' as const, value: smaliField.initialValue };
					}

					// Boolean true is a non-default value and should be in staticValues
					if (smaliField.initialValue === true) {
						return { type: 'boolean' as const, value: true };
					}

					// Boolean false and null are default values
					// For boolean fields with explicit false, return false
					if (smaliField.initialValue === false && fieldType === 'Z') {
						return { type: 'boolean' as const, value: false };
					}

					// For null or other default values, return null
					return { type: 'null' as const, value: null };
				});
		const fields = {
			staticFields: smaliFields?.staticFields.map(({ field }) => field) ?? [],
			instanceFields: smaliFields?.instanceFields.map(({ field }) => field) ?? [],
		};

		// Sort fields to match DEX file order (by field name, then type)
		// This matches the field order in class_data_item in DEX files
		// Use binary string comparison (case-sensitive) to match UTF-8 byte order
		const sortFields = (fieldsList: DalvikExecutableFieldWithAccess[]) => {
			fieldsList.sort((a, b) => {
				// First by field name (case-sensitive comparison)
				if (a.field.name !== b.field.name) {
					return a.field.name < b.field.name ? -1 : 1;
				}
				// Then by field type (case-sensitive comparison)
				return a.field.type < b.field.type ? -1 : 1;
			});
		};

		sortFields(fields.staticFields);
		sortFields(fields.instanceFields);

		const annotations: DalvikExecutableClassAnnotations = {
			classAnnotations: (classAnnotations ?? []).map(annotation => ({
				type: annotation.type,
				visibility: annotation.visibility,
				elements: annotation.elements.map(element => ({
					name: element.name,
					value: convertToTaggedEncodedValue(element.value),
				})),
			})),
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
				existingFieldAnnotations.annotations.push(...smaliField.annotations.map(annotation => ({
					type: annotation.type,
					visibility: annotation.visibility,
					elements: annotation.elements.map(element => ({
						name: element.name,
						value: convertToTaggedEncodedValue(element.value),
					})),
				})));
				continue;
			}

			annotations.fieldAnnotations.push({
				field: smaliField.field.field,
				annotations: smaliField.annotations.map(annotation => ({
					type: annotation.type,
					visibility: annotation.visibility,
					elements: annotation.elements.map(element => ({
						name: element.name,
						value: convertToTaggedEncodedValue(element.value),
					})),
				})),
			});
		}

		// Sort field annotations to match DEX file order (by field name, then type)
		// This matches the annotations_directory_item field_annotations order in DEX files
		// Use binary string comparison (case-sensitive) to match UTF-8 byte order
		annotations.fieldAnnotations.sort((a, b) => {
			// First by field name (case-sensitive comparison)
			if (a.field.name !== b.field.name) {
				return a.field.name < b.field.name ? -1 : 1;
			}
			// Then by field type (case-sensitive comparison)
			return a.field.type < b.field.type ? -1 : 1;
		});

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
						methodAnnotations: annotations.methodAnnotations
							.map(methodAnnotation => ({
								...methodAnnotation,
								method: {
									...methodAnnotation.method,
									class: class_,
								},
							}))
							// Sort method annotations to match DEX file order (lexicographic by method name, then prototype shorty)
							// This matches the method_idx order in the DEX file's method_id table
							.sort((a, b) => {
								// Sort by method name first (using code point comparison, not locale-aware)
								if (a.method.name !== b.method.name) {
									return a.method.name < b.method.name ? -1 : 1;
								}
								// Then by shorty (prototype signature)
								return a.method.prototype.shorty < b.method.prototype.shorty ? -1 : 1;
							}),
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
