import { Parser } from "./parser.js";
import { DeriveSequenceElement } from "./sequence.js";

export const createElementParser = <Sequence, Element = DeriveSequenceElement<Sequence>>(): Parser<Element, Sequence, Element> => parserContext => parserContext.read(0);
