import invariant from "invariant";
import { Parser } from "./parser.js";

export const createFixedLengthChunkParser = <InputChunk>(length: number): Parser<InputChunk, InputChunk, unknown> => {
	invariant(length > 0, "Length must be positive.");

	return async (parserContext) => {
		const elements = [];

		for (let i = 0; i < length; i++) {
			const element = await parserContext.peek(i);

			invariant(element !== undefined, "Unexpected end of input.");

			elements.push(element);
		}

		parserContext.skip(length);

		return parserContext.from(elements);
	};
};
