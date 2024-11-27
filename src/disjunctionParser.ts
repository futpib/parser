import { type Parser } from './parser.js';
import { ParserParsingFailedError } from './parserError.js';
import { parserImplementationInvariant } from './parserImplementationInvariant.js';
import { parserParsingInvariant } from './parserParsingInvariant.js';

function getParserName(parser: Parser<any, any, any>): string {
	return parser.name || 'anonymousDisjunctionChild';
}

export const createDisjunctionParser = <
	Output,
	Sequence,
>(
	childParsers: Parser<any, Sequence, any>[],
): Parser<Output, Sequence, unknown> => {
	parserImplementationInvariant(childParsers.length > 0, 'Disjunction parser must have at least one child parser.');

	const disjunctionParser: Parser<Output, Sequence, unknown> = async parserContext => {
		const parserParsingFailedErrors: ParserParsingFailedError[] = [];

		for (const childParser of childParsers) {
			const childParserContext = parserContext.lookahead(getParserName(childParser));

			const [ childParserResult ] = await Promise.allSettled([ childParser(childParserContext) ]);

			if (childParserResult.status === 'fulfilled') {
				const successfulParserOutput = childParserResult.value;

				childParserContext.unlookahead();
				childParserContext.dispose();

				return successfulParserOutput;
			} else {
				const error = childParserResult.reason;

				if (error instanceof ParserParsingFailedError) {
					parserParsingFailedErrors.push(error);
				} else {
					throw error;
				}
			}
		}

		parserParsingInvariant(
			false,
			[
				'No disjunction child parser succeeded.',
				'Parsing errors, indented, separated by newlines:',
				'%s',
				'End of parsing errors.',
			],
			// @ts-expect-error
			() => 'too slow' || parserParsingFailedErrors
				.flatMap(error => error.stack?.split('\n'))
				.map(line => '  ' + line)
				.join('\n'),
		);
	};

	const name = [
		'(',
		...childParsers.map(getParserName).join('|'),
		')',
	].join('');

	Object.defineProperty(disjunctionParser, 'name', { value: name });

	return disjunctionParser;
};
