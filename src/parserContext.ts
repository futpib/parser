/* eslint-disable prefer-arrow-callback */

import { type ParserInputCompanion } from './parserInputCompanion.js';
import { type InputReader } from './inputReader.js';
import {
    normalParserErrorModule,
    noStackCaptureOverheadParserErrorModule,
    ParserParsingFailedError,
} from './parserError.js';
import { type RunParserOptions } from './parser.js';
import { type Falsy, customInvariant, type ValueOrAccessor } from './customInvariant.js';
import { parserImplementationInvariant } from './parserImplementationInvariant.js';
import { formatLazyMessage, isLazyMessageError, LazyMessage } from './lazyMessageError.js';

type LookaheadOptions = {
	debugName?: string;
	sliceEnd?: number;
};

type ParserContextOptions<Sequence, Element> =
	& RunParserOptions<unknown, Sequence, Element>
	& LookaheadOptions
	& {
		errorsModule: typeof normalParserErrorModule | typeof noStackCaptureOverheadParserErrorModule;
	}
;

export type ParserContext<Sequence, Element> = {
	from(elements: Element[]): Sequence;
	concat(sequences: Sequence[]): Sequence;
	length(sequence: Sequence): number;
	at(sequence: Sequence, index: number): Element | undefined;
	subsequence(sequence: Sequence, start: number, end: number): Sequence;
	indexOf(sequence: Sequence, element: Element, fromIndex?: number): number;
	indexOfSubsequence(sequence: Sequence, subsequence: Sequence, fromIndex?: number): number;
	equals(sequenceA: Sequence, sequenceB: Sequence): boolean;

	get position(): number;
	peek(offset: number): Promise<Element | undefined>;
	peekSequence(start: number, end: number): Promise<Sequence | undefined>;
	skip(offset: number): void;

	read(offset: number): Promise<Element>;
	readSequence(start: number, end: number): Promise<Sequence>;

	lookahead(options?: LookaheadOptions): ParserContext<Sequence, Element>;
	unlookahead(): void;
	dispose(): void;

	/**
	 * Executes a callback with a lookahead parser context.
	 * Ensures proper cleanup of the lookahead context via dispose() in a finally block.
	 *
	 * @param callback - Function that receives the lookahead context and returns a result
	 * @param options - Optional lookahead options (e.g., debugName)
	 * @returns The result from the callback
	 */
	withLookahead<T>(
		callback: (lookaheadContext: ParserContext<Sequence, Element>) => Promise<T> | T,
		options?: LookaheadOptions,
	): Promise<T>;

	invariant<T>(value: T, format: ValueOrAccessor<string | string[]>, ...formatArguments: unknown[]): Exclude<T, Falsy>;
	invariantJoin<T>(value: T, childErrors: ParserParsingFailedError[], format: ValueOrAccessor<string | string[]>, ...formatArguments: unknown[]): Exclude<T, Falsy>;
};

let parserContextId = 0;

export class ParserContextImplementation<Sequence, Element> implements ParserContext<Sequence, Element> {
	private readonly _id = parserContextId++;
	private readonly _depth: number;

	private _exclusiveChildParserContext: ParserContext<Sequence, Element> | undefined = undefined;

	constructor(
		private readonly _parserInputCompanion: ParserInputCompanion<Sequence, Element>,
		private _inputReader: InputReader<Sequence, Element>,
		private _parentParserContext: ParserContextImplementation<Sequence, Element> | undefined = undefined,
		private readonly _options: ParserContextOptions<Sequence, Element>,
	) {
		this._depth = _parentParserContext ? _parentParserContext._depth + 1 : 0;
	}

	get [Symbol.toStringTag]() {
		return [
			'ParserContext',
			[
				this._options.debugName,
				'(',
				this._id,
				')',
			].join(''),
			this._inputReader.toString(),
		].join(' ');
	}

	from(elements: Element[]): Sequence {
		return this._parserInputCompanion.from(elements);
	}

	concat(sequences: Sequence[]): Sequence {
		return this._parserInputCompanion.concat(sequences);
	}

	length(sequence: Sequence): number {
		return this._parserInputCompanion.length(sequence);
	}

	at(sequence: Sequence, index: number): Element | undefined {
		return this._parserInputCompanion.at(sequence, index);
	}

	subsequence(sequence: Sequence, start: number, end: number): Sequence {
		return this._parserInputCompanion.subsequence(sequence, start, end);
	}

	indexOf(sequence: Sequence, element: Element, fromIndex?: number): number {
		return this._parserInputCompanion.indexOf(sequence, element, fromIndex);
	}

	indexOfSubsequence(sequence: Sequence, subsequence: Sequence, fromIndex?: number): number {
		return this._parserInputCompanion.indexOfSubsequence(sequence, subsequence, fromIndex);
	}

	equals(sequenceA: Sequence, sequenceB: Sequence): boolean {
		return this._parserInputCompanion.equals(sequenceA, sequenceB);
	}

	get position() {
		return this._inputReader.position;
	}

	async peek(offset: number): Promise<Element | undefined> {
		if (
			this._options.sliceEnd !== undefined
			&& (this.position + offset) >= this._options.sliceEnd
		) {
			return undefined;
		}

		return this._inputReader.peek(offset);
	}

	async peekSequence(start: number, end: number): Promise<Sequence | undefined> {
		if (
			this._options.sliceEnd !== undefined
			&& (this.position + end - 1) >= this._options.sliceEnd
		) {
			return undefined;
		}

		parserImplementationInvariant(
			start >= 0,
			'start (%s) >= 0',
			start,
		);
		parserImplementationInvariant(
			end >= start,
			'end (%s) >= start (%s)',
			start,
			end,
		);
		parserImplementationInvariant(
			Number.isSafeInteger(start),
			'start (%d) is not a safe integer',
			start,
		);
		parserImplementationInvariant(
			Number.isSafeInteger(end),
			'end (%d) is not a safe integer',
			end,
		);

		return this._inputReader.peekSequence(start, end);
	}

	skip(offset: number) {
		this._inputReader.skip(offset);
	}

	async read(offset: number): Promise<Element> {
		const element = await this.peek(offset);

		if (element === undefined) {
			throw new this._options.errorsModule.ParserUnexpectedEndOfInputError('', this._depth, this.position);
		}

		this.skip(offset + 1);

		return element;
	}

	async readSequence(start: number, end: number): Promise<Sequence> {
		const sequence = await this.peekSequence(start, end);

		if (sequence === undefined) {
			throw new this._options.errorsModule.ParserUnexpectedEndOfInputError('', this._depth, this.position);
		}

		this.skip(end);

		return sequence;
	}

	lookahead(options: LookaheadOptions = {}): ParserContext<Sequence, Element> {
		const lookaheadInputReader = this._inputReader.lookahead();

		parserImplementationInvariant(
			this.position === lookaheadInputReader.position,
			'lookahead this.position (%s) === lookaheadInputReader.position (%s)',
			this.position,
			lookaheadInputReader.position,
		);

		const ParserContext = this._options.parserContextClass ?? ParserContextImplementation;

		const lookaheadParserContext = new ParserContext<Sequence, Element>(
			this._parserInputCompanion,
			lookaheadInputReader,
			this,
			{
				...this._options,
				...options,
				debugName: [
					this._options.debugName,
					'(',
					this._id,
					')',
					'/',
					options.debugName,
				].join(''),
			},
		);

		parserImplementationInvariant(
			this.position === lookaheadParserContext.position,
			'lookahead this.position (%s) === lookaheadParserContext.position (%s)',
			this.position,
			lookaheadParserContext.position,
		);

		return lookaheadParserContext;
	}

	unlookahead() {
		const parentParserContext = parserImplementationInvariant(
			this._parentParserContext,
			'this._parentParserContext !== undefined',
		);
		parserImplementationInvariant(
			(
				parentParserContext._exclusiveChildParserContext === undefined
				|| parentParserContext._exclusiveChildParserContext === this
			),
			[
				'Parent\'s exclusive child must be undefined or this',
				'this: %s',
				'parent: %s',
				'parent.exclusiveChild: %s',
			],
			() => this.toString(),
			() => parentParserContext.toString(),
			() => parentParserContext._exclusiveChildParserContext?.toString(),
		);
		parserImplementationInvariant(
			parentParserContext.position <= this.position,
			'unlookahead this._parentParserContext.position (%s) <= this.position (%s)',
			parentParserContext.position,
			this.position,
		);

		const offset = this._inputReader.position - parentParserContext._inputReader.position;

		parentParserContext.skip(offset);

		parserImplementationInvariant(
			parentParserContext.position === this.position,
			'unlookahead this._parentParserContext.position (%s) === this.position (%s)',
			parentParserContext.position,
			this.position,
		);

		this._inputReader = parentParserContext._inputReader;
		parentParserContext._exclusiveChildParserContext = this;

		if (this._exclusiveChildParserContext) {
			this._exclusiveChildParserContext.unlookahead();
		}
	}

	dispose() {
		const parentParserContext = parserImplementationInvariant(
			this._parentParserContext,
			'this._parentParserContext !== undefined',
		);
		parserImplementationInvariant(
			(
				parentParserContext._exclusiveChildParserContext === undefined
				|| parentParserContext._exclusiveChildParserContext === this
			),
			[
				'Parent\'s exclusive child must be undefined or this',
				'this: %s',
				'parent: %s',
				'parent.exclusiveChild: %s',
			],
			() => this.toString(),
			() => parentParserContext.toString(),
			() => parentParserContext._exclusiveChildParserContext?.toString(),
		);

		parentParserContext._exclusiveChildParserContext = undefined;
		this._parentParserContext = undefined;
	}

	async withLookahead<T>(
		callback: (lookaheadContext: ParserContext<Sequence, Element>) => Promise<T> | T,
		options?: LookaheadOptions,
	): Promise<T> {
		const lookaheadContext = this.lookahead(options);

		try {
			return await callback(lookaheadContext);
		} finally {
			lookaheadContext.dispose();
		}
	}

	invariant<T>(value: T, format: ValueOrAccessor<string | string[]>, ...formatArguments: unknown[]): Exclude<T, Falsy> {
		const parserContext = this;

		return customInvariant(function (lazyMessage: LazyMessage) {
			return new parserContext._options.errorsModule.ParserParsingInvariantError(lazyMessage, parserContext._depth, parserContext.position);
		}, value, format, ...formatArguments);
	}

	invariantJoin<T>(value: T, childErrors: ParserParsingFailedError[], format: ValueOrAccessor<string | string[]>, ...formatArguments: unknown[]): Exclude<T, Falsy> {
		parserImplementationInvariant(childErrors.length > 0, 'childErrors.length > 0');

		const errorJoinMode = this._options.errorJoinMode ?? 'none';
		const parserContext = this;

		if (errorJoinMode === 'none') {
			return customInvariant(function (lazyMessage: LazyMessage) {
				return new parserContext._options.errorsModule.ParserParsingJoinNoneError(lazyMessage, parserContext._depth, parserContext.position);
			}, value, format, ...formatArguments);
		}

		if (errorJoinMode === 'furthest') {
			return customInvariant(function (userLazyMessage: LazyMessage) {
				let furthestPosition = 0;
				let furthestChildErrors: ParserParsingFailedError[] = [];

				for (const childError of childErrors) {
					if (childError.position < furthestPosition) {
						continue;
					}

					if (childError.position > furthestPosition) {
						furthestPosition = childError.position;
						furthestChildErrors = [ childError ];
						continue;
					}

					furthestChildErrors.push(childError);
				}

				return new parserContext._options.errorsModule.ParserParsingJoinFurthestError([
					[
						'%s',
						'Furthest child error stacks, indented:',
						'%s',
						'End of furthest child error stacks',
					],
					() => formatLazyMessage(userLazyMessage),
					() => furthestChildErrors.flatMap(furthestChildError => {
						if (isLazyMessageError(furthestChildError)) {
							furthestChildError.computeMessage();
						}

						return furthestChildError.stack?.split('\n').map(line => '  ' + line);
					}).join('\n'),
				], parserContext._depth, furthestPosition, furthestChildErrors);
			}, value, format, ...formatArguments);
		}

		if (errorJoinMode === 'deepest') {
			return customInvariant(function (userLazyMessage: LazyMessage) {
				let deepestDepth = 0;
				let deepestChildErrors: ParserParsingFailedError[] = [];

				for (const childError of childErrors) {
					if (isLazyMessageError(childError)) {
						childError.computeMessage();
					}

					if (childError.depth < deepestDepth) {
						continue;
					}

					if (childError.depth > deepestDepth) {
						deepestDepth = childError.depth;
						deepestChildErrors = [ childError ];
						continue;
					}

					deepestChildErrors.push(childError);
				}

				return new parserContext._options.errorsModule.ParserParsingJoinDeepestError([
					[
						'%s',
						'Deepest child error stacks, indented:',
						'%s',
						'End of deepest child error stacks',
					],
					() => formatLazyMessage(userLazyMessage),
					() => deepestChildErrors.flatMap(deepestChildError => {
						if (isLazyMessageError(deepestChildError)) {
							deepestChildError.computeMessage();
						}

						return deepestChildError.stack?.split('\n').map(line => '  ' + line);
					}).join('\n'),
				], deepestDepth, parserContext.position, deepestChildErrors);
			}, value, format, ...formatArguments);
		}

		if (errorJoinMode === 'all') {
			return customInvariant(function (userLazyMessage: LazyMessage) {
				return new parserContext._options.errorsModule.ParserParsingJoinAllError([
					[
						'%s',
						'All child error stacks, indented:',
						'%s',
						'End of all child error stacks',
					],
					() => formatLazyMessage(userLazyMessage),
					() => childErrors.flatMap(childError => {
						if (isLazyMessageError(childError)) {
							childError.computeMessage();
						}

						return childError.stack?.split('\n').map(line => '  ' + line);
					}).join('\n'),
				], parserContext._depth, parserContext.position, childErrors);
			}, value, format, ...formatArguments);
		}

		return parserImplementationInvariant(false, 'Unsupported errorJoinMode: %s', errorJoinMode);
	}
}
