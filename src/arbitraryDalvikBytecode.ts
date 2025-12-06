import * as fc from 'fast-check';
import {
	type RawDalvikBytecode,
	type RawDalvikBytecodeOperation,
} from './dalvikBytecodeParser.js';
import {
	type IndexIntoStringIds,
	type IndexIntoTypeIds,
	type IndexIntoMethodIds,
	type IndexIntoFieldIds,
	type IndexIntoPrototypeIds,
	type CodeUnit,
	isoIndexIntoStringIds,
	isoIndexIntoTypeIds,
	isoIndexIntoMethodIds,
	isoIndexIntoFieldIds,
	isoIndexIntoPrototypeIds,
	isoCodeUnit,
} from './dalvikExecutableParser/typedNumbers.js';

// Arbitrary generators for typed indexes
const arbitraryIndexIntoStringIds: fc.Arbitrary<IndexIntoStringIds> = fc
	.nat({ max: 65535 })
	.map(n => isoIndexIntoStringIds.wrap(n));

const arbitraryIndexIntoTypeIds: fc.Arbitrary<IndexIntoTypeIds> = fc
	.nat({ max: 65535 })
	.map(n => isoIndexIntoTypeIds.wrap(n));

const arbitraryIndexIntoMethodIds: fc.Arbitrary<IndexIntoMethodIds> = fc
	.nat({ max: 65535 })
	.map(n => isoIndexIntoMethodIds.wrap(n));

const arbitraryIndexIntoFieldIds: fc.Arbitrary<IndexIntoFieldIds> = fc
	.nat({ max: 65535 })
	.map(n => isoIndexIntoFieldIds.wrap(n));

const arbitraryIndexIntoPrototypeIds: fc.Arbitrary<IndexIntoPrototypeIds> = fc
	.nat({ max: 65535 })
	.map(n => isoIndexIntoPrototypeIds.wrap(n));

// Arbitrary register number (4-bit or 8-bit or 16-bit depending on format)
const arbitraryRegister4 = fc.nat({ max: 15 });
const arbitraryRegister8 = fc.nat({ max: 255 });
const arbitraryRegister16 = fc.nat({ max: 65535 });

// Arbitrary values for const operations
const arbitraryNibbleValue = fc.integer({ min: -8, max: 7 }); // 4-bit signed
const arbitraryByteValue = fc.integer({ min: -128, max: 127 }); // 8-bit signed
const arbitraryShortValue = fc.integer({ min: -32768, max: 32767 }); // 16-bit signed
const arbitraryIntValue = fc.integer({ min: -2147483648, max: 2147483647 }); // 32-bit signed
const arbitraryLongValue = fc.bigInt({ min: -9223372036854775808n, max: 9223372036854775807n }); // 64-bit signed

// Arbitrary branch offsets (relative) - wrapped as CodeUnit
const arbitraryBranchOffsetCodeUnit8: fc.Arbitrary<CodeUnit> = fc
	.integer({ min: -128, max: 127 })
	.map(n => isoCodeUnit.wrap(n));
const arbitraryBranchOffsetCodeUnit16: fc.Arbitrary<CodeUnit> = fc
	.integer({ min: -32768, max: 32767 })
	.map(n => isoCodeUnit.wrap(n));
const arbitraryBranchOffsetCodeUnit32: fc.Arbitrary<CodeUnit> = fc
	.integer({ min: -2147483648, max: 2147483647 })
	.map(n => isoCodeUnit.wrap(n));

// No-operation
const arbitraryNop = fc.constant<RawDalvikBytecodeOperation>({
	operation: 'nop',
});

// Move operations (Format 12x)
const arbitraryMove = fc.record({
	operation: fc.constant('move' as const),
	registers: fc.tuple(arbitraryRegister4, arbitraryRegister4),
});

const arbitraryMoveWide = fc.record({
	operation: fc.constant('move-wide' as const),
	registers: fc.tuple(arbitraryRegister4, arbitraryRegister4),
});

const arbitraryMoveObject = fc.record({
	operation: fc.constant('move-object' as const),
	registers: fc.tuple(arbitraryRegister4, arbitraryRegister4),
});

// Move operations (Format 22x - from16)
const arbitraryMoveFrom16 = fc.record({
	operation: fc.constant('move/from16' as const),
	registers: fc.tuple(arbitraryRegister8, arbitraryRegister16),
});

const arbitraryMoveWideFrom16 = fc.record({
	operation: fc.constant('move-wide/from16' as const),
	registers: fc.tuple(arbitraryRegister8, arbitraryRegister16),
});

const arbitraryMoveObjectFrom16 = fc.record({
	operation: fc.constant('move-object/from16' as const),
	registers: fc.tuple(arbitraryRegister8, arbitraryRegister16),
});

// Move operations (Format 32x - /16)
const arbitraryMoveWide16 = fc.record({
	operation: fc.constant('move-wide/16' as const),
	registers: fc.tuple(arbitraryRegister16, arbitraryRegister16),
});

// Move-result operations (Format 11x)
const arbitraryMoveResult = fc.record({
	operation: fc.constant('move-result' as const),
	registers: fc.tuple(arbitraryRegister8),
});

const arbitraryMoveResultWide = fc.record({
	operation: fc.constant('move-result-wide' as const),
	registers: fc.tuple(arbitraryRegister8),
});

const arbitraryMoveResultObject = fc.record({
	operation: fc.constant('move-result-object' as const),
	registers: fc.tuple(arbitraryRegister8),
});

const arbitraryMoveException = fc.record({
	operation: fc.constant('move-exception' as const),
	registers: fc.tuple(arbitraryRegister8),
});

// Return operations
const arbitraryReturnVoid = fc.constant<RawDalvikBytecodeOperation>({
	operation: 'return-void',
});

const arbitraryReturn = fc.record({
	operation: fc.constant('return' as const),
	registers: fc.tuple(arbitraryRegister8),
});

const arbitraryReturnWide = fc.record({
	operation: fc.constant('return-wide' as const),
	registers: fc.tuple(arbitraryRegister8),
});

const arbitraryReturnObject = fc.record({
	operation: fc.constant('return-object' as const),
	registers: fc.tuple(arbitraryRegister8),
});

// Const operations
const arbitraryConst4 = fc.record({
	operation: fc.constant('const/4' as const),
	registers: fc.tuple(arbitraryRegister4),
	value: arbitraryNibbleValue,
});

const arbitraryConst16 = fc.record({
	operation: fc.constant('const/16' as const),
	registers: fc.tuple(arbitraryRegister8),
	value: arbitraryShortValue,
});

const arbitraryConst = fc.record({
	operation: fc.constant('const' as const),
	registers: fc.tuple(arbitraryRegister8),
	value: arbitraryIntValue,
});

const arbitraryConstHigh16 = fc.record({
	operation: fc.constant('const/high16' as const),
	registers: fc.tuple(arbitraryRegister8),
	// Parser shifts left by 16, so value is stored pre-shifted
	value: arbitraryShortValue.map(v => v << 16),
});

const arbitraryConstWide16 = fc.record({
	operation: fc.constant('const-wide/16' as const),
	registers: fc.tuple(arbitraryRegister8),
	// Parser stores value as-is (no shift for const-wide/16)
	value: fc.integer({ min: -32768, max: 32767 }).map(v => BigInt(v)),
});

const arbitraryConstWide32 = fc.record({
	operation: fc.constant('const-wide/32' as const),
	registers: fc.tuple(arbitraryRegister8),
	// Parser stores value as-is (no shift for const-wide/32)
	value: fc.integer({ min: -2147483648, max: 2147483647 }).map(v => BigInt(v)),
});

const arbitraryConstWide = fc.record({
	operation: fc.constant('const-wide' as const),
	registers: fc.tuple(arbitraryRegister8),
	value: arbitraryLongValue,
});

const arbitraryConstWideHigh16 = fc.record({
	operation: fc.constant('const-wide/high16' as const),
	registers: fc.tuple(arbitraryRegister8),
	// Parser shifts value left by 48 bits, so generate pre-shifted values
	value: fc.integer({ min: -32768, max: 32767 }).map(v => BigInt(v) << 48n),
});

const arbitraryConstString = fc.record({
	operation: fc.constant('const-string' as const),
	registers: fc.tuple(arbitraryRegister8),
	stringIndex: arbitraryIndexIntoStringIds,
});

const arbitraryConstStringJumbo = fc.record({
	operation: fc.constant('const-string/jumbo' as const),
	registers: fc.tuple(arbitraryRegister8),
	stringIndex: arbitraryIndexIntoStringIds,
});

const arbitraryConstClass = fc.record({
	operation: fc.constant('const-class' as const),
	registers: fc.tuple(arbitraryRegister8),
	typeIndex: arbitraryIndexIntoTypeIds,
});

const arbitraryConstMethodHandle = fc.record({
	operation: fc.constant('const-method-handle' as const),
	registers: fc.tuple(arbitraryRegister8),
	methodIndex: arbitraryIndexIntoMethodIds,
});

// Monitor operations
const arbitraryMonitorEnter = fc.record({
	operation: fc.constant('monitor-enter' as const),
	registers: fc.tuple(arbitraryRegister8),
});

const arbitraryMonitorExit = fc.record({
	operation: fc.constant('monitor-exit' as const),
	registers: fc.tuple(arbitraryRegister8),
});

// Type operations
const arbitraryCheckCast = fc.record({
	operation: fc.constant('check-cast' as const),
	registers: fc.tuple(arbitraryRegister8),
	typeIndex: arbitraryIndexIntoTypeIds,
});

const arbitraryInstanceOf = fc.record({
	operation: fc.constant('instance-of' as const),
	registers: fc.tuple(arbitraryRegister4, arbitraryRegister4),
	typeIndex: arbitraryIndexIntoTypeIds,
});

const arbitraryNewInstance = fc.record({
	operation: fc.constant('new-instance' as const),
	registers: fc.tuple(arbitraryRegister8),
	typeIndex: arbitraryIndexIntoTypeIds,
});

const arbitraryNewArray = fc.record({
	operation: fc.constant('new-array' as const),
	registers: fc.tuple(arbitraryRegister4, arbitraryRegister4),
	typeIndex: arbitraryIndexIntoTypeIds,
});

// Array operations
const arbitraryArrayLength = fc.record({
	operation: fc.constant('array-length' as const),
	registers: fc.tuple(arbitraryRegister4, arbitraryRegister4),
});

const arbitraryThrow = fc.record({
	operation: fc.constant('throw' as const),
	registers: fc.tuple(arbitraryRegister8),
});

// Goto operations
const arbitraryGoto = fc.record({
	operation: fc.constant('goto' as const),
	branchOffsetCodeUnit: arbitraryBranchOffsetCodeUnit8,
});

const arbitraryGoto16 = fc.record({
	operation: fc.constant('goto/16' as const),
	branchOffsetCodeUnit: arbitraryBranchOffsetCodeUnit16,
});

const arbitraryGoto32 = fc.record({
	operation: fc.constant('goto/32' as const),
	branchOffsetCodeUnit: arbitraryBranchOffsetCodeUnit32,
});

// Switch operations
const arbitraryPackedSwitch = fc.record({
	operation: fc.constant('packed-switch' as const),
	registers: fc.tuple(arbitraryRegister8),
	branchOffsetCodeUnit: arbitraryBranchOffsetCodeUnit32,
});

const arbitrarySparseSwitch = fc.record({
	operation: fc.constant('sparse-switch' as const),
	registers: fc.tuple(arbitraryRegister8),
	branchOffsetCodeUnit: arbitraryBranchOffsetCodeUnit32,
});

const arbitraryFillArrayData = fc.record({
	operation: fc.constant('fill-array-data' as const),
	registers: fc.tuple(arbitraryRegister8),
	branchOffsetCodeUnit: arbitraryBranchOffsetCodeUnit32,
});

// Payload operations
const arbitraryPackedSwitchPayload = fc
	.nat({ max: 20 })
	.chain(size =>
		fc.record({
			operation: fc.constant('packed-switch-payload' as const),
			value: arbitraryIntValue,
			branchOffsetsCodeUnit: fc.array(arbitraryBranchOffsetCodeUnit32, { minLength: size, maxLength: size }),
		})
	);

const arbitrarySparseSwitchPayload = fc
	.nat({ max: 20 })
	.chain(size =>
		fc.record({
			operation: fc.constant('sparse-switch-payload' as const),
			keys: fc.array(arbitraryIntValue, { minLength: size, maxLength: size }),
			branchOffsetsCodeUnit: fc.array(arbitraryBranchOffsetCodeUnit32, { minLength: size, maxLength: size }),
		})
	);

const arbitraryFillArrayDataPayload = fc
	.record({
		elementWidth: fc.constantFrom(1, 2, 4, 8),
		size: fc.nat({ max: 100 }),
	})
	.chain(({ elementWidth, size }) =>
		fc.record({
			operation: fc.constant('fill-array-data-payload' as const),
			elementWidth: fc.constant(elementWidth),
			// Data array contains bytes, so length must be size * elementWidth
			data: fc.array(fc.nat({ max: 255 }), { minLength: size * elementWidth, maxLength: size * elementWidth }),
		})
	);

// If-test operations (Format 22t)
// Commutative operations (if-eq, if-ne) generate sorted registers to match parser behavior
const arbitraryIfEqual = fc.record({
	operation: fc.constant('if-eq' as const),
	registers: fc.tuple(arbitraryRegister4, arbitraryRegister4).map(([a, b]) => [a, b].sort((x, y) => x - y)),
	branchOffsetCodeUnit: arbitraryBranchOffsetCodeUnit16,
});

const arbitraryIfNotEqual = fc.record({
	operation: fc.constant('if-ne' as const),
	registers: fc.tuple(arbitraryRegister4, arbitraryRegister4).map(([a, b]) => [a, b].sort((x, y) => x - y)),
	branchOffsetCodeUnit: arbitraryBranchOffsetCodeUnit16,
});

const arbitraryIfLessThan = fc.record({
	operation: fc.constant('if-lt' as const),
	registers: fc.tuple(arbitraryRegister4, arbitraryRegister4),
	branchOffsetCodeUnit: arbitraryBranchOffsetCodeUnit16,
});

const arbitraryIfGreaterThanOrEqualTo = fc.record({
	operation: fc.constant('if-ge' as const),
	registers: fc.tuple(arbitraryRegister4, arbitraryRegister4),
	branchOffsetCodeUnit: arbitraryBranchOffsetCodeUnit16,
});

const arbitraryIfGreaterThan = fc.record({
	operation: fc.constant('if-gt' as const),
	registers: fc.tuple(arbitraryRegister4, arbitraryRegister4),
	branchOffsetCodeUnit: arbitraryBranchOffsetCodeUnit16,
});

const arbitraryIfLessThanOrEqualTo = fc.record({
	operation: fc.constant('if-le' as const),
	registers: fc.tuple(arbitraryRegister4, arbitraryRegister4),
	branchOffsetCodeUnit: arbitraryBranchOffsetCodeUnit16,
});

// If-test-zero operations (Format 21t)
const arbitraryIfEqualZero = fc.record({
	operation: fc.constant('if-eqz' as const),
	registers: fc.tuple(arbitraryRegister8),
	branchOffsetCodeUnit: arbitraryBranchOffsetCodeUnit16,
});

const arbitraryIfNotEqualZero = fc.record({
	operation: fc.constant('if-nez' as const),
	registers: fc.tuple(arbitraryRegister8),
	branchOffsetCodeUnit: arbitraryBranchOffsetCodeUnit16,
});

const arbitraryIfLessThanZero = fc.record({
	operation: fc.constant('if-ltz' as const),
	registers: fc.tuple(arbitraryRegister8),
	branchOffsetCodeUnit: arbitraryBranchOffsetCodeUnit16,
});

const arbitraryIfGreaterThanOrEqualToZero = fc.record({
	operation: fc.constant('if-gez' as const),
	registers: fc.tuple(arbitraryRegister8),
	branchOffsetCodeUnit: arbitraryBranchOffsetCodeUnit16,
});

const arbitraryIfGreaterThanZero = fc.record({
	operation: fc.constant('if-gtz' as const),
	registers: fc.tuple(arbitraryRegister8),
	branchOffsetCodeUnit: arbitraryBranchOffsetCodeUnit16,
});

const arbitraryIfLessThanOrEqualToZero = fc.record({
	operation: fc.constant('if-lez' as const),
	registers: fc.tuple(arbitraryRegister8),
	branchOffsetCodeUnit: arbitraryBranchOffsetCodeUnit16,
});

// Array element operations (Format 23x)
const createArbitraryArrayElementOperation = (operation: string) =>
	fc.record({
		operation: fc.constant(operation as any),
		registers: fc.tuple(arbitraryRegister8, arbitraryRegister8, arbitraryRegister8),
	});

const arbitraryArrayElementGet = createArbitraryArrayElementOperation('aget');
const arbitraryArrayElementGetWide = createArbitraryArrayElementOperation('aget-wide');
const arbitraryArrayElementGetObject = createArbitraryArrayElementOperation('aget-object');
const arbitraryArrayElementGetBoolean = createArbitraryArrayElementOperation('aget-boolean');
const arbitraryArrayElementGetByte = createArbitraryArrayElementOperation('aget-byte');
const arbitraryArrayElementGetChar = createArbitraryArrayElementOperation('aget-char');
const arbitraryArrayElementGetShort = createArbitraryArrayElementOperation('aget-short');
const arbitraryArrayElementPut = createArbitraryArrayElementOperation('aput');
const arbitraryArrayElementPutWide = createArbitraryArrayElementOperation('aput-wide');
const arbitraryArrayElementPutObject = createArbitraryArrayElementOperation('aput-object');
const arbitraryArrayElementPutBoolean = createArbitraryArrayElementOperation('aput-boolean');
const arbitraryArrayElementPutByte = createArbitraryArrayElementOperation('aput-byte');
const arbitraryArrayElementPutChar = createArbitraryArrayElementOperation('aput-char');
const arbitraryArrayElementPutShort = createArbitraryArrayElementOperation('aput-short');

// Instance field operations (Format 22c)
const createArbitraryInstanceFieldOperation = (operation: string) =>
	fc.record({
		operation: fc.constant(operation as any),
		registers: fc.tuple(arbitraryRegister4, arbitraryRegister4),
		fieldIndex: arbitraryIndexIntoFieldIds,
	});

const arbitraryInstanceFieldGet = createArbitraryInstanceFieldOperation('iget');
const arbitraryInstanceFieldGetWide = createArbitraryInstanceFieldOperation('iget-wide');
const arbitraryInstanceFieldGetObject = createArbitraryInstanceFieldOperation('iget-object');
const arbitraryInstanceFieldGetBoolean = createArbitraryInstanceFieldOperation('iget-boolean');
const arbitraryInstanceFieldGetByte = createArbitraryInstanceFieldOperation('iget-byte');
const arbitraryInstanceFieldGetChar = createArbitraryInstanceFieldOperation('iget-char');
const arbitraryInstanceFieldGetShort = createArbitraryInstanceFieldOperation('iget-short');
const arbitraryInstanceFieldPut = createArbitraryInstanceFieldOperation('iput');
const arbitraryInstanceFieldPutWide = createArbitraryInstanceFieldOperation('iput-wide');
const arbitraryInstanceFieldPutObject = createArbitraryInstanceFieldOperation('iput-object');
const arbitraryInstanceFieldPutBoolean = createArbitraryInstanceFieldOperation('iput-boolean');
const arbitraryInstanceFieldPutByte = createArbitraryInstanceFieldOperation('iput-byte');
const arbitraryInstanceFieldPutChar = createArbitraryInstanceFieldOperation('iput-char');
const arbitraryInstanceFieldPutShort = createArbitraryInstanceFieldOperation('iput-short');

// Static field operations (Format 21c)
const createArbitraryStaticFieldOperation = (operation: string) =>
	fc.record({
		operation: fc.constant(operation as any),
		registers: fc.tuple(arbitraryRegister8),
		fieldIndex: arbitraryIndexIntoFieldIds,
	});

const arbitraryStaticFieldGet = createArbitraryStaticFieldOperation('sget');
const arbitraryStaticFieldGetWide = createArbitraryStaticFieldOperation('sget-wide');
const arbitraryStaticFieldGetObject = createArbitraryStaticFieldOperation('sget-object');
const arbitraryStaticFieldGetBoolean = createArbitraryStaticFieldOperation('sget-boolean');
const arbitraryStaticFieldGetByte = createArbitraryStaticFieldOperation('sget-byte');
const arbitraryStaticFieldGetChar = createArbitraryStaticFieldOperation('sget-char');
const arbitraryStaticFieldGetShort = createArbitraryStaticFieldOperation('sget-short');
const arbitraryStaticFieldPut = createArbitraryStaticFieldOperation('sput');
const arbitraryStaticFieldPutWide = createArbitraryStaticFieldOperation('sput-wide');
const arbitraryStaticFieldPutObject = createArbitraryStaticFieldOperation('sput-object');
const arbitraryStaticFieldPutBoolean = createArbitraryStaticFieldOperation('sput-boolean');
const arbitraryStaticFieldPutByte = createArbitraryStaticFieldOperation('sput-byte');
const arbitraryStaticFieldPutChar = createArbitraryStaticFieldOperation('sput-char');
const arbitraryStaticFieldPutShort = createArbitraryStaticFieldOperation('sput-short');

// Invoke operations (Format 35c)
const createArbitraryInvokeOperation = (operation: string) =>
	fc
		.nat({ max: 5 })
		.chain(registerCount =>
			fc.record({
				operation: fc.constant(operation as any),
				registers: fc.array(arbitraryRegister4, {
					minLength: registerCount,
					maxLength: registerCount,
				}),
				methodIndex: arbitraryIndexIntoMethodIds,
			})
		);

const arbitraryInvokeVirtual = createArbitraryInvokeOperation('invoke-virtual');
const arbitraryInvokeSuper = createArbitraryInvokeOperation('invoke-super');
const arbitraryInvokeDirect = createArbitraryInvokeOperation('invoke-direct');
const arbitraryInvokeStatic = createArbitraryInvokeOperation('invoke-static');
const arbitraryInvokeInterface = createArbitraryInvokeOperation('invoke-interface');

// Invoke-range operations (Format 3rc)
const createArbitraryInvokeRangeOperation = (operation: string) =>
	fc
		.nat({ max: 255 })
		.chain(registerCount =>
			fc.record({
				operation: fc.constant(operation as any),
				registers: fc
					.nat({ max: 65535 - registerCount })
					.map(startRegister =>
						Array.from({ length: registerCount }, (_, i) => startRegister + i)
					),
				methodIndex: arbitraryIndexIntoMethodIds,
			})
		);

const arbitraryInvokeVirtualRange = createArbitraryInvokeRangeOperation('invoke-virtual/range');
const arbitraryInvokeSuperRange = createArbitraryInvokeRangeOperation('invoke-super/range');
const arbitraryInvokeDirectRange = createArbitraryInvokeRangeOperation('invoke-direct/range');
const arbitraryInvokeStaticRange = createArbitraryInvokeRangeOperation('invoke-static/range');
const arbitraryInvokeInterfaceRange = createArbitraryInvokeRangeOperation(
	'invoke-interface/range'
);

// Invoke-polymorphic operations
const arbitraryInvokePolymorphic = fc
	.nat({ max: 5 })
	.chain(registerCount =>
		fc.record({
			operation: fc.constant('invoke-polymorphic' as const),
			registers: fc.array(arbitraryRegister4, {
				minLength: registerCount,
				maxLength: registerCount,
			}),
			methodIndex: arbitraryIndexIntoMethodIds,
			protoIndex: arbitraryIndexIntoPrototypeIds,
		})
	);

const arbitraryInvokePolymorphicRange = fc
	.nat({ max: 255 })
	.chain(registerCount =>
		fc.record({
			operation: fc.constant('invoke-polymorphic/range' as const),
			registers: fc
				.nat({ max: 65535 - registerCount })
				.map(startRegister =>
					Array.from({ length: registerCount }, (_, i) => startRegister + i)
				),
			methodIndex: arbitraryIndexIntoMethodIds,
			protoIndex: arbitraryIndexIntoPrototypeIds,
		})
	);

// Filled-new-array operations
const arbitraryFilledNewArray = fc
	.nat({ max: 5 })
	.chain(registerCount =>
		fc.record({
			operation: fc.constant('filled-new-array' as const),
			registers: fc.array(arbitraryRegister4, {
				minLength: registerCount,
				maxLength: registerCount,
			}),
			typeIndex: arbitraryIndexIntoTypeIds,
		})
	);

const arbitraryFilledNewArrayRange = fc
	.nat({ max: 255 })
	.chain(registerCount =>
		fc.record({
			operation: fc.constant('filled-new-array/range' as const),
			registers: fc
				.nat({ max: 65535 - registerCount })
				.map(startRegister =>
					Array.from({ length: registerCount }, (_, i) => startRegister + i)
				),
			typeIndex: arbitraryIndexIntoTypeIds,
		})
	);

// Binary operations (Format 23x)
const createArbitraryBinaryOperation = (operation: string) =>
	fc.record({
		operation: fc.constant(operation as any),
		registers: fc.tuple(arbitraryRegister8, arbitraryRegister8, arbitraryRegister8),
	});

// Int operations
const arbitraryAddInt = createArbitraryBinaryOperation('add-int');
const arbitrarySubInt = createArbitraryBinaryOperation('sub-int');
const arbitraryMulInt = createArbitraryBinaryOperation('mul-int');
const arbitraryDivInt = createArbitraryBinaryOperation('div-int');
const arbitraryRemInt = createArbitraryBinaryOperation('rem-int');
const arbitraryAndInt = createArbitraryBinaryOperation('and-int');
const arbitraryOrInt = createArbitraryBinaryOperation('or-int');
const arbitraryXorInt = createArbitraryBinaryOperation('xor-int');
const arbitraryShlInt = createArbitraryBinaryOperation('shl-int');
const arbitraryShrInt = createArbitraryBinaryOperation('shr-int');
const arbitraryUshrInt = createArbitraryBinaryOperation('ushr-int');

// Long operations
const arbitraryAddLong = createArbitraryBinaryOperation('add-long');
const arbitrarySubLong = createArbitraryBinaryOperation('sub-long');
const arbitraryMulLong = createArbitraryBinaryOperation('mul-long');
const arbitraryDivLong = createArbitraryBinaryOperation('div-long');
const arbitraryRemLong = createArbitraryBinaryOperation('rem-long');
const arbitraryAndLong = createArbitraryBinaryOperation('and-long');
const arbitraryOrLong = createArbitraryBinaryOperation('or-long');
const arbitraryXorLong = createArbitraryBinaryOperation('xor-long');
const arbitraryShlLong = createArbitraryBinaryOperation('shl-long');
const arbitraryShrLong = createArbitraryBinaryOperation('shr-long');
const arbitraryUshrLong = createArbitraryBinaryOperation('ushr-long');

// Float operations
const arbitraryAddFloat = createArbitraryBinaryOperation('add-float');
const arbitrarySubFloat = createArbitraryBinaryOperation('sub-float');
const arbitraryMulFloat = createArbitraryBinaryOperation('mul-float');
const arbitraryDivFloat = createArbitraryBinaryOperation('div-float');

// Double operations
const arbitraryAddDouble = createArbitraryBinaryOperation('add-double');
const arbitrarySubDouble = createArbitraryBinaryOperation('sub-double');
const arbitraryMulDouble = createArbitraryBinaryOperation('mul-double');
const arbitraryDivDouble = createArbitraryBinaryOperation('div-double');
const arbitraryRemDouble = createArbitraryBinaryOperation('rem-double');

// Compare operations
const arbitraryCmpLong = createArbitraryBinaryOperation('cmp-long');
const arbitraryCmplFloat = createArbitraryBinaryOperation('cmpl-float');
const arbitraryCmpgFloat = createArbitraryBinaryOperation('cmpg-float');
const arbitraryCmplDouble = createArbitraryBinaryOperation('cmpl-double');
const arbitraryCmpgDouble = createArbitraryBinaryOperation('cmpg-double');

// Binary operations in-place (Format 12x)
const createArbitraryBinaryOperationInPlace = (operation: string) =>
	fc.record({
		operation: fc.constant(operation as any),
		registers: fc.tuple(arbitraryRegister4, arbitraryRegister4),
	});

const arbitraryAddIntInPlace = createArbitraryBinaryOperationInPlace('add-int/2addr');
const arbitrarySubIntInPlace = createArbitraryBinaryOperationInPlace('sub-int/2addr');
const arbitraryMulIntInPlace = createArbitraryBinaryOperationInPlace('mul-int/2addr');
const arbitraryDivIntInPlace = createArbitraryBinaryOperationInPlace('div-int/2addr');
const arbitraryRemIntInPlace = createArbitraryBinaryOperationInPlace('rem-int/2addr');
const arbitraryAndIntInPlace = createArbitraryBinaryOperationInPlace('and-int/2addr');
const arbitraryOrIntInPlace = createArbitraryBinaryOperationInPlace('or-int/2addr');
const arbitraryXorIntInPlace = createArbitraryBinaryOperationInPlace('xor-int/2addr');
const arbitraryShlIntInPlace = createArbitraryBinaryOperationInPlace('shl-int/2addr');
const arbitraryShrIntInPlace = createArbitraryBinaryOperationInPlace('shr-int/2addr');
const arbitraryUshrIntInPlace = createArbitraryBinaryOperationInPlace('ushr-int/2addr');
const arbitraryAddLongInPlace = createArbitraryBinaryOperationInPlace('add-long/2addr');
const arbitrarySubLongInPlace = createArbitraryBinaryOperationInPlace('sub-long/2addr');
const arbitraryMulLongInPlace = createArbitraryBinaryOperationInPlace('mul-long/2addr');
const arbitraryDivLongInPlace = createArbitraryBinaryOperationInPlace('div-long/2addr');
const arbitraryRemLongInPlace = createArbitraryBinaryOperationInPlace('rem-long/2addr');
const arbitraryAndLongInPlace = createArbitraryBinaryOperationInPlace('and-long/2addr');
const arbitraryOrLongInPlace = createArbitraryBinaryOperationInPlace('or-long/2addr');
const arbitraryXorLongInPlace = createArbitraryBinaryOperationInPlace('xor-long/2addr');
const arbitraryShlLongInPlace = createArbitraryBinaryOperationInPlace('shl-long/2addr');
const arbitraryShrLongInPlace = createArbitraryBinaryOperationInPlace('shr-long/2addr');
const arbitraryUshrLongInPlace = createArbitraryBinaryOperationInPlace('ushr-long/2addr');
const arbitraryAddFloatInPlace = createArbitraryBinaryOperationInPlace('add-float/2addr');
const arbitrarySubFloatInPlace = createArbitraryBinaryOperationInPlace('sub-float/2addr');
const arbitraryMulFloatInPlace = createArbitraryBinaryOperationInPlace('mul-float/2addr');
const arbitraryDivFloatInPlace = createArbitraryBinaryOperationInPlace('div-float/2addr');
const arbitraryRemFloatInPlace = createArbitraryBinaryOperationInPlace('rem-float/2addr');
const arbitraryAddDoubleInPlace = createArbitraryBinaryOperationInPlace('add-double/2addr');
const arbitrarySubDoubleInPlace = createArbitraryBinaryOperationInPlace('sub-double/2addr');
const arbitraryMulDoubleInPlace = createArbitraryBinaryOperationInPlace('mul-double/2addr');
const arbitraryDivDoubleInPlace = createArbitraryBinaryOperationInPlace('div-double/2addr');
const arbitraryRemDoubleInPlace = createArbitraryBinaryOperationInPlace('rem-double/2addr');

// Binary operations with literal8 (Format 22b)
const createArbitraryBinaryOperationLiteral8 = (operation: string) =>
	fc.record({
		operation: fc.constant(operation as any),
		registers: fc.tuple(arbitraryRegister8, arbitraryRegister8),
		value: arbitraryByteValue,
	});

const arbitraryAddIntLiteral8 = createArbitraryBinaryOperationLiteral8('add-int/lit8');
const arbitraryReverseSubtractIntLiteral8 = createArbitraryBinaryOperationLiteral8(
	'rsub-int/lit8'
);
const arbitraryMultiplyIntLiteral8 = createArbitraryBinaryOperationLiteral8('mul-int/lit8');
const arbitraryDivideIntLiteral8 = createArbitraryBinaryOperationLiteral8('div-int/lit8');
const arbitraryRemainderIntLiteral8 = createArbitraryBinaryOperationLiteral8('rem-int/lit8');
const arbitraryAndIntLiteral8 = createArbitraryBinaryOperationLiteral8('and-int/lit8');
const arbitraryOrIntLiteral8 = createArbitraryBinaryOperationLiteral8('or-int/lit8');
const arbitraryXorIntLiteral8 = createArbitraryBinaryOperationLiteral8('xor-int/lit8');
const arbitraryShlIntLiteral8 = createArbitraryBinaryOperationLiteral8('shl-int/lit8');
const arbitraryShrIntLiteral8 = createArbitraryBinaryOperationLiteral8('shr-int/lit8');
const arbitraryUshrIntLiteral8 = createArbitraryBinaryOperationLiteral8('ushr-int/lit8');

// Binary operations with literal16 (Format 22s)
const createArbitraryBinaryOperationLiteral16 = (operation: string) =>
	fc.record({
		operation: fc.constant(operation as any),
		registers: fc.tuple(arbitraryRegister4, arbitraryRegister4),
		value: arbitraryShortValue,
	});

const arbitraryAddIntLiteral16 = createArbitraryBinaryOperationLiteral16('add-int/lit16');
const arbitraryReverseSubtractIntLiteral16 = createArbitraryBinaryOperationLiteral16('rsub-int');
const arbitraryMultiplyIntLiteral16 = createArbitraryBinaryOperationLiteral16('mul-int/lit16');
const arbitraryDivideIntLiteral16 = createArbitraryBinaryOperationLiteral16('div-int/lit16');
const arbitraryRemainderIntLiteral16 = createArbitraryBinaryOperationLiteral16('rem-int/lit16');
const arbitraryAndIntLiteral16 = createArbitraryBinaryOperationLiteral16('and-int/lit16');
const arbitraryOrIntLiteral16 = createArbitraryBinaryOperationLiteral16('or-int/lit16');
const arbitraryXorIntLiteral16 = createArbitraryBinaryOperationLiteral16('xor-int/lit16');

// Unary operations (Format 12x)
const createArbitraryUnaryOperation = (operation: string) =>
	fc.record({
		operation: fc.constant(operation as any),
		registers: fc.tuple(arbitraryRegister4, arbitraryRegister4),
	});

const arbitraryNegateInt = createArbitraryUnaryOperation('neg-int');
const arbitraryNotInt = createArbitraryUnaryOperation('not-int');
const arbitraryNegateLong = createArbitraryUnaryOperation('neg-long');
const arbitraryNotLong = createArbitraryUnaryOperation('not-long');
const arbitraryNegateFloat = createArbitraryUnaryOperation('neg-float');
const arbitraryNegateDouble = createArbitraryUnaryOperation('neg-double');
const arbitraryIntToLong = createArbitraryUnaryOperation('int-to-long');
const arbitraryIntToFloat = createArbitraryUnaryOperation('int-to-float');
const arbitraryIntToDouble = createArbitraryUnaryOperation('int-to-double');
const arbitraryLongToInt = createArbitraryUnaryOperation('long-to-int');
const arbitraryLongToFloat = createArbitraryUnaryOperation('long-to-float');
const arbitraryLongToDouble = createArbitraryUnaryOperation('long-to-double');
const arbitraryFloatToInt = createArbitraryUnaryOperation('float-to-int');
const arbitraryFloatToLong = createArbitraryUnaryOperation('float-to-long');
const arbitraryFloatToDouble = createArbitraryUnaryOperation('float-to-double');
const arbitraryDoubleToInt = createArbitraryUnaryOperation('double-to-int');
const arbitraryDoubleToLong = createArbitraryUnaryOperation('double-to-long');
const arbitraryDoubleToFloat = createArbitraryUnaryOperation('double-to-float');
const arbitraryIntToByte = createArbitraryUnaryOperation('int-to-byte');
const arbitraryIntToChar = createArbitraryUnaryOperation('int-to-char');
const arbitraryIntToShort = createArbitraryUnaryOperation('int-to-short');

// Combine all operations
export const arbitraryRawDalvikBytecodeOperation: fc.Arbitrary<RawDalvikBytecodeOperation> = fc.oneof(
	arbitraryNop,
	// Move operations
	arbitraryMove,
	arbitraryMoveWide,
	arbitraryMoveObject,
	arbitraryMoveFrom16,
	arbitraryMoveWideFrom16,
	arbitraryMoveObjectFrom16,
	arbitraryMoveWide16,
	arbitraryMoveResult,
	arbitraryMoveResultWide,
	arbitraryMoveResultObject,
	arbitraryMoveException,
	// Return operations
	arbitraryReturnVoid,
	arbitraryReturn,
	arbitraryReturnWide,
	arbitraryReturnObject,
	// Const operations
	arbitraryConst4,
	arbitraryConst16,
	arbitraryConst,
	arbitraryConstHigh16,
	arbitraryConstWide16,
	arbitraryConstWide32,
	arbitraryConstWide,
	arbitraryConstWideHigh16,
	arbitraryConstString,
	arbitraryConstStringJumbo,
	arbitraryConstClass,
	arbitraryConstMethodHandle,
	// Monitor operations
	arbitraryMonitorEnter,
	arbitraryMonitorExit,
	// Type operations
	arbitraryCheckCast,
	arbitraryInstanceOf,
	arbitraryNewInstance,
	arbitraryNewArray,
	// Array operations
	arbitraryArrayLength,
	arbitraryThrow,
	// Goto operations
	arbitraryGoto,
	arbitraryGoto16,
	arbitraryGoto32,
	// Switch operations
	arbitraryPackedSwitch,
	arbitrarySparseSwitch,
	arbitraryFillArrayData,
	// Payload operations
	arbitraryPackedSwitchPayload,
	arbitrarySparseSwitchPayload,
	arbitraryFillArrayDataPayload,
	// If-test operations
	arbitraryIfEqual,
	arbitraryIfNotEqual,
	arbitraryIfLessThan,
	arbitraryIfGreaterThanOrEqualTo,
	arbitraryIfGreaterThan,
	arbitraryIfLessThanOrEqualTo,
	// If-test-zero operations
	arbitraryIfEqualZero,
	arbitraryIfNotEqualZero,
	arbitraryIfLessThanZero,
	arbitraryIfGreaterThanOrEqualToZero,
	arbitraryIfGreaterThanZero,
	arbitraryIfLessThanOrEqualToZero,
	// Array element operations
	arbitraryArrayElementGet,
	arbitraryArrayElementGetWide,
	arbitraryArrayElementGetObject,
	arbitraryArrayElementGetBoolean,
	arbitraryArrayElementGetByte,
	arbitraryArrayElementGetChar,
	arbitraryArrayElementGetShort,
	arbitraryArrayElementPut,
	arbitraryArrayElementPutWide,
	arbitraryArrayElementPutObject,
	arbitraryArrayElementPutBoolean,
	arbitraryArrayElementPutByte,
	arbitraryArrayElementPutChar,
	arbitraryArrayElementPutShort,
	// Instance field operations
	arbitraryInstanceFieldGet,
	arbitraryInstanceFieldGetWide,
	arbitraryInstanceFieldGetObject,
	arbitraryInstanceFieldGetBoolean,
	arbitraryInstanceFieldGetByte,
	arbitraryInstanceFieldGetChar,
	arbitraryInstanceFieldGetShort,
	arbitraryInstanceFieldPut,
	arbitraryInstanceFieldPutWide,
	arbitraryInstanceFieldPutObject,
	arbitraryInstanceFieldPutBoolean,
	arbitraryInstanceFieldPutByte,
	arbitraryInstanceFieldPutChar,
	arbitraryInstanceFieldPutShort,
	// Static field operations
	arbitraryStaticFieldGet,
	arbitraryStaticFieldGetWide,
	arbitraryStaticFieldGetObject,
	arbitraryStaticFieldGetBoolean,
	arbitraryStaticFieldGetByte,
	arbitraryStaticFieldGetChar,
	arbitraryStaticFieldGetShort,
	arbitraryStaticFieldPut,
	arbitraryStaticFieldPutWide,
	arbitraryStaticFieldPutObject,
	arbitraryStaticFieldPutBoolean,
	arbitraryStaticFieldPutByte,
	arbitraryStaticFieldPutChar,
	arbitraryStaticFieldPutShort,
	// Invoke operations
	arbitraryInvokeVirtual,
	arbitraryInvokeSuper,
	arbitraryInvokeDirect,
	arbitraryInvokeStatic,
	arbitraryInvokeInterface,
	arbitraryInvokeVirtualRange,
	arbitraryInvokeSuperRange,
	arbitraryInvokeDirectRange,
	arbitraryInvokeStaticRange,
	arbitraryInvokeInterfaceRange,
	arbitraryInvokePolymorphic,
	arbitraryInvokePolymorphicRange,
	// Filled-new-array operations
	arbitraryFilledNewArray,
	arbitraryFilledNewArrayRange,
	// Binary operations
	arbitraryAddInt,
	arbitrarySubInt,
	arbitraryMulInt,
	arbitraryDivInt,
	arbitraryRemInt,
	arbitraryAndInt,
	arbitraryOrInt,
	arbitraryXorInt,
	arbitraryShlInt,
	arbitraryShrInt,
	arbitraryUshrInt,
	arbitraryAddLong,
	arbitrarySubLong,
	arbitraryMulLong,
	arbitraryDivLong,
	arbitraryRemLong,
	arbitraryAndLong,
	arbitraryOrLong,
	arbitraryXorLong,
	arbitraryShlLong,
	arbitraryShrLong,
	arbitraryUshrLong,
	arbitraryAddFloat,
	arbitrarySubFloat,
	arbitraryMulFloat,
	arbitraryDivFloat,
	arbitraryAddDouble,
	arbitrarySubDouble,
	arbitraryMulDouble,
	arbitraryDivDouble,
	arbitraryRemDouble,
	arbitraryCmpLong,
	arbitraryCmplFloat,
	arbitraryCmpgFloat,
	arbitraryCmplDouble,
	arbitraryCmpgDouble,
	// Binary operations in-place
	arbitraryAddIntInPlace,
	arbitrarySubIntInPlace,
	arbitraryMulIntInPlace,
	arbitraryDivIntInPlace,
	arbitraryRemIntInPlace,
	arbitraryAndIntInPlace,
	arbitraryOrIntInPlace,
	arbitraryXorIntInPlace,
	arbitraryShlIntInPlace,
	arbitraryShrIntInPlace,
	arbitraryUshrIntInPlace,
	arbitraryAddLongInPlace,
	arbitrarySubLongInPlace,
	arbitraryMulLongInPlace,
	arbitraryDivLongInPlace,
	arbitraryRemLongInPlace,
	arbitraryAndLongInPlace,
	arbitraryOrLongInPlace,
	arbitraryXorLongInPlace,
	arbitraryShlLongInPlace,
	arbitraryShrLongInPlace,
	arbitraryUshrLongInPlace,
	arbitraryAddFloatInPlace,
	arbitrarySubFloatInPlace,
	arbitraryMulFloatInPlace,
	arbitraryDivFloatInPlace,
	arbitraryRemFloatInPlace,
	arbitraryAddDoubleInPlace,
	arbitrarySubDoubleInPlace,
	arbitraryMulDoubleInPlace,
	arbitraryDivDoubleInPlace,
	arbitraryRemDoubleInPlace,
	// Binary operations with literal8
	arbitraryAddIntLiteral8,
	arbitraryReverseSubtractIntLiteral8,
	arbitraryMultiplyIntLiteral8,
	arbitraryDivideIntLiteral8,
	arbitraryRemainderIntLiteral8,
	arbitraryAndIntLiteral8,
	arbitraryOrIntLiteral8,
	arbitraryXorIntLiteral8,
	arbitraryShlIntLiteral8,
	arbitraryShrIntLiteral8,
	arbitraryUshrIntLiteral8,
	// Binary operations with literal16
	arbitraryAddIntLiteral16,
	arbitraryReverseSubtractIntLiteral16,
	arbitraryMultiplyIntLiteral16,
	arbitraryDivideIntLiteral16,
	arbitraryRemainderIntLiteral16,
	arbitraryAndIntLiteral16,
	arbitraryOrIntLiteral16,
	arbitraryXorIntLiteral16,
	// Unary operations
	arbitraryNegateInt,
	arbitraryNotInt,
	arbitraryNegateLong,
	arbitraryNotLong,
	arbitraryNegateFloat,
	arbitraryNegateDouble,
	arbitraryIntToLong,
	arbitraryIntToFloat,
	arbitraryIntToDouble,
	arbitraryLongToInt,
	arbitraryLongToFloat,
	arbitraryLongToDouble,
	arbitraryFloatToInt,
	arbitraryFloatToLong,
	arbitraryFloatToDouble,
	arbitraryDoubleToInt,
	arbitraryDoubleToLong,
	arbitraryDoubleToFloat,
	arbitraryIntToByte,
	arbitraryIntToChar,
	arbitraryIntToShort
);

// Arbitrary for complete Dalvik bytecode (array of operations)
export const arbitraryRawDalvikBytecode: fc.Arbitrary<RawDalvikBytecode> = fc.array(
	arbitraryRawDalvikBytecodeOperation,
	{ minLength: 0, maxLength: 100 }
);
