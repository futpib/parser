import { Parser } from "./parser.js";
import { DeriveSequenceElement } from "./sequence.js";

export function parserCreatorCompose<
	Arguments extends unknown[],
	OutputA,
	OutputB,
	Sequence,
	Element = DeriveSequenceElement<Sequence>,
>(
	f1: (...args: Arguments) => Parser<OutputA, Sequence, Element>,
	f2: (outputA: OutputA) => Parser<OutputB, Sequence, Element>,
): (...args: Arguments) => Parser<OutputB, Sequence, Element> {
	return (...args) => {
		const parserA = f1(...args);

		return async parserContext => {
			const outputA = await parserA(parserContext);
			const parserB = f2(outputA);
			return parserB(parserContext);
		};
	};
}
