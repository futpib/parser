/* eslint-disable prefer-arrow-callback */

import invariant from 'invariant';
import { type ParserInputCompanion } from './parserInputCompanion.js';
import { type InputReader } from './inputReader.js';
import {
	type ParserParsingFailedError, ParserUnexpectedEndOfInputError, ParserParsingInvariantError, ParserParsingJoinNoneError, ParserParsingJoinAllError, ParserParsingJoinDeepestError, ParserParsingJoinFurthestError,
} from './parserError.js';
import { type RunParserOptions } from './parser.js';
import { type Falsy, customInvariant, type ValueOrAccessor } from './customInvariant.js';

type LookaheadOptions = {
	debugName?: string;
	sliceEnd?: number;
};

type ParserContextOptions<Sequence, Element> =
	& RunParserOptions<unknown, Sequence, Element>
	& LookaheadOptions
;

export type ParserContext<Sequence, Element> = {
	from(elements: Element[]): Sequence;
	length(sequence: Sequence): number;
	at(sequence: Sequence, index: number): Element | undefined;

	get position(): number;
	peek(offset: number): Promise<Element | undefined>;
	skip(offset: number): void;

	read(offset: number): Promise<Element>;

	lookahead(options?: LookaheadOptions): ParserContext<Sequence, Element>;
	unlookahead(): void;
	dispose(): void;

	invariant<T>(value: T, format: ValueOrAccessor<string | string[]>, ...formatArguments: any[]): Exclude<T, Falsy>;
	invariantJoin<T>(value: T, childErrors: ParserParsingFailedError[], format: ValueOrAccessor<string | string[]>, ...formatArguments: any[]): Exclude<T, Falsy>;
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

	length(sequence: Sequence): number {
		return this._parserInputCompanion.length(sequence);
	}

	at(sequence: Sequence, index: number): Element | undefined {
		return this._parserInputCompanion.at(sequence, index);
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

	skip(offset: number) {
		this._inputReader.skip(offset);
	}

	async read(offset: number): Promise<Element> {
		const element = await this.peek(offset);

		if (element === undefined) {
			throw new ParserUnexpectedEndOfInputError('', this._depth, this.position);
		}

		this.skip(offset + 1);

		return element;
	}

	lookahead(options: LookaheadOptions = {}): ParserContext<Sequence, Element> {
		const lookaheadInputReader = this._inputReader.lookahead();

		if (this.position !== lookaheadInputReader.position) {
			debugger;
		}

		invariant(
			this.position === lookaheadInputReader.position,
			'lookahead this.position (%s) === lookaheadInputReader.position (%s)',
			this.position,
			lookaheadInputReader.position,
		);

		const lookaheadParserContext = new ParserContextImplementation(
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

		if (this.position !== lookaheadParserContext.position) {
			debugger;
		}

		invariant(
			this.position === lookaheadParserContext.position,
			'lookahead this.position (%s) === lookaheadParserContext.position (%s)',
			this.position,
			lookaheadParserContext.position,
		);

		return lookaheadParserContext;
	}

	unlookahead() {
		invariant(this._parentParserContext !== undefined, 'this._parentParserContext !== undefined');
		invariant(
			(
				this._parentParserContext._exclusiveChildParserContext === undefined
				|| this._parentParserContext._exclusiveChildParserContext === this
			),
			[
				'Parent\'s exclusive child must be undefined or this',
				'this: %s',
				'parent: %s',
				'parent.exclusiveChild: %s',
			].join('\n'),
			this.toString(),
			this._parentParserContext.toString(),
			this._parentParserContext._exclusiveChildParserContext?.toString(),
		);
		invariant(
			this._parentParserContext.position <= this.position,
			'unlookahead this._parentParserContext.position (%s) <= this.position (%s)',
			this._parentParserContext.position,
			this.position,
		);

		const offset = this._inputReader.position - this._parentParserContext._inputReader.position;

		this._parentParserContext.skip(offset);

		invariant(
			this._parentParserContext.position === this.position,
			'unlookahead this._parentParserContext.position (%s) === this.position (%s)',
			this._parentParserContext.position,
			this.position,
		);

		this._inputReader = this._parentParserContext._inputReader;
		this._parentParserContext._exclusiveChildParserContext = this;

		if (this._exclusiveChildParserContext) {
			this._exclusiveChildParserContext.unlookahead();
		}
	}

	dispose() {
		invariant(this._parentParserContext !== undefined, 'this._parentParserContext !== undefined');
		invariant(
			(
				this._parentParserContext._exclusiveChildParserContext === undefined
				|| this._parentParserContext._exclusiveChildParserContext === this
			),
			[
				'Parent\'s exclusive child must be undefined or this',
				'this: %s',
				'parent: %s',
				'parent.exclusiveChild: %s',
			].join('\n'),
			this.toString(),
			this._parentParserContext.toString(),
			this._parentParserContext._exclusiveChildParserContext?.toString(),
		);

		this._parentParserContext._exclusiveChildParserContext = undefined;
		this._parentParserContext = undefined;
	}

	invariant<T>(value: T, format: ValueOrAccessor<string | string[]>, ...formatArguments: any[]): Exclude<T, Falsy> {
		const parserContext = this;

		return customInvariant(function (message: string) {
			return new ParserParsingInvariantError(message, parserContext._depth, parserContext.position);
		}, value, format, ...formatArguments);
	}

	invariantJoin<T>(value: T, childErrors: ParserParsingFailedError[], format: ValueOrAccessor<string | string[]>, ...formatArguments: any[]): Exclude<T, Falsy> {
		invariant(childErrors.length > 0, 'childErrors.length > 0');

		const errorJoinMode = this._options.errorJoinMode ?? 'none';
		const parserContext = this;

		if (errorJoinMode === 'none') {
			return customInvariant(function (message: string) {
				return new ParserParsingJoinNoneError(message, parserContext._depth, parserContext.position);
			}, value, format, ...formatArguments);
		}

		if (errorJoinMode === 'furthest') {
			return customInvariant(function (message: string) {
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

				message += [
					'',
					'Furthest child error stacks, indented:',
					...furthestChildErrors.flatMap(furthestChildError => furthestChildError.stack?.split('\n').map(line => '  ' + line)),
					'End of furthest child error stacks',
				].join('\n');

				return new ParserParsingJoinFurthestError(message, parserContext._depth, furthestPosition, furthestChildErrors);
			}, value, format, ...formatArguments);
		}

		if (errorJoinMode === 'deepest') {
			return customInvariant(function (message: string) {
				let deepestDepth = 0;
				let deepestChildErrors: ParserParsingFailedError[] = [];

				for (const childError of childErrors) {
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

				message += [
					'',
					'Deepest child error stacks, indented:',
					...deepestChildErrors.flatMap(deepestChildError => deepestChildError.stack?.split('\n').map(line => '  ' + line)),
					'End of deepest child error stacks',
				].join('\n');

				return new ParserParsingJoinDeepestError(message, deepestDepth, parserContext.position, deepestChildErrors);
			}, value, format, ...formatArguments);
		}

		if (errorJoinMode === 'all') {
			return customInvariant(function (message: string) {
				message += [
					'',
					'Child error stacks, indented:',
					...childErrors.flatMap(childError => childError.stack?.split('\n').map(line => '  ' + line)),
					'End of child error stacks',
				].join('\n');

				return new ParserParsingJoinAllError(message, parserContext._depth, parserContext.position, childErrors);
			}, value, format, ...formatArguments);
		}

		invariant(false, 'Unsupported errorJoinMode: %s', errorJoinMode);
	}
}
