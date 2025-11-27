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
					// Get the full sequence we've accumulated to verify matches
					const fullSequence = await parserContext.peekSequence(0, start);

					// Verify any previous match is still valid with full context
					// For lookahead/lookbehind assertions, additional input might invalidate a match
					if (fullSequence !== undefined) {
						const verifyMatch = regexp.exec(fullSequence);
						if (verifyMatch !== null && verifyMatch.index === 0) {
							parserContext.skip(verifyMatch[0].length);
							return verifyMatch;
						}
					} else if (lastMatch !== undefined) {
						// No full sequence available but we have a previous match
						parserContext.skip(lastMatch[0].length);
						return lastMatch;
					}

					// No previous match - try matching against empty string for zero-width patterns (e.g., /a*/, /[ \t]*/)
					const emptyMatch = regexp.exec('');
					if (emptyMatch !== null && emptyMatch.index === 0) {
						return emptyMatch;
					}

					return parserContext.invariant(false, 'Unexpected end of input without regex match');
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
					// Verify lastMatch is still valid with current full context
					// For lookahead/lookbehind assertions, a match on shorter input might be
					// invalidated by additional input (e.g., /\|(?!\|)/ matches '|' but not '||')
					const verifyMatch = regexp.exec(fullSequence);
					if (verifyMatch !== null && verifyMatch.index === 0) {
						parserContext.skip(verifyMatch[0].length);
						return verifyMatch;
					}
					// lastMatch was invalidated by additional context
					lastMatch = undefined;
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
