import { type Unparser } from '../unparser.js';

async function* yieldAndCapture<T>(gen: AsyncIterable<T, T>): AsyncIterable<T, T> {
	let value: T | undefined;
	for await (value of gen) {
		yield value;
	}
	return value!;
}
import {
	type DalvikExecutableAccessFlags,
	type DalvikExecutableAnnotation,
	type DalvikExecutableClassAnnotations,
	type DalvikExecutableClassData,
	type DalvikExecutableClassDefinition,
	type DalvikExecutableCode,
	type DalvikExecutableDebugInfo,
	type DalvikExecutableEncodedValue,
	type DalvikExecutableField,
	type DalvikExecutableFieldWithAccess,
	type DalvikExecutableMethod,
	type DalvikExecutableMethodWithAccess,
	type DalvikExecutablePrototype,
	isDalvikExecutableField,
	isDalvikExecutableMethod,
} from '../dalvikExecutable.js';
import { type DalvikBytecode } from '../dalvikBytecodeParser.js';
import { dalvikBytecodeUnparser } from '../dalvikBytecodeUnparser.js';
import { ubyteUnparser, ushortUnparser, uintUnparser } from '../dalvikBytecodeUnparser/formatUnparsers.js';
import { type PoolBuilders } from './poolBuilders.js';
import { alignmentUnparser, encodeModifiedUtf8, mutf8Unparser, sleb128Unparser, uleb128p1Unparser, uleb128Unparser } from './utils.js';

export function createSectionUnparsers(poolBuilders: PoolBuilders) {
	const { stringPool, typePool, protoPool, fieldPool, methodPool } = poolBuilders;

	function getStringIndex(str: string | undefined): number {
		if (str === undefined) {
			throw new Error('String is undefined');
		}

		const index = stringPool.getIndex(str);
		if (index === undefined) {
			throw new Error(`String not found in pool: ${str}`);
		}

		return index;
	}

	function getTypeIndex(typeDescriptor: string | undefined): number {
		if (typeDescriptor === undefined) {
			throw new Error('Type descriptor is undefined');
		}

		const index = typePool.getIndex(typeDescriptor);
		if (index === undefined) {
			throw new Error(`Type not found in pool: ${typeDescriptor}`);
		}

		return index;
	}

	function getProtoIndex(proto: DalvikExecutablePrototype): number {
		const index = protoPool.getIndex(proto);
		if (index === undefined) {
			throw new Error(`Prototype not found in pool: ${JSON.stringify(proto)}`);
		}

		return index;
	}

	function getFieldIndex(field: DalvikExecutableField): number {
		const index = fieldPool.getIndex(field);
		if (index === undefined) {
			throw new Error(`Field not found in pool: ${JSON.stringify(field)}`);
		}

		return index;
	}

	function getMethodIndex(method: DalvikExecutableMethod): number {
		const index = methodPool.getIndex(method);
		if (index === undefined) {
			throw new Error(`Method not found in pool: ${JSON.stringify(method)}`);
		}

		return index;
	}

	const stringDataUnparser: Unparser<string, Uint8Array> = async function * (input, unparserContext) {
		const encoded = encodeModifiedUtf8(input);

		yield * uleb128Unparser(input.length, unparserContext);

		yield encoded;

		yield new Uint8Array([ 0 ]);
	};

	const typeListUnparser: Unparser<string[], Uint8Array> = async function * (input, unparserContext) {
		yield * uintUnparser(input.length, unparserContext);

		for (const type of input) {
			const typeIndex = getTypeIndex(type);
			yield * ushortUnparser(typeIndex, unparserContext);
		}
	};

	const protoDataUnparser: Unparser<DalvikExecutablePrototype, Uint8Array> = async function * (input, unparserContext) {
		const shortyIndex = getStringIndex(input.shorty);
		const returnTypeIndex = getTypeIndex(input.returnType);

		yield * uintUnparser(shortyIndex, unparserContext);
		yield * uintUnparser(returnTypeIndex, unparserContext);

		if (input.parameters.length > 0) {
			const parametersOffsetWriteLater = yield * yieldAndCapture(unparserContext.writeLater(4));
		} else {
			yield * uintUnparser(0, unparserContext);
		}
	};

	const fieldIdUnparser: Unparser<DalvikExecutableField, Uint8Array> = async function * (input, unparserContext) {
		const classIndex = getTypeIndex(input.class);
		const typeIndex = getTypeIndex(input.type);
		const nameIndex = getStringIndex(input.name);

		yield * ushortUnparser(classIndex, unparserContext);
		yield * ushortUnparser(typeIndex, unparserContext);
		yield * uintUnparser(nameIndex, unparserContext);
	};

	const methodIdUnparser: Unparser<DalvikExecutableMethod, Uint8Array> = async function * (input, unparserContext) {
		const classIndex = getTypeIndex(input.class);
		const protoIndex = getProtoIndex(input.prototype);
		const nameIndex = getStringIndex(input.name);

		yield * ushortUnparser(classIndex, unparserContext);
		yield * ushortUnparser(protoIndex, unparserContext);
		yield * uintUnparser(nameIndex, unparserContext);
	};

	function accessFlagsToNumber(accessFlags: DalvikExecutableAccessFlags): number {
		let flags = 0;

		if (accessFlags.public) flags |= 0x0001;
		if (accessFlags.private) flags |= 0x0002;
		if (accessFlags.protected) flags |= 0x0004;
		if (accessFlags.static) flags |= 0x0008;
		if (accessFlags.final) flags |= 0x0010;
		if (accessFlags.synchronized) flags |= 0x0020;
		if (accessFlags.volatile) flags |= 0x0040;
		if (accessFlags.bridge) flags |= 0x0040;
		if (accessFlags.transient) flags |= 0x0080;
		if (accessFlags.varargs) flags |= 0x0080;
		if (accessFlags.native) flags |= 0x0100;
		if (accessFlags.interface) flags |= 0x0200;
		if (accessFlags.abstract) flags |= 0x0400;
		if (accessFlags.strict) flags |= 0x0800;
		if (accessFlags.synthetic) flags |= 0x1000;
		if (accessFlags.annotation) flags |= 0x2000;
		if (accessFlags.enum) flags |= 0x4000;
		if (accessFlags.constructor) flags |= 0x10000;
		if (accessFlags.declaredSynchronized) flags |= 0x20000;

		return flags;
	}

	const encodedValueUnparser: Unparser<DalvikExecutableEncodedValue, Uint8Array> = async function * (input, unparserContext) {
		const { type, value } = input;

		// Handle null
		if (type === 'null') {
			yield new Uint8Array([ 0x1E ]);
			return;
		}

		// Handle boolean
		if (type === 'boolean') {
			yield new Uint8Array([ value ? 0x1F : 0x1E ]);
			return;
		}

		// Handle primitive numeric types
		if (type === 'byte') {
			const bytes = encodeSignedInt(value);
			yield new Uint8Array([ 0x00 | ((bytes.length - 1) << 5) ]);
			yield bytes;
			return;
		}

		if (type === 'short') {
			const bytes = encodeSignedInt(value);
			yield new Uint8Array([ 0x02 | ((bytes.length - 1) << 5) ]);
			yield bytes;
			return;
		}

		if (type === 'char') {
			const bytes = encodeUnsignedInt(value);
			yield new Uint8Array([ 0x03 | ((bytes.length - 1) << 5) ]);
			yield bytes;
			return;
		}

		if (type === 'int') {
			const bytes = encodeSignedInt(value);
			yield new Uint8Array([ 0x04 | ((bytes.length - 1) << 5) ]);
			yield bytes;
			return;
		}

		if (type === 'long') {
			const bytes = encodeSignedLong(value);
			yield new Uint8Array([ 0x06 | ((bytes.length - 1) << 5) ]);
			yield bytes;
			return;
		}

		if (type === 'float') {
			const bytes = encodeFloat(value);
			yield new Uint8Array([ 0x10 | ((bytes.length - 1) << 5) ]);
			yield bytes;
			return;
		}

		if (type === 'double') {
			const bytes = encodeDouble(value);
			yield new Uint8Array([ 0x11 | ((bytes.length - 1) << 5) ]);
			yield bytes;
			return;
		}

		// Handle method handle
		if (type === 'methodHandle') {
			const bytes = encodeValueArgument(value);
			yield new Uint8Array([ 0x16 | ((bytes.length - 1) << 5) ]);
			yield bytes;
			return;
		}

		// Handle types that reference the pool
		if (type === 'string') {
			const stringIndex = getStringIndex(value);
			const bytes = encodeValueArgument(stringIndex);
			yield new Uint8Array([ 0x17 | ((bytes.length - 1) << 5) ]);
			yield bytes;
			return;
		}

		if (type === 'type') {
			const typeIndex = getTypeIndex(value);
			const bytes = encodeValueArgument(typeIndex);
			yield new Uint8Array([ 0x18 | ((bytes.length - 1) << 5) ]);
			yield bytes;
			return;
		}

		if (type === 'field') {
			const fieldIndex = getFieldIndex(value);
			const bytes = encodeValueArgument(fieldIndex);
			yield new Uint8Array([ 0x19 | ((bytes.length - 1) << 5) ]);
			yield bytes;
			return;
		}

		if (type === 'method') {
			const methodIndex = getMethodIndex(value);
			const bytes = encodeValueArgument(methodIndex);
			yield new Uint8Array([ 0x1A | ((bytes.length - 1) << 5) ]);
			yield bytes;
			return;
		}

		if (type === 'enum') {
			const fieldIndex = getFieldIndex(value);
			const bytes = encodeValueArgument(fieldIndex);
			yield new Uint8Array([ 0x1B | ((bytes.length - 1) << 5) ]);
			yield bytes;
			return;
		}

		if (type === 'methodType') {
			const protoIndex = getProtoIndex(value);
			const bytes = encodeValueArgument(protoIndex);
			yield new Uint8Array([ 0x15 | ((bytes.length - 1) << 5) ]);
			yield bytes;
			return;
		}

		// Handle arrays
		if (type === 'array') {
			yield new Uint8Array([ 0x1C << 5 ]);
			yield * uleb128Unparser(value.length, unparserContext);

			for (const element of value) {
				yield * encodedValueUnparser(element, unparserContext);
			}
			return;
		}

		// Handle annotations
		if (type === 'annotation') {
			const typeIndex = getTypeIndex(value.type);
			yield new Uint8Array([ 0x1D << 5 ]);
			yield * uleb128Unparser(typeIndex, unparserContext);
			yield * uleb128Unparser(value.elements.length, unparserContext);

			for (const element of value.elements) {
				const nameIndex = getStringIndex(element.name);
				yield * uleb128Unparser(nameIndex, unparserContext);
				yield * encodedValueUnparser(element.value, unparserContext);
			}
			return;
		}
	};

	function encodeValueArgument(value: number): Uint8Array {
		if (value === 0) {
			return new Uint8Array([ 0 ]);
		}

		const bytes: number[] = [];
		let v = value;

		while (v !== 0) {
			bytes.push(v & 0xFF);
			v >>>= 8;
		}

		return new Uint8Array(bytes);
	}

	function encodeSignedInt(value: number): Uint8Array {
		const buffer = Buffer.alloc(4);
		buffer.writeInt32LE(value);

		let length = 4;
		const signByte = value < 0 ? 0xFF : 0x00;

		while (length > 1 && buffer[length - 1] === signByte) {
			if (length === 2) {
				break;
			}

			const prevByte = buffer[length - 2];
			const signBitMatches = value < 0 ? (prevByte & 0x80) !== 0 : (prevByte & 0x80) === 0;

			if (signBitMatches) {
				length--;
			} else {
				break;
			}
		}

		return buffer.subarray(0, length);
	}

	function encodeSignedLong(value: bigint): Uint8Array {
		const buffer = Buffer.alloc(8);
		buffer.writeBigInt64LE(value);

		let length = 8;
		const signByte = value < 0n ? 0xFF : 0x00;

		while (length > 1 && buffer[length - 1] === signByte) {
			if (length === 2) {
				break;
			}

			const prevByte = buffer[length - 2];
			const signBitMatches = value < 0n ? (prevByte & 0x80) !== 0 : (prevByte & 0x80) === 0;

			if (signBitMatches) {
				length--;
			} else {
				break;
			}
		}

		return buffer.subarray(0, length);
	}

	function encodeUnsignedInt(value: number): Uint8Array {
		const buffer = Buffer.alloc(4);
		buffer.writeUInt32LE(value);

		let length = 4;

		while (length > 1 && buffer[length - 1] === 0x00) {
			length--;
		}

		return buffer.subarray(0, length);
	}

	function encodeFloat(value: number): Uint8Array {
		const buffer = Buffer.alloc(4);
		buffer.writeFloatLE(value);

		let length = 4;

		// Remove trailing zero bytes, but keep at least one byte
		while (length > 1 && buffer[length - 1] === 0x00) {
			length--;
		}

		return buffer.subarray(0, length);
	}

	function encodeDouble(value: number): Uint8Array {
		const buffer = Buffer.alloc(8);
		buffer.writeDoubleLE(value);

		let length = 8;

		// Remove trailing zero bytes, but keep at least one byte
		while (length > 1 && buffer[length - 1] === 0x00) {
			length--;
		}

		return buffer.subarray(0, length);
	}

	const encodedArrayUnparser: Unparser<DalvikExecutableEncodedValue[], Uint8Array> = async function * (input, unparserContext) {
		yield * uleb128Unparser(input.length, unparserContext);

		for (const value of input) {
			yield * encodedValueUnparser(value, unparserContext);
		}
	};

	const debugInfoUnparser: Unparser<DalvikExecutableDebugInfo, Uint8Array> = async function * (input, unparserContext) {
		yield * uleb128Unparser(input.lineStart, unparserContext);

		yield * uleb128Unparser(input.parameterNames.length, unparserContext);

		for (const paramName of input.parameterNames) {
			if (paramName === undefined) {
				yield * uleb128p1Unparser(-1, unparserContext);
			} else {
				const nameIndex = getStringIndex(paramName);
				yield * uleb128p1Unparser(nameIndex, unparserContext);
			}
		}

		for (const bytecode of input.bytecode) {
			if (bytecode.type === 'advancePc') {
				yield * ubyteUnparser(0x01, unparserContext);
				yield * uleb128Unparser(bytecode.addressDiff, unparserContext);
			} else if (bytecode.type === 'advanceLine') {
				yield * ubyteUnparser(0x02, unparserContext);
				yield * sleb128Unparser(bytecode.lineDiff, unparserContext);
			} else if (bytecode.type === 'startLocal') {
				yield * ubyteUnparser(0x03, unparserContext);
				yield * uleb128Unparser(bytecode.registerNum, unparserContext);

				if (bytecode.name === undefined) {
					yield * uleb128p1Unparser(-1, unparserContext);
				} else {
					const nameIndex = getStringIndex(bytecode.name);
					yield * uleb128p1Unparser(nameIndex, unparserContext);
				}

				if (bytecode.type_ === undefined) {
					yield * uleb128p1Unparser(-1, unparserContext);
				} else {
					const typeIndex = getTypeIndex(bytecode.type_);
					yield * uleb128p1Unparser(typeIndex, unparserContext);
				}
			} else if (bytecode.type === 'startLocalExtended') {
				yield * ubyteUnparser(0x04, unparserContext);
				yield * uleb128Unparser(bytecode.registerNum, unparserContext);

				if (bytecode.name === undefined) {
					yield * uleb128p1Unparser(-1, unparserContext);
				} else {
					const nameIndex = getStringIndex(bytecode.name);
					yield * uleb128p1Unparser(nameIndex, unparserContext);
				}

				if (bytecode.type_ === undefined) {
					yield * uleb128p1Unparser(-1, unparserContext);
				} else {
					const typeIndex = getTypeIndex(bytecode.type_);
					yield * uleb128p1Unparser(typeIndex, unparserContext);
				}

				if (bytecode.signature === undefined) {
					yield * uleb128p1Unparser(-1, unparserContext);
				} else {
					const sigIndex = getStringIndex(bytecode.signature);
					yield * uleb128p1Unparser(sigIndex, unparserContext);
				}
			} else if (bytecode.type === 'endLocal') {
				yield * ubyteUnparser(0x05, unparserContext);
				yield * uleb128Unparser(bytecode.registerNum, unparserContext);
			} else if (bytecode.type === 'restartLocal') {
				yield * ubyteUnparser(0x06, unparserContext);
				yield * uleb128Unparser(bytecode.registerNum, unparserContext);
			} else if (bytecode.type === 'setPrologueEnd') {
				yield * ubyteUnparser(0x07, unparserContext);
			} else if (bytecode.type === 'setEpilogueBegin') {
				yield * ubyteUnparser(0x08, unparserContext);
			} else if (bytecode.type === 'setFile') {
				yield * ubyteUnparser(0x09, unparserContext);

				if (bytecode.name === undefined) {
					yield * uleb128p1Unparser(-1, unparserContext);
				} else {
					const nameIndex = getStringIndex(bytecode.name);
					yield * uleb128p1Unparser(nameIndex, unparserContext);
				}
			} else if (bytecode.type === 'special') {
				yield * ubyteUnparser(bytecode.value, unparserContext);
			}
		}

		yield * ubyteUnparser(0x00, unparserContext);
	};

	const codeItemUnparser = (callback?: (result: { debugInfoOffsetWriteLater?: any }) => void): Unparser<DalvikExecutableCode<DalvikBytecode>, Uint8Array> => {
		return async function * (input, unparserContext) {
			yield * ushortUnparser(input.registersSize, unparserContext);
			yield * ushortUnparser(input.insSize, unparserContext);
			yield * ushortUnparser(input.outsSize, unparserContext);

			yield * ushortUnparser(input.tries.length, unparserContext);

			let debugInfoOffsetWriteLater;
			if (input.debugInfo) {
				debugInfoOffsetWriteLater = yield * yieldAndCapture(unparserContext.writeLater(4));
			} else {
				yield * uintUnparser(0, unparserContext);
			}

			if (callback) {
				callback({ debugInfoOffsetWriteLater });
			}

			const instructionsSizeInShorts = await calculateInstructionsSize(input.instructions);
			yield * uintUnparser(instructionsSizeInShorts, unparserContext);

			yield * dalvikBytecodeUnparser(input.instructions, unparserContext);

			if (input.tries.length > 0 && instructionsSizeInShorts % 2 !== 0) {
				yield * ushortUnparser(0, unparserContext);
			}

			if (input.tries.length > 0) {
				const handlerOffsetWriteLaters: any[] = [];

				for (const tryBlock of input.tries) {
					yield * uintUnparser(tryBlock.startAddress, unparserContext);
					yield * ushortUnparser(tryBlock.instructionCount, unparserContext);
					const handlerOffsetWriteLater = yield * yieldAndCapture(unparserContext.writeLater(2));
					handlerOffsetWriteLaters.push(handlerOffsetWriteLater);
				}

				const handlersStartOffset = unparserContext.position;
				yield * uleb128Unparser(input.tries.length, unparserContext);

				for (let i = 0; i < input.tries.length; i++) {
					const tryBlock = input.tries[i];
					const handler = tryBlock.handler;

					const handlerOffset = unparserContext.position - handlersStartOffset;
					yield * unparserContext.writeEarlier(handlerOffsetWriteLaters[i], ushortUnparser, handlerOffset);

					if (handler.catchAllAddress !== undefined) {
						yield * sleb128Unparser(-handler.handlers.length, unparserContext);
					} else {
						yield * sleb128Unparser(handler.handlers.length, unparserContext);
					}

					for (const handlerItem of handler.handlers) {
						const typeIndex = getTypeIndex(handlerItem.type);
						yield * uleb128Unparser(typeIndex, unparserContext);
						yield * uleb128Unparser(handlerItem.address, unparserContext);
					}

					if (handler.catchAllAddress !== undefined) {
						yield * uleb128Unparser(handler.catchAllAddress, unparserContext);
					}
				}
			}
		};
	};

	async function calculateInstructionsSize(instructions: DalvikBytecode): Promise<number> {
		let totalSize = 0;

		for await (const chunk of dalvikBytecodeUnparser(instructions, { position: 0, writeLater: () => { throw new Error('Not supported'); }, writeEarlier: () => { throw new Error('Not supported'); } } as any)) {
			if (chunk instanceof Uint8Array) {
				totalSize += chunk.length;
			}
		}

		return Math.floor(totalSize / 2);
	}

	const classDataUnparser = (codeOffsetMap: Map<any, number>): Unparser<DalvikExecutableClassData<DalvikBytecode>, Uint8Array> => {
		return async function * (input, unparserContext) {
			yield * uleb128Unparser(input.staticFields.length, unparserContext);
			yield * uleb128Unparser(input.instanceFields.length, unparserContext);
			yield * uleb128Unparser(input.directMethods.length, unparserContext);
			yield * uleb128Unparser(input.virtualMethods.length, unparserContext);

			let prevFieldIndex = 0;
			for (const field of input.staticFields) {
				const fieldIndex = getFieldIndex(field.field);
				yield * uleb128Unparser(fieldIndex - prevFieldIndex, unparserContext);
				yield * uleb128Unparser(accessFlagsToNumber(field.accessFlags), unparserContext);
				prevFieldIndex = fieldIndex;
			}

			prevFieldIndex = 0;
			for (const field of input.instanceFields) {
				const fieldIndex = getFieldIndex(field.field);
				yield * uleb128Unparser(fieldIndex - prevFieldIndex, unparserContext);
				yield * uleb128Unparser(accessFlagsToNumber(field.accessFlags), unparserContext);
				prevFieldIndex = fieldIndex;
			}

			let prevMethodIndex = 0;
			for (const method of input.directMethods) {
				const methodIndex = getMethodIndex(method.method);
				yield * uleb128Unparser(methodIndex - prevMethodIndex, unparserContext);
				yield * uleb128Unparser(accessFlagsToNumber(method.accessFlags), unparserContext);

				const codeOffset = method.code ? codeOffsetMap.get(method.code) : 0;
				if (method.code && codeOffset === undefined) {
					throw new Error('Code offset not found in map');
				}
				yield * uleb128Unparser(codeOffset || 0, unparserContext);

				prevMethodIndex = methodIndex;
			}

			prevMethodIndex = 0;
			for (const method of input.virtualMethods) {
				const methodIndex = getMethodIndex(method.method);
				yield * uleb128Unparser(methodIndex - prevMethodIndex, unparserContext);
				yield * uleb128Unparser(accessFlagsToNumber(method.accessFlags), unparserContext);

				const codeOffset = method.code ? codeOffsetMap.get(method.code) : 0;
				if (method.code && codeOffset === undefined) {
					throw new Error('Code offset not found in map');
				}
				yield * uleb128Unparser(codeOffset || 0, unparserContext);

				prevMethodIndex = methodIndex;
			}
		};
	};

	return {
		stringDataUnparser,
		typeListUnparser,
		protoDataUnparser,
		fieldIdUnparser,
		methodIdUnparser,
		encodedValueUnparser,
		encodedArrayUnparser,
		debugInfoUnparser,
		codeItemUnparser,
		classDataUnparser,
		accessFlagsToNumber,
		getStringIndex,
		getTypeIndex,
		getProtoIndex,
		getFieldIndex,
		getMethodIndex,
	};
}
