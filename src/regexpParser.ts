import { type Parser, setParserName } from './parser.js';

export const createRegExpParser = (
	regexp: RegExp,
): Parser<RegExpExecArray, string, string> => {
	const regexpParser: Parser<RegExpExecArray, string, string> = async parserContext => {
		let start = 0;
		let window = 1;
		let lastMatch: RegExpExecArray | undefined;
		let reachedEndOfInput = false;

		while (true) {
			const sequence = await parserContext.peekSequence(start, start + window);

			if (sequence === undefined) {
				reachedEndOfInput = true;
				window = Math.floor(window / 2);

				if (window === 0) {
					// Try matching against empty string for zero-width patterns (e.g., /a*/, /[ \t]*/)
					const emptyMatch = regexp.exec('');
					if (emptyMatch !== null && emptyMatch.index === 0) {
						return emptyMatch;
					}

					const match = parserContext.invariant(lastMatch, 'Unexpected end of input without regex match');

					parserContext.skip(match[0].length);

					return match;
				}

				continue;
			}

			const fullSequence = await parserContext.peekSequence(0, start + window);

			if (fullSequence === undefined) {
				continue;
			}

			const match = regexp.exec(fullSequence);

			if (match === null || match.index !== 0) {
				if (lastMatch !== undefined) {
					parserContext.skip(lastMatch[0].length);

					return lastMatch;
				}

				if (reachedEndOfInput) {
					parserContext.invariant(
						false,
						'Regex did not match at start of input',
					);
				}

				start += window;
				window *= 2;

				continue;
			}

			lastMatch = match;

			start += window;
			window *= 2;
		}
	};

	setParserName(regexpParser, regexp.toString());

	return regexpParser;
};
