import { type Unparser } from './unparser.js';

export const createArrayUnparser = <ElementInput, Sequence>(
	elementUnparser: Unparser<ElementInput, Sequence>,
): Unparser<ElementInput[], Sequence> => {
	const arrayUnparser: Unparser<ElementInput[], Sequence> = async function * (input, unparserContext) {
		for (const element of input) {
			yield * elementUnparser(element, unparserContext);
		}
	};

	return arrayUnparser;
};
