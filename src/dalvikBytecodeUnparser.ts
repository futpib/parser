import { type Unparser, type UnparserResult } from './unparser.js';
import { type UnparserContext } from './unparserContext.js';
import { type RawDalvikBytecode, type RawDalvikBytecodeOperation } from './dalvikBytecodeParser.js';
import {
	type CodeUnit,
	isoIndexIntoStringIds,
	isoIndexIntoTypeIds,
	isoIndexIntoMethodIds,
	isoIndexIntoFieldIds,
	isoIndexIntoPrototypeIds,
} from './dalvikExecutableParser/typedNumbers.js';
import {
	ubyteUnparser,
	dalvikBytecodeFormat10tUnparser,
	dalvikBytecodeFormat10xUnparser,
	dalvikBytecodeFormat11xUnparser,
	dalvikBytecodeFormat11nUnparser,
	dalvikBytecodeFormat12xUnparser,
	dalvikBytecodeFormat12xReversedUnparser,
	dalvikBytecodeFormat20tUnparser,
	dalvikBytecodeFormat21cUnparser,
	dalvikBytecodeFormat21hUnparser,
	dalvikBytecodeFormat21tUnparser,
	dalvikBytecodeFormat21sUnparser,
	dalvikBytecodeFormat22bUnparser,
	dalvikBytecodeFormat22cUnparser,
	dalvikBytecodeFormat22sUnparser,
	dalvikBytecodeFormat22tUnparser,
	dalvikBytecodeFormat22tCommutativeUnparser,
	dalvikBytecodeFormat22xUnparser,
	dalvikBytecodeFormat23xUnparser,
	dalvikBytecodeFormat30tUnparser,
	dalvikBytecodeFormat31iUnparser,
	dalvikBytecodeFormat31cUnparser,
	dalvikBytecodeFormat31tUnparser,
	dalvikBytecodeFormat32xUnparser,
	dalvikBytecodeFormat35cUnparser,
	dalvikBytecodeFormat3rcUnparser,
	dalvikBytecodeFormat51lUnparser,
	dalvikBytecodeFormat45ccUnparser,
	dalvikBytecodeFormat4rccUnparser,
	dalvikBytecodeOperationPackedSwitchPayloadUnparser,
	dalvikBytecodeOperationSparseSwitchPayloadUnparser,
	dalvikBytecodeOperationFillArrayDataPayloadUnparser,
	ushortUnparser,
} from './dalvikBytecodeUnparser/formatUnparsers.js';

// Reverse opcode mapping: operation name → opcode
const operationToOpcodeMap: Map<string, number> = new Map([
	// nop is multi-byte (0x0000 or payload instructions)
	[ 'nop', 0x00 ],

	// Move operations
	[ 'move', 0x01 ],
	[ 'move/from16', 0x02 ],
	[ 'move-wide', 0x04 ],
	[ 'move-wide/from16', 0x05 ],
	[ 'move-wide/16', 0x06 ],
	[ 'move-object', 0x07 ],
	[ 'move-object/from16', 0x08 ],
	[ 'move-result', 0x0A ],
	[ 'move-result-wide', 0x0B ],
	[ 'move-result-object', 0x0C ],
	[ 'move-exception', 0x0D ],

	// Return operations
	[ 'return-void', 0x0E ],
	[ 'return', 0x0F ],
	[ 'return-wide', 0x10 ],
	[ 'return-object', 0x11 ],

	// Const operations
	[ 'const/4', 0x12 ],
	[ 'const/16', 0x13 ],
	[ 'const', 0x14 ],
	[ 'const/high16', 0x15 ],
	[ 'const-wide/16', 0x16 ],
	[ 'const-wide/32', 0x17 ],
	[ 'const-wide', 0x18 ],
	[ 'const-wide/high16', 0x19 ],
	[ 'const-string', 0x1A ],
	[ 'const-string/jumbo', 0x1B ],
	[ 'const-class', 0x1C ],

	// Monitor operations
	[ 'monitor-enter', 0x1D ],
	[ 'monitor-exit', 0x1E ],

	// Type operations
	[ 'check-cast', 0x1F ],
	[ 'instance-of', 0x20 ],

	// Array operations
	[ 'array-length', 0x21 ],
	[ 'new-instance', 0x22 ],
	[ 'new-array', 0x23 ],
	[ 'filled-new-array', 0x24 ],
	[ 'filled-new-array/range', 0x25 ],
	[ 'fill-array-data', 0x26 ],

	// Throw
	[ 'throw', 0x27 ],

	// Goto operations
	[ 'goto', 0x28 ],
	[ 'goto/16', 0x29 ],
	[ 'goto/32', 0x2A ],
	[ 'packed-switch', 0x2B ],
	[ 'sparse-switch', 0x2C ],

	// Compare operations
	[ 'cmpl-float', 0x2D ],
	[ 'cmpg-float', 0x2E ],
	[ 'cmpl-double', 0x2F ],
	[ 'cmpg-double', 0x30 ],
	[ 'cmp-long', 0x31 ],

	// If-test operations
	[ 'if-eq', 0x32 ],
	[ 'if-ne', 0x33 ],
	[ 'if-lt', 0x34 ],
	[ 'if-ge', 0x35 ],
	[ 'if-gt', 0x36 ],
	[ 'if-le', 0x37 ],

	// If-test-zero operations
	[ 'if-eqz', 0x38 ],
	[ 'if-nez', 0x39 ],
	[ 'if-ltz', 0x3A ],
	[ 'if-gez', 0x3B ],
	[ 'if-gtz', 0x3C ],
	[ 'if-lez', 0x3D ],

	// Array element operations
	[ 'aget', 0x44 ],
	[ 'aget-wide', 0x45 ],
	[ 'aget-object', 0x46 ],
	[ 'aget-boolean', 0x47 ],
	[ 'aget-byte', 0x48 ],
	[ 'aget-char', 0x49 ],
	[ 'aget-short', 0x4A ],
	[ 'aput', 0x4B ],
	[ 'aput-wide', 0x4C ],
	[ 'aput-object', 0x4D ],
	[ 'aput-boolean', 0x4E ],
	[ 'aput-byte', 0x4F ],
	[ 'aput-char', 0x50 ],
	[ 'aput-short', 0x51 ],

	// Instance field operations
	[ 'iget', 0x52 ],
	[ 'iget-wide', 0x53 ],
	[ 'iget-object', 0x54 ],
	[ 'iget-boolean', 0x55 ],
	[ 'iget-byte', 0x56 ],
	[ 'iget-char', 0x57 ],
	[ 'iget-short', 0x58 ],
	[ 'iput', 0x59 ],
	[ 'iput-wide', 0x5A ],
	[ 'iput-object', 0x5B ],
	[ 'iput-boolean', 0x5C ],
	[ 'iput-byte', 0x5D ],
	[ 'iput-char', 0x5E ],
	[ 'iput-short', 0x5F ],

	// Static field operations
	[ 'sget', 0x60 ],
	[ 'sget-wide', 0x61 ],
	[ 'sget-object', 0x62 ],
	[ 'sget-boolean', 0x63 ],
	[ 'sget-byte', 0x64 ],
	[ 'sget-char', 0x65 ],
	[ 'sget-short', 0x66 ],
	[ 'sput', 0x67 ],
	[ 'sput-wide', 0x68 ],
	[ 'sput-object', 0x69 ],
	[ 'sput-boolean', 0x6A ],
	[ 'sput-byte', 0x6B ],
	[ 'sput-char', 0x6C ],
	[ 'sput-short', 0x6D ],

	// Invoke operations
	[ 'invoke-virtual', 0x6E ],
	[ 'invoke-super', 0x6F ],
	[ 'invoke-direct', 0x70 ],
	[ 'invoke-static', 0x71 ],
	[ 'invoke-interface', 0x72 ],
	[ 'invoke-virtual/range', 0x74 ],
	[ 'invoke-super/range', 0x75 ],
	[ 'invoke-direct/range', 0x76 ],
	[ 'invoke-static/range', 0x77 ],
	[ 'invoke-interface/range', 0x78 ],

	// Unary operations
	[ 'neg-int', 0x7B ],
	[ 'not-int', 0x7C ],
	[ 'neg-long', 0x7D ],
	[ 'not-long', 0x7E ],
	[ 'neg-float', 0x7F ],
	[ 'neg-double', 0x80 ],
	[ 'int-to-long', 0x81 ],
	[ 'int-to-float', 0x82 ],
	[ 'int-to-double', 0x83 ],
	[ 'long-to-int', 0x84 ],
	[ 'long-to-float', 0x85 ],
	[ 'long-to-double', 0x86 ],
	[ 'float-to-int', 0x87 ],
	[ 'float-to-long', 0x88 ],
	[ 'float-to-double', 0x89 ],
	[ 'double-to-int', 0x8A ],
	[ 'double-to-long', 0x8B ],
	[ 'double-to-float', 0x8C ],
	[ 'int-to-byte', 0x8D ],
	[ 'int-to-char', 0x8E ],
	[ 'int-to-short', 0x8F ],

	// Binary operations
	[ 'add-int', 0x90 ],
	[ 'sub-int', 0x91 ],
	[ 'mul-int', 0x92 ],
	[ 'div-int', 0x93 ],
	[ 'rem-int', 0x94 ],
	[ 'and-int', 0x95 ],
	[ 'or-int', 0x96 ],
	[ 'xor-int', 0x97 ],
	[ 'shl-int', 0x98 ],
	[ 'shr-int', 0x99 ],
	[ 'ushr-int', 0x9A ],
	[ 'add-long', 0x9B ],
	[ 'sub-long', 0x9C ],
	[ 'mul-long', 0x9D ],
	[ 'div-long', 0x9E ],
	[ 'rem-long', 0x9F ],
	[ 'and-long', 0xA0 ],
	[ 'or-long', 0xA1 ],
	[ 'xor-long', 0xA2 ],
	[ 'shl-long', 0xA3 ],
	[ 'shr-long', 0xA4 ],
	[ 'ushr-long', 0xA5 ],
	[ 'add-float', 0xA6 ],
	[ 'sub-float', 0xA7 ],
	[ 'mul-float', 0xA8 ],
	[ 'div-float', 0xA9 ],
	[ 'add-double', 0xAB ],
	[ 'sub-double', 0xAC ],
	[ 'mul-double', 0xAD ],
	[ 'div-double', 0xAE ],
	[ 'rem-double', 0xAF ],

	// Binary operations in place (2addr)
	[ 'add-int/2addr', 0xB0 ],
	[ 'sub-int/2addr', 0xB1 ],
	[ 'mul-int/2addr', 0xB2 ],
	[ 'div-int/2addr', 0xB3 ],
	[ 'rem-int/2addr', 0xB4 ],
	[ 'and-int/2addr', 0xB5 ],
	[ 'or-int/2addr', 0xB6 ],
	[ 'xor-int/2addr', 0xB7 ],
	[ 'shl-int/2addr', 0xB8 ],
	[ 'shr-int/2addr', 0xB9 ],
	[ 'ushr-int/2addr', 0xBA ],
	[ 'add-long/2addr', 0xBB ],
	[ 'sub-long/2addr', 0xBC ],
	[ 'mul-long/2addr', 0xBD ],
	[ 'div-long/2addr', 0xBE ],
	[ 'rem-long/2addr', 0xBF ],
	[ 'and-long/2addr', 0xC0 ],
	[ 'or-long/2addr', 0xC1 ],
	[ 'xor-long/2addr', 0xC2 ],
	[ 'shl-long/2addr', 0xC3 ],
	[ 'shr-long/2addr', 0xC4 ],
	[ 'ushr-long/2addr', 0xC5 ],
	[ 'add-float/2addr', 0xC6 ],
	[ 'sub-float/2addr', 0xC7 ],
	[ 'mul-float/2addr', 0xC8 ],
	[ 'div-float/2addr', 0xC9 ],
	[ 'rem-float/2addr', 0xCA ],
	[ 'add-double/2addr', 0xCB ],
	[ 'sub-double/2addr', 0xCC ],
	[ 'mul-double/2addr', 0xCD ],
	[ 'div-double/2addr', 0xCE ],
	[ 'rem-double/2addr', 0xCF ],

	// Binary operations with literal16
	[ 'add-int/lit16', 0xD0 ],
	[ 'rsub-int', 0xD1 ],
	[ 'mul-int/lit16', 0xD2 ],
	[ 'div-int/lit16', 0xD3 ],
	[ 'rem-int/lit16', 0xD4 ],
	[ 'and-int/lit16', 0xD5 ],
	[ 'or-int/lit16', 0xD6 ],
	[ 'xor-int/lit16', 0xD7 ],

	// Binary operations with literal8
	[ 'add-int/lit8', 0xD8 ],
	[ 'rsub-int/lit8', 0xD9 ],
	[ 'mul-int/lit8', 0xDA ],
	[ 'div-int/lit8', 0xDB ],
	[ 'rem-int/lit8', 0xDC ],
	[ 'and-int/lit8', 0xDD ],
	[ 'or-int/lit8', 0xDE ],
	[ 'xor-int/lit8', 0xDF ],
	[ 'shl-int/lit8', 0xE0 ],
	[ 'shr-int/lit8', 0xE1 ],
	[ 'ushr-int/lit8', 0xE2 ],

	// Invoke polymorphic
	[ 'invoke-polymorphic', 0xFA ],
	[ 'invoke-polymorphic/range', 0xFB ],
	[ 'const-method-handle', 0xFE ],

	// Note: Payload instructions don't have single-byte opcodes
	// They use multi-byte identifiers: 0x0100, 0x0200, 0x0300
]);

export const rawDalvikBytecodeUnparser: Unparser<RawDalvikBytecode, Uint8Array> = async function * (input, unparserContext) {
	for (const operation of input) {
		yield * rawDalvikBytecodeOperationUnparser(operation, unparserContext);
	}
};

// Type guards for payload operations
function isPackedSwitchPayload(op: RawDalvikBytecodeOperation): op is RawDalvikBytecodeOperation & { operation: 'packed-switch-payload' } {
	return typeof op === 'object' && op !== null && 'operation' in op && op.operation === 'packed-switch-payload';
}

function isSparseSwitchPayload(op: RawDalvikBytecodeOperation): op is RawDalvikBytecodeOperation & { operation: 'sparse-switch-payload' } {
	return typeof op === 'object' && op !== null && 'operation' in op && op.operation === 'sparse-switch-payload';
}

function isFillArrayDataPayload(op: RawDalvikBytecodeOperation): op is RawDalvikBytecodeOperation & { operation: 'fill-array-data-payload' } {
	return typeof op === 'object' && op !== null && 'operation' in op && op.operation === 'fill-array-data-payload';
}

const rawDalvikBytecodeOperationUnparser: Unparser<RawDalvikBytecodeOperation, Uint8Array> = async function * (operation, unparserContext) {
	if (!operation || typeof operation !== 'object' || !('operation' in operation)) {
		throw new Error('Invalid operation');
	}

	const operationName = operation.operation;

	// Handle payload instructions (multi-byte opcodes)
	if (isPackedSwitchPayload(operation)) {
		yield * dalvikBytecodeOperationPackedSwitchPayloadUnparser(operation, unparserContext);
		return;
	}

	if (isSparseSwitchPayload(operation)) {
		yield * dalvikBytecodeOperationSparseSwitchPayloadUnparser(operation, unparserContext);
		return;
	}

	if (isFillArrayDataPayload(operation)) {
		yield * dalvikBytecodeOperationFillArrayDataPayloadUnparser(operation, unparserContext);
		return;
	}

	// Handle nop (can be 0x00_00 or just 0x00)
	if (operationName === 'nop') {
		yield * ushortUnparser(0x00_00, unparserContext);
		return;
	}

	// Get opcode for regular operations
	const opcode = operationToOpcodeMap.get(operationName);
	if (opcode === undefined) {
		throw new Error(`Unknown operation: ${operationName}`);
	}

	// Write opcode
	yield * ubyteUnparser(opcode, unparserContext);

	// Write operation-specific data based on operation type
	yield * unparseOperationData(operation, unparserContext);
};

// Helper to check if operation has specific fields
function hasRegisters(op: RawDalvikBytecodeOperation): op is RawDalvikBytecodeOperation & { registers: number[] } {
	return 'registers' in op;
}

function hasValue(op: RawDalvikBytecodeOperation): op is RawDalvikBytecodeOperation & { value: number | bigint } {
	return 'value' in op;
}

function hasBranchOffsetCodeUnit(op: RawDalvikBytecodeOperation): op is RawDalvikBytecodeOperation & { branchOffsetCodeUnit: CodeUnit } {
	return 'branchOffsetCodeUnit' in op;
}

async function * unparseOperationData(operation: RawDalvikBytecodeOperation, unparserContext: UnparserContext<Uint8Array, number>): UnparserResult<Uint8Array, number> {
	if (!('operation' in operation)) {
		throw new Error('Invalid operation structure');
	}

	const operationName = operation.operation;

	// The operation data varies by instruction format
	// We need to determine which format unparser to call based on the operation type

	// Format 10x operations (no additional data besides zero byte)
	if (operationName === 'nop' || operationName === 'return-void') {
		yield * dalvikBytecodeFormat10xUnparser(undefined, unparserContext);
		return;
	}

	// Format 11x operations (single register)
	if (operationName === 'move-result' || operationName === 'move-result-wide' ||
	    operationName === 'move-result-object' || operationName === 'move-exception' ||
	    operationName === 'return' || operationName === 'return-wide' ||
	    operationName === 'return-object' || operationName === 'monitor-enter' ||
	    operationName === 'monitor-exit' || operationName === 'throw') {
		if (!hasRegisters(operation)) {
			throw new Error(`Operation ${operationName} missing registers field`);
		}
		yield * dalvikBytecodeFormat11xUnparser({ registers: operation.registers }, unparserContext);
		return;
	}

	// array-length uses format 12x but reverses registers in parser
	if (operationName === 'array-length') {
		if (!hasRegisters(operation)) {
			throw new Error(`Operation ${operationName} missing registers field`);
		}
		yield * dalvikBytecodeFormat12xReversedUnparser({ registers: operation.registers }, unparserContext);
		return;
	}

	// Format 12x operations (two registers in nibbles)
	if (operationName === 'move' || operationName === 'move-wide' || operationName === 'move-object' ||
	    operationName === 'neg-int' || operationName === 'not-int' ||
	    operationName === 'neg-long' || operationName === 'not-long' ||
	    operationName === 'neg-float' || operationName === 'neg-double' ||
	    operationName === 'int-to-long' || operationName === 'int-to-float' || operationName === 'int-to-double' ||
	    operationName === 'long-to-int' || operationName === 'long-to-float' || operationName === 'long-to-double' ||
	    operationName === 'float-to-int' || operationName === 'float-to-long' || operationName === 'float-to-double' ||
	    operationName === 'double-to-int' || operationName === 'double-to-long' || operationName === 'double-to-float' ||
	    operationName === 'int-to-byte' || operationName === 'int-to-char' || operationName === 'int-to-short' ||
	    operationName === 'add-int/2addr' || operationName === 'sub-int/2addr' || operationName === 'mul-int/2addr' ||
	    operationName === 'div-int/2addr' || operationName === 'rem-int/2addr' || operationName === 'and-int/2addr' ||
	    operationName === 'or-int/2addr' || operationName === 'xor-int/2addr' || operationName === 'shl-int/2addr' ||
	    operationName === 'shr-int/2addr' || operationName === 'ushr-int/2addr' ||
	    operationName === 'add-long/2addr' || operationName === 'sub-long/2addr' || operationName === 'mul-long/2addr' ||
	    operationName === 'div-long/2addr' || operationName === 'rem-long/2addr' || operationName === 'and-long/2addr' ||
	    operationName === 'or-long/2addr' || operationName === 'xor-long/2addr' || operationName === 'shl-long/2addr' ||
	    operationName === 'shr-long/2addr' || operationName === 'ushr-long/2addr' ||
	    operationName === 'add-float/2addr' || operationName === 'sub-float/2addr' || operationName === 'mul-float/2addr' ||
	    operationName === 'div-float/2addr' || operationName === 'rem-float/2addr' ||
	    operationName === 'add-double/2addr' || operationName === 'sub-double/2addr' || operationName === 'mul-double/2addr' ||
	    operationName === 'div-double/2addr' || operationName === 'rem-double/2addr') {
		if (!hasRegisters(operation)) {
			throw new Error(`Operation ${operationName} missing registers field`);
		}
		yield * dalvikBytecodeFormat12xUnparser({ registers: operation.registers }, unparserContext);
		return;
	}

	// Format 11n (const/4)
	if (operationName === 'const/4') {
		if (!hasValue(operation) || !hasRegisters(operation)) {
			throw new Error(`Operation ${operationName} missing value or registers field`);
		}
		yield * dalvikBytecodeFormat11nUnparser({ value: operation.value as number, registers: operation.registers }, unparserContext);
		return;
	}

	// Format 21s (const/16, const-wide/16)
	if (operationName === 'const/16') {
		if (!hasValue(operation) || !hasRegisters(operation)) {
			throw new Error(`Operation ${operationName} missing value or registers field`);
		}
		yield * dalvikBytecodeFormat21sUnparser({ registers: operation.registers, value: operation.value as number }, unparserContext);
		return;
	}

	if (operationName === 'const-wide/16') {
		if (!hasValue(operation) || !hasRegisters(operation)) {
			throw new Error(`Operation ${operationName} missing value or registers field`);
		}
		// Value is bigint, but format 21s expects a signed 16-bit number
		// The parser sign-extends the 16-bit value to 64 bits, so we need to extract the low 16 bits
		const value = Number((operation.value as bigint) & 0xFFFFn);
		// Convert unsigned 16-bit to signed 16-bit
		const signedValue = value > 32767 ? value - 65536 : value;
		yield * dalvikBytecodeFormat21sUnparser({ registers: operation.registers, value: signedValue }, unparserContext);
		return;
	}

	// Format 31i (const, const-wide/32)
	if (operationName === 'const' || operationName === 'const-wide/32') {
		if (!hasValue(operation) || !hasRegisters(operation)) {
			throw new Error(`Operation ${operationName} missing value or registers field`);
		}
		// For const-wide/32, value is bigint but we need to convert to signed 32-bit number
		const value = typeof operation.value === 'bigint'
			? Number(BigInt.asIntN(32, operation.value))
			: operation.value as number;
		yield * dalvikBytecodeFormat31iUnparser({ value, registers: operation.registers }, unparserContext);
		return;
	}

	// Format 21h (const/high16, const-wide/high16)
	if (operationName === 'const/high16' || operationName === 'const-wide/high16') {
		if (!hasValue(operation) || !hasRegisters(operation)) {
			throw new Error(`Operation ${operationName} missing value or registers field`);
		}
		// The value is stored shifted left (16 bits for const/high16, 48 bits for const-wide/high16)
		// Shift it back for unparsing. Use unsigned shift to handle negative values correctly.
		const value = operationName === 'const-wide/high16'
			? Number((operation.value as bigint) >> 48n) & 0xFFFF
			: ((operation.value as number) >>> 16) & 0xFFFF;
		yield * dalvikBytecodeFormat21hUnparser({ value, registers: operation.registers }, unparserContext);
		return;
	}

	// Format 51l (const-wide)
	if (operationName === 'const-wide') {
		if (!hasValue(operation) || !hasRegisters(operation)) {
			throw new Error(`Operation ${operationName} missing value or registers field`);
		}
		yield * dalvikBytecodeFormat51lUnparser({ value: operation.value as bigint, registers: operation.registers }, unparserContext);
		return;
	}

	// Format 21c (const-string, const-class, check-cast, new-instance)
	if (operationName === 'const-string' || operationName === 'const-class' ||
	    operationName === 'check-cast' || operationName === 'new-instance') {
		if (!hasRegisters(operation)) {
			throw new Error(`Operation ${operationName} missing registers field`);
		}
		// Extract and unwrap the index from stringIndex or typeIndex fields
		const index = 'stringIndex' in operation ? isoIndexIntoStringIds.unwrap(operation.stringIndex) :
		              'typeIndex' in operation ? isoIndexIntoTypeIds.unwrap(operation.typeIndex) : 0;
		yield * dalvikBytecodeFormat21cUnparser({ index, registers: operation.registers }, unparserContext);
		return;
	}

	// Format 22c (instance-of, new-array, iget*, iput*)
	if (operationName === 'instance-of' || operationName === 'new-array' ||
	    operationName.startsWith('iget') || operationName.startsWith('iput')) {
		if (!hasRegisters(operation)) {
			throw new Error(`Operation ${operationName} missing registers field`);
		}
		// Extract and unwrap the index from typeIndex or fieldIndex fields
		const index = 'typeIndex' in operation ? isoIndexIntoTypeIds.unwrap(operation.typeIndex) :
		              'fieldIndex' in operation ? isoIndexIntoFieldIds.unwrap(operation.fieldIndex) : 0;
		yield * dalvikBytecodeFormat22cUnparser({ registers: operation.registers, index }, unparserContext);
		return;
	}

	// Format 21c (sget*, sput* - static field operations)
	if (operationName.startsWith('sget') || operationName.startsWith('sput')) {
		if (!hasRegisters(operation)) {
			throw new Error(`Operation ${operationName} missing registers field`);
		}
		// Extract and unwrap the index from fieldIndex field
		const index = 'fieldIndex' in operation ? isoIndexIntoFieldIds.unwrap(operation.fieldIndex) : 0;
		yield * dalvikBytecodeFormat21cUnparser({ index, registers: operation.registers }, unparserContext);
		return;
	}

	// Format 23x (aget*, aput*, binary operations)
	if (operationName.startsWith('aget') || operationName.startsWith('aput') ||
	    operationName === 'add-int' || operationName === 'sub-int' || operationName === 'mul-int' ||
	    operationName === 'div-int' || operationName === 'rem-int' || operationName === 'and-int' ||
	    operationName === 'or-int' || operationName === 'xor-int' || operationName === 'shl-int' ||
	    operationName === 'shr-int' || operationName === 'ushr-int' ||
	    operationName === 'add-long' || operationName === 'sub-long' || operationName === 'mul-long' ||
	    operationName === 'div-long' || operationName === 'rem-long' || operationName === 'and-long' ||
	    operationName === 'or-long' || operationName === 'xor-long' || operationName === 'shl-long' ||
	    operationName === 'shr-long' || operationName === 'ushr-long' ||
	    operationName === 'add-float' || operationName === 'sub-float' || operationName === 'mul-float' ||
	    operationName === 'div-float' ||
	    operationName === 'add-double' || operationName === 'sub-double' || operationName === 'mul-double' ||
	    operationName === 'div-double' || operationName === 'rem-double' ||
	    operationName === 'cmp-long' || operationName === 'cmpl-float' || operationName === 'cmpg-float' ||
	    operationName === 'cmpl-double' || operationName === 'cmpg-double') {
		if (!hasRegisters(operation)) {
			throw new Error(`Operation ${operationName} missing registers field`);
		}
		yield * dalvikBytecodeFormat23xUnparser({ registers: operation.registers }, unparserContext);
		return;
	}

	// Format 22x (move/from16, move-wide/from16, move-object/from16)
	if (operationName === 'move/from16' || operationName === 'move-wide/from16' ||
	    operationName === 'move-object/from16') {
		if (!hasRegisters(operation)) {
			throw new Error(`Operation ${operationName} missing registers field`);
		}
		yield * dalvikBytecodeFormat22xUnparser({ registers: operation.registers }, unparserContext);
		return;
	}

	// Format 32x (move-wide/16)
	if (operationName === 'move-wide/16') {
		if (!hasRegisters(operation)) {
			throw new Error(`Operation ${operationName} missing registers field`);
		}
		yield * dalvikBytecodeFormat32xUnparser({ registers: operation.registers }, unparserContext);
		return;
	}

	// Format 10t (goto)
	if (operationName === 'goto') {
		if (!hasBranchOffsetCodeUnit(operation)) {
			throw new Error(`Operation ${operationName} missing branchOffsetCodeUnit field`);
		}
		yield * dalvikBytecodeFormat10tUnparser({ branchOffsetCodeUnit: operation.branchOffsetCodeUnit }, unparserContext);
		return;
	}

	// Format 20t (goto/16)
	if (operationName === 'goto/16') {
		if (!hasBranchOffsetCodeUnit(operation)) {
			throw new Error(`Operation ${operationName} missing branchOffsetCodeUnit field`);
		}
		yield * dalvikBytecodeFormat20tUnparser({ branchOffsetCodeUnit: operation.branchOffsetCodeUnit }, unparserContext);
		return;
	}

	// Format 30t (goto/32)
	if (operationName === 'goto/32') {
		if (!hasBranchOffsetCodeUnit(operation)) {
			throw new Error(`Operation ${operationName} missing branchOffsetCodeUnit field`);
		}
		yield * dalvikBytecodeFormat30tUnparser({ branchOffsetCodeUnit: operation.branchOffsetCodeUnit }, unparserContext);
		return;
	}

	// Format 22t (if-* operations)
	if (operationName.startsWith('if-') && !operationName.endsWith('z')) {
		if (!hasBranchOffsetCodeUnit(operation) || !hasRegisters(operation)) {
			throw new Error(`Operation ${operationName} missing branchOffsetCodeUnit or registers field`);
		}
		// Commutative operations (if-eq, if-ne) have sorted registers, so don't reverse
		const isCommutative = operationName === 'if-eq' || operationName === 'if-ne';
		const unparser = isCommutative ? dalvikBytecodeFormat22tCommutativeUnparser : dalvikBytecodeFormat22tUnparser;
		yield * unparser({ branchOffsetCodeUnit: operation.branchOffsetCodeUnit, registers: operation.registers }, unparserContext);
		return;
	}

	// Format 21t (if-*z operations)
	if (operationName.startsWith('if-') && operationName.endsWith('z')) {
		if (!hasBranchOffsetCodeUnit(operation) || !hasRegisters(operation)) {
			throw new Error(`Operation ${operationName} missing branchOffsetCodeUnit or registers field`);
		}
		yield * dalvikBytecodeFormat21tUnparser({ branchOffsetCodeUnit: operation.branchOffsetCodeUnit, registers: operation.registers }, unparserContext);
		return;
	}

	// Format 31t (packed-switch, sparse-switch, fill-array-data)
	if (operationName === 'packed-switch' || operationName === 'sparse-switch' ||
	    operationName === 'fill-array-data') {
		if (!hasBranchOffsetCodeUnit(operation) || !hasRegisters(operation)) {
			throw new Error(`Operation ${operationName} missing branchOffsetCodeUnit or registers field`);
		}
		yield * dalvikBytecodeFormat31tUnparser({ branchOffsetCodeUnit: operation.branchOffsetCodeUnit, registers: operation.registers }, unparserContext);
		return;
	}

	// Format 22b (binary operations with literal8)
	if (operationName.endsWith('/lit8')) {
		if (!hasValue(operation) || !hasRegisters(operation)) {
			throw new Error(`Operation ${operationName} missing value or registers field`);
		}
		yield * dalvikBytecodeFormat22bUnparser({ registers: operation.registers, value: operation.value as number }, unparserContext);
		return;
	}

	// Format 22s (binary operations with literal16, rsub-int)
	if (operationName.endsWith('/lit16') || operationName === 'rsub-int') {
		if (!hasValue(operation) || !hasRegisters(operation)) {
			throw new Error(`Operation ${operationName} missing value or registers field`);
		}
		yield * dalvikBytecodeFormat22sUnparser({ value: operation.value as number, registers: operation.registers }, unparserContext);
		return;
	}

	// Format 45cc (invoke-polymorphic)
	// Must be checked before generic invoke-* handler
	if (operationName === 'invoke-polymorphic') {
		if (!hasRegisters(operation)) {
			throw new Error(`Operation ${operationName} missing registers field`);
		}
		const methodIndex = 'methodIndex' in operation ? isoIndexIntoMethodIds.unwrap(operation.methodIndex) : 0;
		const protoIndex = 'protoIndex' in operation ? isoIndexIntoPrototypeIds.unwrap(operation.protoIndex) : 0;
		yield * dalvikBytecodeFormat45ccUnparser({
			methodIndex,
			protoIndex,
			registers: operation.registers
		}, unparserContext);
		return;
	}

	// Format 4rcc (invoke-polymorphic/range)
	// Must be checked before generic /range handler
	if (operationName === 'invoke-polymorphic/range') {
		if (!hasRegisters(operation)) {
			throw new Error(`Operation ${operationName} missing registers field`);
		}
		const methodIndex = 'methodIndex' in operation ? isoIndexIntoMethodIds.unwrap(operation.methodIndex) : 0;
		const protoIndex = 'protoIndex' in operation ? isoIndexIntoPrototypeIds.unwrap(operation.protoIndex) : 0;
		yield * dalvikBytecodeFormat4rccUnparser({
			methodIndex,
			protoIndex,
			registers: operation.registers
		}, unparserContext);
		return;
	}

	// Format 35c (invoke-*, filled-new-array)
	if ((operationName.startsWith('invoke-') && !operationName.endsWith('/range')) ||
	    operationName === 'filled-new-array') {
		if (!hasRegisters(operation)) {
			throw new Error(`Operation ${operationName} missing registers field`);
		}
		// Extract and unwrap the index from methodIndex or typeIndex fields
		const index = 'methodIndex' in operation ? isoIndexIntoMethodIds.unwrap(operation.methodIndex) :
		              'typeIndex' in operation ? isoIndexIntoTypeIds.unwrap(operation.typeIndex) : 0;
		yield * dalvikBytecodeFormat35cUnparser({ index, registers: operation.registers }, unparserContext);
		return;
	}

	// Format 3rc (invoke-*/range, filled-new-array/range)
	if (operationName.endsWith('/range')) {
		if (!hasRegisters(operation)) {
			throw new Error(`Operation ${operationName} missing registers field`);
		}
		// Extract and unwrap the index from methodIndex or typeIndex fields
		const index = 'methodIndex' in operation ? isoIndexIntoMethodIds.unwrap(operation.methodIndex) :
		              'typeIndex' in operation ? isoIndexIntoTypeIds.unwrap(operation.typeIndex) : 0;
		yield * dalvikBytecodeFormat3rcUnparser({ index, registers: operation.registers }, unparserContext);
		return;
	}

	// Format 31c (const-string/jumbo)
	if (operationName === 'const-string/jumbo') {
		if (!hasRegisters(operation)) {
			throw new Error(`Operation ${operationName} missing registers field`);
		}
		// Extract and unwrap the index from stringIndex field
		const index = 'stringIndex' in operation ? isoIndexIntoStringIds.unwrap(operation.stringIndex) : 0;
		yield * dalvikBytecodeFormat31cUnparser({ index, registers: operation.registers }, unparserContext);
		return;
	}

	// Format 21c (const-method-handle)
	if (operationName === 'const-method-handle') {
		if (!hasRegisters(operation)) {
			throw new Error(`Operation ${operationName} missing registers field`);
		}
		// Extract and unwrap the index from methodIndex field
		const index = 'methodIndex' in operation ? isoIndexIntoMethodIds.unwrap(operation.methodIndex) : 0;
		yield * dalvikBytecodeFormat21cUnparser({ index, registers: operation.registers }, unparserContext);
		return;
	}

	throw new Error(`Unhandled operation format for: ${operationName}`);
}
