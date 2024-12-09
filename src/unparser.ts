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

	let elements: Element[] = [];

	for await (const elementOrSequence of elementsAndSequences) {
		if (unparserOutputCompanion.is(elementOrSequence)) {
			if (unparserOutputCompanion.length(elementOrSequence) === 0) {
				continue;
			}

			if (elements.length > 0) {
				const sequence = unparserOutputCompanion.from(elements);
				unparserContext.handleYield(sequence);
				yield sequence;
				elements = [];
			}

			unparserContext.handleYield(elementOrSequence);
			yield elementOrSequence;
		} else {
			elements.push(elementOrSequence);
		}
	}

	if (elements.length > 0) {
		const sequence = unparserOutputCompanion.from(elements);
		unparserContext.handleYield(sequence);
		yield sequence;
	}
}
