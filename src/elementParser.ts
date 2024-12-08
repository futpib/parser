import { type Parser } from './parser.js';
import { type DeriveSequenceElement } from './sequence.js';

export const createElementParser = <Sequence, Element = DeriveSequenceElement<Sequence>>(): Parser<Element, Sequence, Element> => async parserContext => parserContext.read(0);
