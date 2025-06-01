import invariant from "invariant";
import { DalvikBytecode, DalvikBytecodeOperation, dalvikBytecodeOperationCompanion } from "./dalvikBytecodeParser.js";
import { DalvikExecutableAccessFlags, DalvikExecutableClassData, DalvikExecutableClassDefinition, DalvikExecutableCode, DalvikExecutableField, DalvikExecutableFieldWithAccess, DalvikExecutableMethod, DalvikExecutableMethodWithAccess, DalvikExecutablePrototype, isDalvikExecutableField, isDalvikExecutableMethod } from "./dalvikExecutable.js";
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

const smaliOptionalIndentationParser: Parser<void, string> = promiseCompose(
	createArrayParser(smaliSingleIndentationParser),
	(_indentation) => undefined,
);

const smaliCommentParser: Parser<string, string> = promiseCompose(
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
			// ... TODO
		]),
		smaliSingleWhitespaceParser,
	),
	(accessFlagNames) => {
		const accessFlags = {
			public: false,
			private: false,
			protected: false,
			static: false,
			final: false,
			synchronized: false,
			volatile: false,
			bridge: false,
			transient: false,
			varargs: false,
			native: false,
			interface: false,
			abstract: false,
			strict: false,
			synthetic: false,
			annotation: false,
			enum: false,
			constructor: false,
			declaredSynchronized: false,
		};

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
		smaliAccessFlagsParser,
		smaliSingleWhitespaceParser,
		smaliTypeDescriptorParser,
		createExactSequenceParser('\n'),
	]),
	([
		_commentsOrNewlines,
		_dotClass,
		accessFlags,
		_space,
		classPath,
		_newline,
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
	createArrayParser<string[] | DalvikExecutableFieldWithAccess, string>(
		createDisjunctionParser<string[] | DalvikExecutableFieldWithAccess, string, string>([
			smaliFieldParser,
			smaliCommentsOrNewlinesParser,
		]),
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

			if (type === 'staticField') {
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

export const smaliAnnotationParser: Parser<unknown, string> = promiseCompose(
	createTupleParser([
		smaliOptionalIndentationParser,
		createExactSequenceParser('.annotation '),
		createUnionParser([
			createExactSequenceParser('build'),
			createExactSequenceParser('runtime'),
			createExactSequenceParser('system'),
		]),
		smaliSingleWhitespaceParser,
		smaliTypeDescriptorParser,
		createExactSequenceParser('\n'),
		smaliOptionalIndentationParser,
		createOptionalParser(
			promiseCompose(
				createTupleParser([
					createExactSequenceParser('value = '),
					createUnionParser([
						smaliTypeDescriptorParser,
						promiseCompose(
							createTupleParser([
								createExactSequenceParser('{\n'),
								createSeparatedArrayParser(
									promiseCompose(
										createTupleParser([
											smaliOptionalIndentationParser,
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
								smaliOptionalIndentationParser,
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
											smaliOptionalIndentationParser,
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
								smaliOptionalIndentationParser,
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
					_indentation,
					value,
					_newline,
				]) => value,
			),
		),
		smaliOptionalIndentationParser,
		createExactSequenceParser('.end annotation\n'),
	]),
	([
		_indentation0,
		_annotation,
		_accessFlags,
		_space,
		type,
		_newline,
		_indentation1,
		value,
		_endAnnotation,
	]) => ({
		type,
		value,
		// accessFlags,
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

export const smaliCodeParameterParser: Parser<SmaliRegister, string> = promiseCompose(
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
		createOptionalParser(smaliCommentParser),
		createExactSequenceParser('\n'),
	]),
	([
		_param,
		parameter,
		_newparam,
		_commentOrNewline,
	]) => parameter,
);

setParserName(smaliCodeParameterParser, 'smaliCodeParameterParser');

const smaliCodeLabelParser: Parser<string, string> = promiseCompose(
	createTupleParser([
		createExactSequenceParser('    :'),
		smaliIdentifierParser,
		createExactSequenceParser('\n'),
	]),
	([
		_label,
		label,
		_newlabel,
	]) => label,
);

setParserName(smaliCodeLabelParser, 'smaliCodeLabelParser');

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
		_0x,
		value,
		optionalL,
	]) => {
		if (optionalL) {
			return BigInt('0x' + value);
		}

		return parseInt(value, 16);
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

const smaliCodeOperationParser: Parser<DalvikBytecodeOperation, string> = promiseCompose(
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

setParserName(smaliCodeOperationParser, 'smaliCodeOperationParser');

const operationsWithTypeArgument = new Set<DalvikBytecodeOperation['operation']>([
	'new-instance',
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
]);

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
		createArrayParser(smaliCodeLabelParser),
		smaliCodeOperationParser,
	]),
	([
		_lines,
		_local,
		labels,
		operation,
	]) => {
		const operation_ = {
			operation: operation.operation,
			// line,
			// local,
			// parameters: (operation as any).parameters,
		} as any; // TODO

		if (labels.length) {
			operation_.labels = new Set(labels);
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

const smaliExecutableCodeParser: Parser<DalvikExecutableCode<DalvikBytecode>, string> = promiseCompose(
	createTupleParser([
		smaliCodeRegistersParser,
		createArrayParser(
			smaliAnnotationParser,
		),
		createOptionalParser(smaliCodeParameterParser),
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
		_annotations,
		_parameters,
		instructions,
	]) => {
		for (const [ operationIndex, operation ] of instructions.entries()) {
			if (!(
				'branchLabel' in operation
				&& typeof operation.branchLabel === 'string'
			)) {
				continue;
			}

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

		const branchOffsetByBranchOffsetIndex = new Map<number, number>();

		let operationOffset = 0;

		for (const [ operationIndex, operation ] of instructions.entries()) {
			const operationFormat = operationFormats[operation.operation];
			invariant(operationFormat, 'Unknown operation format for %s', operation.operation);

			const operationSize = formatSizes[operationFormat];
			invariant(operationSize, `Unknown operation size for format %s of operation %s`, operationFormat, operation.operation);

			branchOffsetByBranchOffsetIndex.set(
				operationIndex,
				operationOffset,
			);

			operationOffset += operationSize;
		}

		for (const [ operationIndex, operation ] of instructions.entries()) {
			if (!(
				'branchOffsetIndex' in operation
				&& typeof operation.branchOffsetIndex === 'number'
			)) {
				continue;
			}

			const operationOffset = branchOffsetByBranchOffsetIndex.get(operationIndex + operation.branchOffsetIndex);
			invariant(
				operationOffset !== undefined,
				'Expected branch offset for operation index %d, but got undefined',
				operation.branchOffsetIndex,
			);

			const branchOffset = branchOffsetByBranchOffsetIndex.get(operationIndex);
			invariant(
				branchOffset !== undefined,
				'Expected branch offset for operation index %d, but got undefined',
				operationIndex,
			);

			(operation as any).branchOffset = operationOffset - branchOffset;
		}

		for (const operation of instructions) {
			delete (operation as any).labels;
			delete (operation as any).branchOffsetIndex;
		}

		return {
			registersSize,
			insSize: -1, // TODO
			outsSize: -1, // TODO
			debugInfo: undefined, // TODO
			instructions,
			tries: [], // TODO
			// _annotations,
		};
	},
);

setParserName(smaliExecutableCodeParser, 'smaliExecutableCodeParser');

const smaliMethodParser: Parser<DalvikExecutableMethodWithAccess<DalvikBytecode>, string> = promiseCompose(
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
		code,
		_lines,
		_endMethod,
	]) => {
		const insSize = 1 + prototype.parameters.length;

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
					// return `${code.registersSize - insSize + index} (${'p' + index})` as any;
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

		return {
			accessFlags,
			method: {
				class: 'FILLED_LATER',
				prototype,
				name,
			},
			code,
		};
	},
);

setParserName(smaliMethodParser, 'smaliMethodParser');

type SmaliMethods = Pick<DalvikExecutableClassData<DalvikBytecode>, 'directMethods' | 'virtualMethods'>;

const smaliMethodsParser: Parser<SmaliMethods, string> = promiseCompose(
	createArrayParser<string[] | DalvikExecutableMethodWithAccess<DalvikBytecode>, string>(
		createDisjunctionParser<string[] | DalvikExecutableMethodWithAccess<DalvikBytecode>, string, string>([
			smaliMethodParser,
			smaliCommentsOrNewlinesParser,
		]),
	),
	(methodsAndComments) => {
		let type: 'directMethod' | 'virtualMethod' = 'directMethod';

		const directMethods: DalvikExecutableMethodWithAccess<DalvikBytecode>[] = [];
		const virtualMethods: DalvikExecutableMethodWithAccess<DalvikBytecode>[] = [];

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

			const method = methodOrComment as DalvikExecutableMethodWithAccess<DalvikBytecode>;

			if (type === 'directMethod') {
				directMethods.push(method);

				continue;
			}

			if (type === 'virtualMethod') {
				virtualMethods.push(method);

				continue;
			}

			invariant(false, 'Expected method type');
		}

		return {
			directMethods,
			virtualMethods,
		};
	}
);

setParserName(smaliMethodsParser, 'smaliMethodsParser');

export const smaliParser: Parser<DalvikExecutableClassDefinition<DalvikBytecode>, string> = promiseCompose(
	createTupleParser([
		smaliClassDeclarationParser,
		smaliSuperDeclarationParser,
		smaliSourceDeclarationParser,
		smaliCommentsOrNewlinesParser,
		createArrayParser(smaliInterfaceDeclarationParser),
		smaliCommentsOrNewlinesParser,
		createOptionalParser(smaliFieldsParser),
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
		_commentsOrNewlines0,
		interfaces,
		_commentsOrNewlines1,
		fields,
		methods,
	]) => ({
		accessFlags,
		class: class_,
		superclass,
		sourceFile,
		annotations: undefined, // TODO
		classData: {
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
		},
		interfaces,
		staticValues: [], // TODO
	}) as any, // TODO
);

setParserName(smaliParser, 'smaliParser');
