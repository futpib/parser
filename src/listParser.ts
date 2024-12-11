import { createNegativeLookaheadParser } from './negativeLookaheadParser.js';
import { type Parser } from './parser.js';
import { createParserAccessorParser } from './parserAccessorParser.js';
import { promiseCompose } from './promiseCompose.js';
import { createTupleParser } from './tupleParser.js';
import { createUnionParser } from './unionParser.js';

class Nil {}
class Cons<Head, Tail> {
	constructor(
		public readonly head: Head,
		public readonly tail: Tail,
	) {}
}

export const createListParser = <ElementOutput, Sequence>(
	elementParser: Parser<ElementOutput, Sequence>,
): Parser<ElementOutput[], Sequence> => {
	type List = Nil | Cons<ElementOutput, List>;

	const consParser = promiseCompose(
		createTupleParser([
			elementParser,
			createParserAccessorParser(() => listParser),
		]),
		([ head, tail ]) => new Cons(head, tail),
	);

	const nilParser = promiseCompose(
		createNegativeLookaheadParser(elementParser),
		() => new Nil(),
	);

	const listParser: Parser<List, Sequence> = createUnionParser([
		consParser,
		nilParser,
	]);

	return promiseCompose(
		listParser,
		list => {
			const array: ElementOutput[] = [];

			while (list instanceof Cons) {
				array.push(list.head);
				list = list.tail;
			}

			return array;
		},
	);
};
