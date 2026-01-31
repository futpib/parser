import { generate } from 'astring';
import { type Unparser } from './unparser.js';
import { type JavaScriptProgram } from './javaScriptParser.js';

export const javaScriptProgramUnparser: Unparser<JavaScriptProgram, string> = async function * (program) {
	yield generate(program);
};
