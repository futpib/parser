import { type Unparser } from './unparser.js';

export const createSequenceUnparser = <Sequence>(): Unparser<Sequence, Sequence> => {
	const sequenceUnparser: Unparser<Sequence, Sequence> = async function * (input) {
		yield input;
	};

	return sequenceUnparser;
};
