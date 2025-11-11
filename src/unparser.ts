import invariant from 'invariant';
import { type DeriveSequenceElement } from './sequence.js';
import {
	type UnparserContext, UnparserContextImplementation, WriteEarlier, WriteLater,
} from './unparserContext.js';
import { type UnparserOutputCompanion } from './unparserOutputCompanion.js';
import { unparserImplementationInvariant } from './unparserImplementationInvariant.js';

type UnparserIterableValue<Sequence, Element> =
	| Sequence
	| Element
	| WriteLater<Sequence, Element>
	| WriteEarlier<Sequence, Element>
;

type UnparserIterableValue_<Sequence, Element> =
	| Sequence
	| WriteLater<Sequence, Element>
	| WriteEarlier<Sequence, Element>
;

export type UnparserResult<Sequence, Element> = AsyncIterable<UnparserIterableValue<Sequence, Element>>;

type UnparserResult_<Sequence, Element> = AsyncIterable<UnparserIterableValue_<Sequence, Element>>;

export type Unparser<
	Input,
	Sequence,
	Element = DeriveSequenceElement<Sequence>,
> = (
	input: Input,
	unparserContext: UnparserContext<Sequence, Element>,
) => UnparserResult<Sequence, Element>;

async function * onYield<T>(asyncIterable: AsyncIterable<T>, onYield: (value: T) => void): AsyncIterable<T> {
	for await (const value of asyncIterable) {
		onYield(value);
		yield value;
	}
}

async function * elementsToSequences<
	Sequence,
	Element,
>(
	values: UnparserResult<Sequence, Element>,
	unparserOutputCompanion: UnparserOutputCompanion<Sequence, Element>,
): UnparserResult_<Sequence, Element> {
	let elements: Element[] = [];

	for await (const value of values) {
		if (
			value instanceof WriteLater
			|| value instanceof WriteEarlier
		) {
			if (elements.length > 0) {
				const sequence = unparserOutputCompanion.from(elements);
				yield sequence;
				elements = [];
			}

			yield value;
		} else if (unparserOutputCompanion.is(value)) {
			if (unparserOutputCompanion.length(value) === 0) {
				continue;
			}

			if (elements.length > 0) {
				const sequence = unparserOutputCompanion.from(elements);
				yield sequence;
				elements = [];
			}

			yield value;
		} else {
			elements.push(value);
		}
	}

	if (elements.length > 0) {
		const sequence = unparserOutputCompanion.from(elements);
		yield sequence;
	}
}

function wrapUnparserResult<Sequence, Element>(
	unparserResult: UnparserResult<Sequence, Element>,
	unparserContext: UnparserContextImplementation<Sequence, Element>,
	unparserOutputCompanion: UnparserOutputCompanion<Sequence, Element>,
): UnparserResult_<Sequence, Element> {
	return onYield(
		elementsToSequences(
			unparserResult,
			unparserOutputCompanion,
		),
		value => {
			unparserContext.handleYield(value);
		},
	);
}

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

	const values = unparser(input, unparserContext);
	const valuesWithoutElements = wrapUnparserResult(
		values,
		unparserContext,
		unparserOutputCompanion,
	);

	const outputQueue: Array<WriteLater<Sequence, Element> | Sequence> = [];

	type Iterator = AsyncIterator<UnparserIterableValue_<Sequence, Element>, void>;
	type PushOutput = (value: Sequence | WriteLater<Sequence, Element>) => void;
	type FinishOutput = () => void;

	const iteratorStack: Array<[ Iterator, PushOutput, FinishOutput ]> = [
		[
			valuesWithoutElements[Symbol.asyncIterator](),
			value => outputQueue.push(value),
			() => {},
		],
	];

	while (true) {
		while (
			outputQueue.length > 0
			&& !(outputQueue[0] instanceof WriteLater)
		) {
			yield outputQueue.shift() as Sequence;
		}

		if (iteratorStack.length === 0) {
			break;
		}

		const [ iterator, pushOutput, finishOutput ] = iteratorStack[0];

		const iteratorResult = await iterator.next();

		if (iteratorResult.done) {
			finishOutput();
			iteratorStack.shift();
			continue;
		}

		const { value } = iteratorResult;

		if (value instanceof WriteEarlier) {
			const { writeLater, unparserResult, unparserContext } = value;

			invariant(
				unparserContext instanceof UnparserContextImplementation,
				'UnparserContext not an instance of UnparserContextImplementation.',
			);

			function getOutputQueueWriteLaterIndex() {
				const outputQueueWriteLaterIndex = outputQueue.indexOf(writeLater);

				unparserImplementationInvariant(
					outputQueueWriteLaterIndex !== -1,
					[
						'WriteLater has already been written or was not yielded yet.',
						'WriteLater stack: %s',
						'End of WriteLater stack.',
					],
					writeLater.stack,
				);

				return outputQueueWriteLaterIndex;
			}

			const unparserResultWithoutElements = wrapUnparserResult(
				unparserResult,
				unparserContext,
				unparserOutputCompanion,
			);

			const newPushOutput: PushOutput = value => {
				const outputQueueWriteLaterIndex = getOutputQueueWriteLaterIndex();
				outputQueue.splice(outputQueueWriteLaterIndex, 0, value);
			};

			const newFinishOutput: FinishOutput = () => {
				const outputQueueWriteLaterIndex = getOutputQueueWriteLaterIndex();
				const [ removedValue ] = outputQueue.splice(outputQueueWriteLaterIndex, 1);
				invariant(
					removedValue === writeLater,
					'WriteLater was not removed from the output queue.',
				);
			};

			iteratorStack.unshift([
				unparserResultWithoutElements[Symbol.asyncIterator](),
				newPushOutput,
				newFinishOutput,
			]);

			continue;
		}

		pushOutput(value);
	}
}
