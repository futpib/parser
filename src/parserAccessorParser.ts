import { type Parser } from './parser.js';

export const createParserAccessorParser = <Output, Sequence>(parserAccessor: () => Parser<Output, Sequence>): Parser<Output, Sequence> => async parserContext => parserAccessor()(parserContext);
