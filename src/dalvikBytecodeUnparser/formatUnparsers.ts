import { type Unparser } from '../unparser.js';

// Basic type unparsers
export const ubyteUnparser: Unparser<number, Uint8Array> = async function * (input) {
	const buffer = Buffer.alloc(1);
	buffer.writeUInt8(input);
	yield buffer;
};

export const byteUnparser: Unparser<number, Uint8Array> = async function * (input) {
	const buffer = Buffer.alloc(1);
	buffer.writeInt8(input);
	yield buffer;
};

export const shortUnparser: Unparser<number, Uint8Array> = async function * (input) {
	const buffer = Buffer.alloc(2);
	buffer.writeInt16LE(input);
	yield buffer;
};

export const ushortUnparser: Unparser<number, Uint8Array> = async function * (input) {
	const buffer = Buffer.alloc(2);
	buffer.writeUInt16LE(input);
	yield buffer;
};

export const intUnparser: Unparser<number, Uint8Array> = async function * (input) {
	const buffer = Buffer.alloc(4);
	buffer.writeInt32LE(input);
	yield buffer;
};

export const uintUnparser: Unparser<number, Uint8Array> = async function * (input) {
	const buffer = Buffer.alloc(4);
	buffer.writeUInt32LE(input);
	yield buffer;
};

export const longUnparser: Unparser<bigint, Uint8Array> = async function * (input) {
	const buffer = Buffer.alloc(8);
	buffer.writeBigInt64LE(input);
	yield buffer;
};

export const ulongUnparser: Unparser<bigint, Uint8Array> = async function * (input) {
	const buffer = Buffer.alloc(8);
	buffer.writeBigUInt64LE(input);
	yield buffer;
};

// Nibbles unparser (two 4-bit values in one byte)
export const nibblesUnparser: Unparser<[ number, number ], Uint8Array> = async function * ([ high, low ], unparserContext) {
	const byte = (high << 4) | (low & 0b1111);
	yield * ubyteUnparser(byte, unparserContext);
};

// Format 10t: branchOffset (1 byte signed)
type DalvikBytecodeFormat10t = {
	branchOffset: number;
};

export const dalvikBytecodeFormat10tUnparser: Unparser<DalvikBytecodeFormat10t, Uint8Array> = async function * (input, unparserContext) {
	yield * byteUnparser(input.branchOffset, unparserContext);
};

// Format 10x: no data
type DalvikBytecodeFormat10x = void;

export const dalvikBytecodeFormat10xUnparser: Unparser<DalvikBytecodeFormat10x, Uint8Array> = async function * (_input, unparserContext) {
	yield * ubyteUnparser(0, unparserContext); // Zero byte
};

// Format 11x: single register (1 byte)
type DalvikBytecodeFormat11x = {
	registers: number[];
};

export const dalvikBytecodeFormat11xUnparser: Unparser<DalvikBytecodeFormat11x, Uint8Array> = async function * (input, unparserContext) {
	yield * ubyteUnparser(input.registers[0], unparserContext);
};

// Format 11n: value (4-bit signed) + register (4-bit)
type DalvikBytecodeFormat11n = {
	value: number;
	registers: number[];
};

export const dalvikBytecodeFormat11nUnparser: Unparser<DalvikBytecodeFormat11n, Uint8Array> = async function * (input, unparserContext) {
	yield * nibblesUnparser([ input.value & 0b1111, input.registers[0] ], unparserContext);
};

// Format 12x: two registers in nibbles
type DalvikBytecodeFormat12x = {
	registers: number[];
};

export const dalvikBytecodeFormat12xUnparser: Unparser<DalvikBytecodeFormat12x, Uint8Array> = async function * (input, unparserContext) {
	yield * nibblesUnparser([ input.registers[0], input.registers[1] ], unparserContext);
};

// Format 20t: zero byte + branchOffset (2 bytes signed)
type DalvikBytecodeFormat20t = {
	branchOffset: number;
};

export const dalvikBytecodeFormat20tUnparser: Unparser<DalvikBytecodeFormat20t, Uint8Array> = async function * (input, unparserContext) {
	yield * ubyteUnparser(0, unparserContext);
	yield * shortUnparser(input.branchOffset, unparserContext);
};

// Format 21c: register + index (2 bytes)
type DalvikBytecodeFormat21c = {
	index: number;
	registers: number[];
};

export const dalvikBytecodeFormat21cUnparser: Unparser<DalvikBytecodeFormat21c, Uint8Array> = async function * (input, unparserContext) {
	yield * ubyteUnparser(input.registers[0], unparserContext);
	yield * ushortUnparser(input.index, unparserContext);
};

// Format 21h: register + value (2 bytes high bits)
type DalvikBytecodeFormat21h = {
	value: number;
	registers: number[];
};

export const dalvikBytecodeFormat21hUnparser: Unparser<DalvikBytecodeFormat21h, Uint8Array> = async function * (input, unparserContext) {
	yield * ubyteUnparser(input.registers[0], unparserContext);
	yield * ushortUnparser(input.value, unparserContext);
};

// Format 21t: register + branchOffset (2 bytes signed)
type DalvikBytecodeFormat21t = {
	branchOffset: number;
	registers: number[];
};

export const dalvikBytecodeFormat21tUnparser: Unparser<DalvikBytecodeFormat21t, Uint8Array> = async function * (input, unparserContext) {
	yield * ubyteUnparser(input.registers[0], unparserContext);
	yield * shortUnparser(input.branchOffset, unparserContext);
};

// Format 21s: register + value (2 bytes signed)
type DalvikBytecodeFormat21s = {
	registers: number[];
	value: number;
};

export const dalvikBytecodeFormat21sUnparser: Unparser<DalvikBytecodeFormat21s, Uint8Array> = async function * (input, unparserContext) {
	yield * ubyteUnparser(input.registers[0], unparserContext);
	yield * shortUnparser(input.value, unparserContext);
};

// Format 22b: two registers + value (1 byte signed)
type DalvikBytecodeFormat22b = {
	registers: number[];
	value: number;
};

export const dalvikBytecodeFormat22bUnparser: Unparser<DalvikBytecodeFormat22b, Uint8Array> = async function * (input, unparserContext) {
	yield * ubyteUnparser(input.registers[0], unparserContext);
	yield * ubyteUnparser(input.registers[1], unparserContext);
	yield * byteUnparser(input.value, unparserContext);
};

// Format 22c: two registers in nibbles + index (2 bytes)
type DalvikBytecodeFormat22c = {
	registers: number[];
	index: number;
};

export const dalvikBytecodeFormat22cUnparser: Unparser<DalvikBytecodeFormat22c, Uint8Array> = async function * (input, unparserContext) {
	yield * nibblesUnparser([ input.registers[1], input.registers[0] ], unparserContext);
	yield * ushortUnparser(input.index, unparserContext);
};

// Format 22s: two registers in nibbles + value (2 bytes signed)
type DalvikBytecodeFormat22s = {
	value: number;
	registers: number[];
};

export const dalvikBytecodeFormat22sUnparser: Unparser<DalvikBytecodeFormat22s, Uint8Array> = async function * (input, unparserContext) {
	yield * nibblesUnparser([ input.registers[1], input.registers[0] ], unparserContext);
	yield * shortUnparser(input.value, unparserContext);
};

// Format 22t: two registers in nibbles + branchOffset (2 bytes signed)
type DalvikBytecodeFormat22t = {
	branchOffset: number;
	registers: number[];
};

export const dalvikBytecodeFormat22tUnparser: Unparser<DalvikBytecodeFormat22t, Uint8Array> = async function * (input, unparserContext) {
	yield * nibblesUnparser([ input.registers[1], input.registers[0] ], unparserContext);
	yield * shortUnparser(input.branchOffset, unparserContext);
};

// Format 22x: register + register (2 bytes)
type DalvikBytecodeFormat22x = {
	registers: number[];
};

export const dalvikBytecodeFormat22xUnparser: Unparser<DalvikBytecodeFormat22x, Uint8Array> = async function * (input, unparserContext) {
	yield * ubyteUnparser(input.registers[0], unparserContext);
	yield * ushortUnparser(input.registers[1], unparserContext);
};

// Format 23x: three registers
type DalvikBytecodeFormat23x = {
	registers: number[];
};

export const dalvikBytecodeFormat23xUnparser: Unparser<DalvikBytecodeFormat23x, Uint8Array> = async function * (input, unparserContext) {
	yield * ubyteUnparser(input.registers[0], unparserContext);
	yield * ubyteUnparser(input.registers[1], unparserContext);
	yield * ubyteUnparser(input.registers[2], unparserContext);
};

// Format 30t: zero byte + branchOffset (4 bytes signed)
type DalvikBytecodeFormat30t = {
	branchOffset: number;
};

export const dalvikBytecodeFormat30tUnparser: Unparser<DalvikBytecodeFormat30t, Uint8Array> = async function * (input, unparserContext) {
	yield * intUnparser(input.branchOffset, unparserContext);
};

// Format 31i: register + value (4 bytes signed)
type DalvikBytecodeFormat31i = {
	value: number;
	registers: number[];
};

export const dalvikBytecodeFormat31iUnparser: Unparser<DalvikBytecodeFormat31i, Uint8Array> = async function * (input, unparserContext) {
	yield * ubyteUnparser(input.registers[0], unparserContext);
	yield * intUnparser(input.value, unparserContext);
};

// Format 31c: register + index (4 bytes)
type DalvikBytecodeFormat31c = {
	index: number;
	registers: number[];
};

export const dalvikBytecodeFormat31cUnparser: Unparser<DalvikBytecodeFormat31c, Uint8Array> = async function * (input, unparserContext) {
	yield * ubyteUnparser(input.registers[0], unparserContext);
	yield * uintUnparser(input.index, unparserContext);
};

// Format 31t: register + branchOffset (4 bytes signed)
type DalvikBytecodeFormat31t = {
	branchOffset: number;
	registers: number[];
};

export const dalvikBytecodeFormat31tUnparser: Unparser<DalvikBytecodeFormat31t, Uint8Array> = async function * (input, unparserContext) {
	yield * ubyteUnparser(input.registers[0], unparserContext);
	yield * intUnparser(input.branchOffset, unparserContext);
};

// Format 32x: two registers (2 bytes each)
type DalvikBytecodeFormat32x = {
	registers: number[];
};

export const dalvikBytecodeFormat32xUnparser: Unparser<DalvikBytecodeFormat32x, Uint8Array> = async function * (input, unparserContext) {
	yield * ushortUnparser(input.registers[0], unparserContext);
	yield * ushortUnparser(input.registers[1], unparserContext);
};

// Format 35c: registerCount + 5 registers + index (up to 5 args for invoke)
type DalvikBytecodeFormat35c = {
	index: number;
	registers: number[];
};

export const dalvikBytecodeFormat35cUnparser: Unparser<DalvikBytecodeFormat35c, Uint8Array> = async function * (input, unparserContext) {
	const registerCount = input.registers.length;
	const register4 = input.registers[4] ?? 0;
	const register3 = input.registers[3] ?? 0;
	const register2 = input.registers[2] ?? 0;
	const register1 = input.registers[1] ?? 0;
	const register0 = input.registers[0] ?? 0;

	yield * nibblesUnparser([ registerCount, register4 ], unparserContext);
	yield * ushortUnparser(input.index, unparserContext);
	yield * nibblesUnparser([ register1, register0 ], unparserContext);
	yield * nibblesUnparser([ register3, register2 ], unparserContext);
};

// Format 3rc: registerCount + index + firstRegister (register range)
type DalvikBytecodeFormat3rc = {
	index: number;
	registers: number[];
};

export const dalvikBytecodeFormat3rcUnparser: Unparser<DalvikBytecodeFormat3rc, Uint8Array> = async function * (input, unparserContext) {
	const registerCount = input.registers.length;
	const firstRegister = input.registers[0] ?? 0;

	yield * ubyteUnparser(registerCount, unparserContext);
	yield * ushortUnparser(input.index, unparserContext);
	yield * ushortUnparser(firstRegister, unparserContext);
};

// Format 51l: register + value (8 bytes)
type DalvikBytecodeFormat51l = {
	value: bigint;
	registers: number[];
};

export const dalvikBytecodeFormat51lUnparser: Unparser<DalvikBytecodeFormat51l, Uint8Array> = async function * (input, unparserContext) {
	yield * ubyteUnparser(input.registers[0], unparserContext);
	yield * longUnparser(input.value, unparserContext);
};

// Format 45cc: invoke-polymorphic (register count + 5 registers + method index + proto index)
type DalvikBytecodeFormat45cc = {
	methodIndex: number;
	protoIndex: number;
	registers: number[];
};

export const dalvikBytecodeFormat45ccUnparser: Unparser<DalvikBytecodeFormat45cc, Uint8Array> = async function * (input, unparserContext) {
	const registerCount = input.registers.length;
	const register4 = input.registers[4] ?? 0;
	const register3 = input.registers[3] ?? 0;
	const register2 = input.registers[2] ?? 0;
	const register1 = input.registers[1] ?? 0;
	const register0 = input.registers[0] ?? 0;

	yield * nibblesUnparser([ registerCount, register4 ], unparserContext);
	yield * ushortUnparser(input.methodIndex, unparserContext);
	yield * nibblesUnparser([ register1, register0 ], unparserContext);
	yield * nibblesUnparser([ register3, register2 ], unparserContext);
	yield * ushortUnparser(input.protoIndex, unparserContext);
};

// Format 4rcc: invoke-polymorphic/range
type DalvikBytecodeFormat4rcc = {
	methodIndex: number;
	protoIndex: number;
	registers: number[];
};

export const dalvikBytecodeFormat4rccUnparser: Unparser<DalvikBytecodeFormat4rcc, Uint8Array> = async function * (input, unparserContext) {
	const registerCount = input.registers.length;
	const firstRegister = input.registers[0] ?? 0;

	yield * ubyteUnparser(registerCount, unparserContext);
	yield * ushortUnparser(input.methodIndex, unparserContext);
	yield * ushortUnparser(firstRegister, unparserContext);
	yield * ushortUnparser(input.protoIndex, unparserContext);
};

// Payload formats

// Packed-switch-payload
type DalvikBytecodeOperationPackedSwitchPayload = {
	operation: 'packed-switch-payload';
	value: number;
	branchOffsets: number[];
};

export const dalvikBytecodeOperationPackedSwitchPayloadUnparser: Unparser<DalvikBytecodeOperationPackedSwitchPayload, Uint8Array> = async function * (input, unparserContext) {
	// Ident (0x0100) - little-endian
	yield * ushortUnparser(0x01_00, unparserContext);
	// Size
	yield * ushortUnparser(input.branchOffsets.length, unparserContext);
	// First key value
	yield * intUnparser(input.value, unparserContext);
	// Branch offsets
	for (const offset of input.branchOffsets) {
		yield * intUnparser(offset, unparserContext);
	}
};

// Sparse-switch-payload
type DalvikBytecodeOperationSparseSwitchPayload = {
	operation: 'sparse-switch-payload';
	keys: number[];
	branchOffsets: number[];
};

export const dalvikBytecodeOperationSparseSwitchPayloadUnparser: Unparser<DalvikBytecodeOperationSparseSwitchPayload, Uint8Array> = async function * (input, unparserContext) {
	// Ident (0x0200) - little-endian
	yield * ushortUnparser(0x02_00, unparserContext);
	// Size
	yield * ushortUnparser(input.keys.length, unparserContext);
	// Keys
	for (const key of input.keys) {
		yield * intUnparser(key, unparserContext);
	}
	// Branch offsets
	for (const offset of input.branchOffsets) {
		yield * intUnparser(offset, unparserContext);
	}
};

// Fill-array-data-payload
type DalvikBytecodeOperationFillArrayDataPayload = {
	operation: 'fill-array-data-payload';
	elementWidth: number;
	data: number[];
};

export const dalvikBytecodeOperationFillArrayDataPayloadUnparser: Unparser<DalvikBytecodeOperationFillArrayDataPayload, Uint8Array> = async function * (input, unparserContext) {
	// Ident (0x0300) - little-endian
	yield * ushortUnparser(0x03_00, unparserContext);
	// Element width
	yield * ushortUnparser(input.elementWidth, unparserContext);
	// Size (number of elements)
	yield * uintUnparser(input.data.length, unparserContext);

	// Data (size * elementWidth bytes)
	for (const element of input.data) {
		switch (input.elementWidth) {
			case 1:
				yield * ubyteUnparser(element, unparserContext);
				break;
			case 2:
				yield * ushortUnparser(element, unparserContext);
				break;
			case 4:
				yield * uintUnparser(element, unparserContext);
				break;
			case 8:
				yield * ulongUnparser(BigInt(element), unparserContext);
				break;
			default:
				throw new Error(`Unsupported element width: ${input.elementWidth}`);
		}
	}

	// Padding if needed (align to 2-byte boundary)
	const dataSize = input.data.length * input.elementWidth;
	const paddingSize = dataSize % 2;
	if (paddingSize === 1) {
		yield * ubyteUnparser(0, unparserContext);
	}
};
