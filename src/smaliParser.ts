import invariant from "invariant";
import { DalvikBytecode, DalvikBytecodeOperation, dalvikBytecodeOperationCompanion } from "./dalvikBytecodeParser.js";
import { DalvikExecutableAccessFlags, dalvikExecutableAccessFlagsDefault, DalvikExecutableClassAnnotations, DalvikExecutableClassData, DalvikExecutableClassDefinition, DalvikExecutableClassMethodAnnotation, DalvikExecutableClassParameterAnnotation, DalvikExecutableCode, DalvikExecutableField, DalvikExecutableFieldWithAccess, DalvikExecutableMethod, dalvikExecutableMethodEquals, DalvikExecutableMethodWithAccess, DalvikExecutablePrototype, isDalvikExecutableField, isDalvikExecutableMethod } from "./dalvikExecutable.js";
import { createExactSequenceParser } from "./exactSequenceParser.js";
import { cloneParser, Parser, setParserName } from "./parser.js";
import { ParserContext } from "./parserContext.js";
import { promiseCompose } from "./promiseCompose.js";
import { createTupleParser } from "./tupleParser.js";
import { createUnionParser } from "./unionParser.js";
import { createArrayParser } from "./arrayParser.js";
import { jsonNumberParser, jsonStringParser } from "./jsonParser.js";
import { createNonEmptyArrayParser } from "./nonEmptyArrayParser.js";
import { createOptionalParser } from "./optionalParser.js";
import { createNegativeLookaheadParser } from "./negativeLookaheadParser.js";
import { createSeparatedArrayParser } from "./separatedArrayParser.js";
import { smaliMemberNameParser, smaliTypeDescriptorParser } from "./dalvikExecutableParser/stringSyntaxParser.js";
import { createDisjunctionParser } from "./disjunctionParser.js";
import { formatSizes } from "./dalvikBytecodeParser/formatSizes.js";
import { operationFormats } from "./dalvikBytecodeParser/operationFormats.js";
import { createSeparatedNonEmptyArrayParser } from "./separatedNonEmptyArrayParser.js";
import { parserCreatorCompose } from "./parserCreatorCompose.js";

function getOperationFormatSize(operation: DalvikBytecodeOperation): number {
	if (operation.operation === 'packed-switch-payload') {
		return -1;
	}

	if (operation.operation === 'sparse-switch-payload') {
		return -1;
	}

	const operationFormat = operationFormats[operation.operation];
	invariant(operationFormat, 'Unknown operation format for %s', operation.operation);

	const operationSize = formatSizes[operationFormat];
	invariant(operationSize, `Unknown operation size for format %s of operation %s`, operationFormat, operation.operation);

	return operationSize;
}

const smaliNewlinesParser: Parser<void, string> = promiseCompose(
	createNonEmptyArrayParser(createExactSequenceParser('\n')),
	(_newlines) => undefined,
);

const smaliSingleWhitespaceParser = createExactSequenceParser(' ');

const smaliWhitespaceParser: Parser<void, string> = promiseCompose(
	createArrayParser(smaliSingleWhitespaceParser),
	(_indentation) => undefined,
);

const smaliSingleIndentationParser = createExactSequenceParser('    ');

const smaliIndentationParser: Parser<void, string> = promiseCompose(
	createArrayParser(smaliSingleIndentationParser),
	(_indentation) => undefined,
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

const smaliCommentsOrNewlinesParser: Parser<string[], string> = promiseCompose(
	createArrayParser(createUnionParser<undefined | string, string, string>([
		smaliNewlinesParser,
		smaliCommentParser,
	])),
	(newlinesOrComments) => newlinesOrComments.filter((newlineOrComment): newlineOrComment is string => typeof newlineOrComment === 'string'),
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

const smaliQuotedStringParser: Parser<string, string> = jsonStringParser;

const smaliAccessFlagsParser: Parser<DalvikExecutableAccessFlags, string> = promiseCompose(
	createSeparatedArrayParser(
		createUnionParser<keyof DalvikExecutableAccessFlags, string>([
			createExactSequenceParser('public'),
			createExactSequenceParser('protected'),
			createExactSequenceParser('private'),
			createExactSequenceParser('final'),
			createExactSequenceParser('brigde'),
			createExactSequenceParser('synthetic'),
			createExactSequenceParser('varargs'),
			createExactSequenceParser('static'),
			createExactSequenceParser('constructor'),
			createExactSequenceParser('abstract'),
			createExactSequenceParser('native'),
			createExactSequenceParser('volatile'),
			createExactSequenceParser('synchronized'),
			createExactSequenceParser('strict'),
			createExactSequenceParser('interface'),
			createExactSequenceParser('annotation'),
			createExactSequenceParser('enum'),
		]),
		smaliSingleWhitespaceParser,
	),
	(accessFlagNames) => {
		const accessFlags = dalvikExecutableAccessFlagsDefault();

		for (const accessFlagName of accessFlagNames) {
			accessFlags[accessFlagName] = true;
		}

		return accessFlags;
	},
);

const smaliClassDeclarationParser: Parser<Pick<DalvikExecutableClassDefinition<unknown>, 'accessFlags' | 'class'>, string> = promiseCompose(
	createTupleParser([
		smaliCommentsOrNewlinesParser,
		createExactSequenceParser('.class '),
		createOptionalParser(
			promiseCompose(
				createTupleParser([
					smaliAccessFlagsParser,
					smaliSingleWhitespaceParser,
				]),
				([
					accessFlags,
				]) => accessFlags,
			),
		),
		smaliTypeDescriptorParser,
		createExactSequenceParser('\n'),
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
		createExactSequenceParser('\n'),
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
		createExactSequenceParser('\n'),
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
		createExactSequenceParser('\n'),
	]),
	([
		_source,
		sourceFile,
		_newline,
	]) => ({
		sourceFile,
	}),
);

export const smaliFieldParser: Parser<DalvikExecutableFieldWithAccess, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('.field '),
		smaliAccessFlagsParser,
		smaliSingleWhitespaceParser,
		smaliMemberNameParser,
		createExactSequenceParser(':'),
		smaliTypeDescriptorParser,
		createExactSequenceParser('\n'),
	]),
	([
		_field,
		accessFlags,
		_space,
		name,
		_colon,
		type,
	]) => {
		return {
			accessFlags,
			field: {
				class: 'FILLED_LATER',
				type,
				name,
			},
		};
	},
);

setParserName(smaliFieldParser, 'smaliFieldParser');

type SmaliFields = Pick<DalvikExecutableClassData<DalvikBytecode>, 'instanceFields' | 'staticFields'>;

const smaliFieldsParser: Parser<SmaliFields, string> = promiseCompose(
	createSeparatedNonEmptyArrayParser<string[] | DalvikExecutableFieldWithAccess, string>(
		smaliFieldParser,
		smaliCommentsOrNewlinesParser,
	),
	(fieldsAndComments) => {
		let type: 'staticField' | 'instanceField' = 'instanceField';

		const staticFields: DalvikExecutableFieldWithAccess[] = [];
		const instanceFields: DalvikExecutableFieldWithAccess[] = [];

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

			const field = fieldOrComment as DalvikExecutableFieldWithAccess;

			if (
				type === 'staticField'
				|| field.accessFlags.static
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
	}
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

function shortyFromLongy(longy: string): string {
	if (longy.startsWith('[')) {
		return 'L';
	}

	return longy.slice(0, 1);
}

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
		shorty: shortyFromLongy(returnType) + parameters.map((parameter) => {
			if (parameter === 'V') {
				return '';
			}

			return shortyFromLongy(parameter);
		}).join(''),
	}),
);

setParserName(smaliMethodPrototypeParser, 'smaliMethodPrototypeParser');

const smaliCodeRegistersParser: Parser<number, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('    .registers '),
		jsonNumberParser,
		createExactSequenceParser('\n'),
	]),
	([
		_registers,
		registers,
		_newline,
	]) => registers,
);

setParserName(smaliCodeRegistersParser, 'smaliCodeRegistersParser');

type SmaliAnnotationElement = unknown; // TODO

const smaliAnnotationElementParser: Parser<SmaliAnnotationElement, string> = promiseCompose(
	createTupleParser([
		smaliIdentifierParser,
		createExactSequenceParser(' = '),
		createUnionParser([
			smaliTypeDescriptorParser,
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
					createExactSequenceParser('\n'),
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
					createExactSequenceParser('\n'),
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
		createExactSequenceParser('\n'),
	]),
	([
		name,
		_equalsSign,
		value,
		_newline,
	]) => ({
		name,
		value,
	}),
);

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
		createExactSequenceParser('\n'),
		smaliIndentationParser,
		createArrayParser(
			smaliAnnotationElementParser,
		),
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
		_indentation1,
		elements,
		_endAnnotation,
	]) => ({
		type,
		elements,
		visibility,
	}),
);

setParserName(smaliAnnotationParser, 'smaliAnnotationParser');

const smaliCodeLineParser: Parser<number, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('    .line '),
		jsonNumberParser,
		createExactSequenceParser('\n'),
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
			jsonNumberParser,
		]),
		createTupleParser([
			createExactSequenceParser('p'),
			jsonNumberParser,
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
		createOptionalParser(
			createTupleParser([
				createExactSequenceParser(','),
				smaliWhitespaceParser,
				jsonStringParser,
				createExactSequenceParser(':'),
				smaliTypeDescriptorParser,
			]),
		),
		createExactSequenceParser('\n'),
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
		createOptionalParser(
			createTupleParser([
				createExactSequenceParser(','),
				smaliWhitespaceParser,
				jsonStringParser,
				smaliWhitespaceParser,
			]),
		),
		createOptionalParser(smaliWhitespaceParser),
		smaliCommentsOrNewlinesParser,
		createOptionalParser(
			createTupleParser([
				smaliAnnotationParser,
				smaliIndentationParser,
				createExactSequenceParser('.end param\n'),
			]),
		),
	]),
	([
		_param,
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
		createExactSequenceParser('\n'),
	]),
	([
		_label,
		label,
		_newlabel,
	]) => label,
);

setParserName(smaliCodeLabelLineParser, 'smaliCodeLabelLineParser');

const smaliParametersRegistersParser: Parser<SmaliRegister[], string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('{'),
		createArrayParser(
			promiseCompose(
				createTupleParser([
					smaliParametersRegisterParser,
					createOptionalParser(createExactSequenceParser(', ')),
				]),
				([
					parameter,
					_comma,
				]) => parameter,
			),
		),
		createExactSequenceParser('}'),
	]),
	([
		_openBrace,
		parameters,
		_closeBrace,
	]) => parameters,
);

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
	})
);

setParserName(smaliParametersMethodParser, 'smaliParametersMethodParser');

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
	})
);

setParserName(smaliParametersFieldParser, 'smaliParametersFieldParser');

type SmaliCodeOperationParameter =
	| SmaliRegister
	| SmaliRegister[]
	| string
	| DalvikExecutableMethod
;

const smaliCodeOperationParametersParser: Parser<SmaliCodeOperationParameter[], string> = createArrayParser(
	promiseCompose(
		createTupleParser([
			createUnionParser<SmaliCodeOperationParameter, string>([
				smaliParametersRegisterParser,
				smaliParametersRegistersParser,
				smaliParametersStringParser,
				smaliParametersIntegerParser,
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
	),
);

setParserName(smaliCodeOperationParametersParser, 'smaliCodeOperationParametersParser');

const smaliCodeOperationNameParser: Parser<string, string> = promiseCompose(
	createTupleParser([
		promiseCompose(
			createSeparatedArrayParser(
				smaliIdentifierParser,
				createExactSequenceParser('-'),
			),
			(parts) => parts.join('-'),
		),
		createOptionalParser(
			promiseCompose(
				createTupleParser([
					createExactSequenceParser('/'),
					smaliIdentifierParser,
				]),
				([ slash, name ]) => slash + name,
			),
		),
	]),
	([
		name,
		optionalSlashName,
	]) => name + (optionalSlashName || ''),
);

setParserName(smaliCodeOperationNameParser, 'smaliCodeOperationNameParser');

const smaliOneLineCodeOperationParser: Parser<DalvikBytecodeOperation, string> = promiseCompose(
	createTupleParser([
		smaliSingleIndentationParser,
		smaliCodeOperationNameParser,
		promiseCompose(
			createOptionalParser(createTupleParser([
				smaliSingleWhitespaceParser,
				smaliCodeOperationParametersParser,
			])),
			(undefinedOrParameters) => undefinedOrParameters === undefined ? [] : undefinedOrParameters[1],
		),
		createExactSequenceParser('\n'),
	]),
	([
		_indent,
		operation,
		parameters,
		_newline,
	]) => ({
		operation,
		parameters,
	} as any), // TODO
);

setParserName(smaliOneLineCodeOperationParser, 'smaliOneLineCodeOperationParser');

type SmaliCodeOperationBody = unknown; // TODO

const createMultilineSmaliCodeOperationBodyParser: (operationName: string) => Parser<SmaliCodeOperationBody, string> = operationName => promiseCompose(
	createTupleParser([
		createArrayParser(
			promiseCompose(
				createTupleParser([
					smaliIndentationParser,
					smaliCodeLabelParser,
					createExactSequenceParser('\n'),
				]),
				([
					_indentation,
					label,
					_newline,
				]) => label,
			),
		),
		smaliIndentationParser,
		createExactSequenceParser('.end '),
		createExactSequenceParser(operationName),
		createExactSequenceParser('\n'),
	]),
	([
		labels,
	]) => labels,
);

const smaliMultilineCodeOperationParser: Parser<DalvikBytecodeOperation, string> = parserCreatorCompose(
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
				(undefinedOrParameters) => undefinedOrParameters === undefined ? [] : undefinedOrParameters[1],
			),
			createExactSequenceParser('\n'),
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
		} as any), // TODO
	),
	({ operation, parameters }) => promiseCompose(
		createMultilineSmaliCodeOperationBodyParser(operation),
		body => ({
			operation,
			parameters,
			body,
		}) as any, // TODO
	),
)();

setParserName(smaliMultilineCodeOperationParser, 'smaliMultilineCodeOperationParser');

const smaliLooseCodeOperationParser: Parser<any, string> = createUnionParser([
	smaliOneLineCodeOperationParser,
	smaliMultilineCodeOperationParser,
]);

setParserName(smaliLooseCodeOperationParser, 'smaliLooseCodeOperationParser');

export const smaliCodeOperationParser: Parser<any, string> = promiseCompose(
	smaliLooseCodeOperationParser,
	operation => {
		const operation_ = {
			operation: operation.operation,
			// line,
			// local,
			// parameters: (operation as any).parameters,
		} as any; // TODO

		if ('body' in operation) {
			const operationDexName = payloadOperationSmaliNameToDexName.get(operation.operation);

			invariant(operationDexName, 'Unknown payload operation for %s', operation.operation);

			operation_.operation = operationDexName;
			operation_.branchLabels = operation.body;
		}

		const hasRegisters = Array.isArray(operation.parameters.at(0));
		if (hasRegisters) {
			operation_.registers = [];
		}

		for (const parameter of (operation as unknown as { parameters: unknown[]; }).parameters.flat() ?? []) {
			if (isDalvikExecutableMethod(parameter)) {
				operation_.method = parameter;

				continue;
			}

			if (isDalvikExecutableField(parameter)) {
				operation_.field = parameter;

				continue;
			}

			if (isSmaliRegister(parameter)) {
				if (!operation_.registers) {
					operation_.registers = [];
				}

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
				operation_.value = parameter;

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
	'check-cast',
	'instance-of',
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
	// 'fill-array-data', // TODO
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

const smaliAnnotatedCodeOperationParser: Parser<DalvikBytecodeOperation, string> = promiseCompose(
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
		if (labels.length) {
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
		createOptionalParser(
			smaliCodeRegistersParser,
		),
		createArrayParser(
			smaliAnnotationParser,
		),
		createArrayParser(
			smaliCodeParameterParser,
		),
		createSeparatedArrayParser(
			smaliAnnotationParser,
			smaliCommentsOrNewlinesParser,
		),
		createArrayParser(
			promiseCompose(
				createTupleParser([
					createOptionalParser(smaliCommentsOrNewlinesParser),
					smaliAnnotatedCodeOperationParser,
				]),
				([
					_commentsOrNewlines,
					operation,
				]) => operation,
			),
		),
	]),
	([
		registersSize,
		annotations1,
		parameters,
		annotations2,
		instructions,
	]) => {
		const annotations = [ ...annotations1, ...annotations2 ];

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
				instructions,
				tries: [], // TODO
				// _annotations,
			},
			parameterAnnotations: parameters.filter((param) => param.annotation !== undefined),
			methodAnnotations: annotations,
		};
	},
);

setParserName(smaliExecutableCodeParser, 'smaliExecutableCodeParser');

const sortRegistersOperations = new Set<DalvikBytecodeOperation['operation']>([
	'if-eq',
	'if-ne',
]);

function normalizeOperation(operation: DalvikBytecodeOperation): DalvikBytecodeOperation {
	if (
		sortRegistersOperations.has(operation.operation)
			&& 'registers' in operation
	) {
		operation.registers.sort();
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
		smaliAccessFlagsParser,
		smaliSingleWhitespaceParser,
		smaliMemberNameParser,
		smaliMethodPrototypeParser,
		createExactSequenceParser('\n'),
		smaliExecutableCodeParser,
		createArrayParser(smaliCodeLineParser),
		createExactSequenceParser('.end method\n'),
	]),
	([
		_method,
		accessFlags,
		_space,
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
		let code: DalvikExecutableCode<DalvikBytecode> | undefined = dalvikExecutableCode;

		if (accessFlags.native && !code.instructions.length) {
			code = undefined;
		}

		if (code) {
			const insSize = (accessFlags.static ? 0 : 1) + prototype.parameters.length;

			code.insSize = insSize;

			for (const operation of code.instructions) {
				const smaliRegisters = dalvikBytecodeOperationCompanion.getRegisters(operation) as unknown[] as SmaliRegister[]; // TODO

				if (!smaliRegisters.length) {
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
				code: code ? {
					...code,
					instructions: code.instructions.map(normalizeOperation),
				} : undefined,
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
	createArrayParser<string[] | SmaliMethod<DalvikBytecode>, string>(
		createDisjunctionParser<string[] | SmaliMethod<DalvikBytecode>, string, string>([
			smaliMethodParser,
			smaliCommentsOrNewlinesParser,
		]),
	),
	(methodsAndComments) => {
		let type: 'directMethod' | 'virtualMethod' = 'directMethod';

		const directMethods: DalvikExecutableMethodWithAccess<DalvikBytecode>[] = [];
		const virtualMethods: DalvikExecutableMethodWithAccess<DalvikBytecode>[] = [];

		const parameterAnnotations: DalvikExecutableClassParameterAnnotation[] = [];
		const methodAnnotations: DalvikExecutableClassMethodAnnotation[] = [];

		function pushParameterAnnotation(annotation: DalvikExecutableClassParameterAnnotation) {
			if (annotation.annotations.length === 0) {
				return;
			}

			const existingMethod = parameterAnnotations.find((parameterAnnotation) => dalvikExecutableMethodEquals(
				parameterAnnotation.method,
				annotation.method,
			));

			if (existingMethod) {
				for (const [ index, paramAnnotations ] of annotation.annotations.entries()) {
					const existingParamAnnotations = existingMethod.annotations.at(index);

					if (existingParamAnnotations) {
						existingParamAnnotations.push(...paramAnnotations);
					} else {
						existingMethod.annotations[index] = paramAnnotations;
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

			if (method.methodAnnotations.length) {
				methodAnnotations.push({
					method: method.dalvikExecutableMethodWithAccess.method,
					annotations: method.methodAnnotations.map((annotation) => ({
						type: annotation.type,
						visibility: annotation.visibility,
						elements: annotation.elements as any ?? [], // TODO
					})),
				});
			}

			pushParameterAnnotation({
				method: method.dalvikExecutableMethodWithAccess.method,
				annotations: method.parameterAnnotations.map((parameterAnnotation) => [{
					type: parameterAnnotation.annotation!.type, // TODO
					visibility: parameterAnnotation.annotation!.visibility, // TODO
					elements: parameterAnnotation.annotation?.elements as any ?? [], // TODO
				}]),
			});

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
	}
);

setParserName(smaliMethodsParser, 'smaliMethodsParser');

export const smaliParser: Parser<DalvikExecutableClassDefinition<DalvikBytecode>, string> = promiseCompose(
	createTupleParser([
		smaliClassDeclarationParser,
		smaliSuperDeclarationParser,
		smaliSourceDeclarationParser,
		createOptionalParser(
			promiseCompose(
				createTupleParser([
					smaliCommentsOrNewlinesParser,
					createNonEmptyArrayParser(smaliInterfaceDeclarationParser),
				]),
				([
					_commentsOrNewlines,
					interfaces,
				]) => interfaces,
			),
		),
		createOptionalParser(
			promiseCompose(
				createTupleParser([
					smaliCommentsOrNewlinesParser,
					createNonEmptyArrayParser(smaliAnnotationParser),
				]),
				([
					_commentsOrNewlines,
					classAnnotations,
				]) => classAnnotations,
			),
		),
		createOptionalParser(
			promiseCompose(
				createTupleParser([
					smaliCommentsOrNewlinesParser,
					smaliFieldsParser,
				]),
				([
					_commentsOrNewlines,
					fields,
				]) => fields,
			),
		),
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
		{
			sourceFile,
		},
		interfaces,
		classAnnotations,
		fields,
		methods,
	]) => {
		const annotations: DalvikExecutableClassAnnotations = {
			classAnnotations: classAnnotations as any ?? [], // TODO
			fieldAnnotations: [], // TODO
			methodAnnotations: methods.methodAnnotations,
			parameterAnnotations: methods.parameterAnnotations,
		};

		return {
			accessFlags,
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
						fieldAnnotations: annotations.fieldAnnotations,
						methodAnnotations: annotations.methodAnnotations.map((methodAnnotation) => ({
							...methodAnnotation,
							method: {
								...methodAnnotation.method,
								class: class_,
							},
						})),
						parameterAnnotations: annotations.parameterAnnotations.map((parameterAnnotation) => ({
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
					methods.directMethods.length
						|| methods.virtualMethods.length
						|| (fields?.staticFields.length ?? 0)
						|| (fields?.instanceFields.length ?? 0)
				)
					? ({
						directMethods: methods.directMethods.map((method) => ({
							...method,
							method: {
								...method.method,
								class: class_,
							},
						})),
						virtualMethods: methods.virtualMethods.map((method) => ({
							...method,
							method: {
								...method.method,
								class: class_,
							},
						})),
						staticFields: (fields?.staticFields ?? []).map((field) => ({
							...field,
							field: {
								...field.field,
								class: class_,
							},
						})),
						instanceFields: (fields?.instanceFields ?? []).map((field) => ({
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
			staticValues: [], // TODO
		};
	},
);

setParserName(smaliParser, 'smaliParser');
