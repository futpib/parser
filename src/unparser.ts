import { DeriveSequenceElement } from "./sequence.js";
import { UnparserContext, UnparserContextImplementation } from "./unparserContext.js";
import { UnparserOutputCompanion } from "./unparserOutputCompanion.js";

export type Unparser<
	Input,
	Sequence,
	Element = DeriveSequenceElement<Sequence>,
> = (
	input: Input,
	unparserContext: UnparserContext<Sequence, Element>,
) => AsyncIterable<Sequence | Element>;

async function * onYield<T>(asyncIterable: AsyncIterable<T>, onYield: (value: T) => void): AsyncIterable<T> {
	for await (const value of asyncIterable) {
		onYield(value);
		yield value;
	}
}

async function * elementsToSequences<
	Sequence,
	Element,
>(
	elementsAndSequences: AsyncIterable<Element | Sequence>,
	unparserOutputCompanion: UnparserOutputCompanion<Sequence, Element>,
): AsyncIterable<Sequence> {
	let elements: Element[] = [];

	for await (const elementOrSequence of elementsAndSequences) {
		if (unparserOutputCompanion.is(elementOrSequence)) {
			if (unparserOutputCompanion.length(elementOrSequence) === 0) {
				continue;
			}

			if (elements.length > 0) {
				const sequence = unparserOutputCompanion.from(elements);
				yield sequence;
				elements = [];
			}

			yield elementOrSequence;
		} else {
			elements.push(elementOrSequence);
		}
	}

	if (elements.length > 0) {
		const sequence = unparserOutputCompanion.from(elements);
		yield sequence;
	}
}

export async function * runUnparser<
	Input,
	Sequence,
	Element = DeriveSequenceElement<Sequence>,
>(
	unparser: Unparser<Input, Sequence, Element>,
	input: Input,
	unparserOutputCompanion: UnparserOutputCompanion<Sequence, Element>,
): AsyncIterable<Sequence> {
	const unparserContext = new UnparserContextImplementation(unparserOutputCompanion);

	const elementsAndSequences = unparser(input, unparserContext);

	yield * (
		onYield(
			elementsToSequences(
				elementsAndSequences,
				unparserOutputCompanion,
			),
			elementOrSequence => unparserContext.handleYield(elementOrSequence),
		)
	);
}
