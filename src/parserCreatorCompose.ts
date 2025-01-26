import { type Parser } from './parser.js';
import { type DeriveSequenceElement } from './sequence.js';

export function parserCreatorCompose<
	Arguments extends unknown[],
	OutputA,
	OutputB,
	Sequence,
	Element = DeriveSequenceElement<Sequence>,
>(
	f1: (...arguments_: Arguments) => Parser<OutputA, Sequence, Element>,
	f2: (outputA: OutputA) => Parser<OutputB, Sequence, Element>,
): (...arguments_: Arguments) => Parser<OutputB, Sequence, Element> {
	const parserCreatorComposedOuter: (...arguments_: Arguments) => Parser<OutputB, Sequence, Element> = (...arguments_) => {
		const parserA = f1(...arguments_);

		const parserCreatorComposedInner: Parser<OutputB, Sequence, Element> = async parserContext => {
			const outputA = await parserA(parserContext);
			const parserB = f2(outputA);
			return parserB(parserContext);
		};

		return parserCreatorComposedInner;
	};

	return parserCreatorComposedOuter;
}
