import { type RawDalvikBytecodeOperation, type IndexResolvedOperation } from '../dalvikBytecodeParser.js';
import {
	type CodeUnit, isoCodeUnit,
	type InstructionIndex, isoInstructionIndex,
} from '../dalvikExecutableParser/typedNumbers.js';
import { operationFormats } from './operationFormats.js';
import { formatSizes } from './formatSizes.js';

/**
 * Map from code unit offset to instruction index.
 * Keys are raw code unit offsets, values are instruction indices.
 */
export type CodeUnitToIndexMap = Map<CodeUnit, InstructionIndex>;

/**
 * Map from instruction index to code unit offset.
 * Keys are instruction indices, values are raw code unit offsets.
 */
export type IndexToCodeUnitMap = Map<InstructionIndex, CodeUnit>;

/**
 * Get the branch offsets array length from an operation, regardless of tier.
 * Works with all field name variants: branchOffsetsCodeUnit, branchOffsetsIndex, targetInstructionIndices, branchOffsetIndices.
 */
function getBranchOffsetsLength(operation: { operation: string }): number | undefined {
	const op = operation as any;
	return op.branchOffsetsCodeUnit?.length
		?? op.branchOffsetsIndex?.length
		?? op.targetInstructionIndices?.length
		?? op.branchOffsetIndices?.length;
}

/**
 * Calculate the size of an operation in code units (16-bit words).
 * Works with any tier of operation (Tier 1, 2, 3, or SmaliCodeOperation).
 */
export function getOperationSizeInCodeUnits(operation: { operation: string; data?: Uint8Array | number[] }): number {
	if (operation.operation === 'packed-switch-payload') {
		const length = getBranchOffsetsLength(operation);
		if (length === undefined) {
			throw new Error('packed-switch-payload missing branch offsets array');
		}
		// Header (4 code units) + targets (2 code units each)
		return (length * 2) + 4;
	}

	if (operation.operation === 'sparse-switch-payload') {
		const length = getBranchOffsetsLength(operation);
		if (length === undefined) {
			throw new Error('sparse-switch-payload missing branch offsets array');
		}
		// Header (2 code units) + keys (2 code units each) + targets (2 code units each)
		return (length * 4) + 2;
	}

	if (operation.operation === 'fill-array-data-payload') {
		// data.length is already the total number of bytes (size * elementWidth)
		const dataSize = operation.data!.length;
		const paddingSize = dataSize % 2;
		const totalBytes = 8 + dataSize + paddingSize; // header (8 bytes) + data + padding
		return totalBytes / 2; // Convert to code units
	}

	const format = operationFormats[operation.operation as keyof typeof operationFormats];
	if (!format) {
		throw new Error(`Unknown operation format: ${operation.operation}`);
	}

	return formatSizes[format];
}

/**
 * Build mapping from code unit offset to instruction index.
 * Also maps the end position (total code units) to instructions.length.
 */
export function buildCodeUnitToIndexMap(
	instructions: RawDalvikBytecodeOperation[],
): CodeUnitToIndexMap {
	const map: CodeUnitToIndexMap = new Map();
	let codeUnitOffset = 0;

	for (let index = 0; index < instructions.length; index++) {
		map.set(isoCodeUnit.wrap(codeUnitOffset), isoInstructionIndex.wrap(index));
		codeUnitOffset += getOperationSizeInCodeUnits(instructions[index]);
	}

	// Map the end position
	map.set(isoCodeUnit.wrap(codeUnitOffset), isoInstructionIndex.wrap(instructions.length));

	return map;
}

/**
 * Build mapping from instruction index to code unit offset.
 * Also maps instructions.length to the total code units.
 */
export function buildIndexToCodeUnitMap(
	instructions: RawDalvikBytecodeOperation[],
): IndexToCodeUnitMap {
	const map: IndexToCodeUnitMap = new Map();
	let codeUnitOffset = 0;

	for (let index = 0; index < instructions.length; index++) {
		map.set(isoInstructionIndex.wrap(index), isoCodeUnit.wrap(codeUnitOffset));
		codeUnitOffset += getOperationSizeInCodeUnits(instructions[index]);
	}

	// Map the end position
	map.set(isoInstructionIndex.wrap(instructions.length), isoCodeUnit.wrap(codeUnitOffset));

	return map;
}

/**
 * Convert a code unit offset to an instruction index.
 */
export function codeUnitToInstructionIndex(
	codeUnitOffset: CodeUnit,
	codeUnitToIndexMap: CodeUnitToIndexMap,
): InstructionIndex {
	const index = codeUnitToIndexMap.get(codeUnitOffset);
	if (index === undefined) {
		throw new Error(`Invalid code unit offset: ${isoCodeUnit.unwrap(codeUnitOffset)}. Valid offsets: ${[...codeUnitToIndexMap.keys()].map(k => isoCodeUnit.unwrap(k)).join(', ')}`);
	}

	return index;
}

/**
 * Convert an instruction index to a code unit offset.
 */
export function instructionIndexToCodeUnit(
	instructionIndex: InstructionIndex,
	indexToCodeUnitMap: IndexToCodeUnitMap,
): CodeUnit {
	const offset = indexToCodeUnitMap.get(instructionIndex);
	if (offset === undefined) {
		throw new Error(`Invalid instruction index: ${isoInstructionIndex.unwrap(instructionIndex)}. Valid indices: ${[...indexToCodeUnitMap.keys()].map(k => isoInstructionIndex.unwrap(k)).join(', ')}`);
	}

	return offset;
}

/**
 * Convert a relative branch offset (in code units) to a relative instruction offset.
 * The offset is relative to the source instruction.
 */
export function convertBranchOffsetToInstructionOffset(
	branchOffsetInCodeUnits: CodeUnit,
	sourceInstructionIndex: InstructionIndex,
	indexToCodeUnitMap: IndexToCodeUnitMap,
	codeUnitToIndexMap: CodeUnitToIndexMap,
): InstructionIndex {
	const sourceCodeUnit = indexToCodeUnitMap.get(sourceInstructionIndex);
	if (sourceCodeUnit === undefined) {
		throw new Error(`Invalid source instruction index: ${isoInstructionIndex.unwrap(sourceInstructionIndex)}`);
	}

	const targetCodeUnit = isoCodeUnit.wrap(isoCodeUnit.unwrap(sourceCodeUnit) + isoCodeUnit.unwrap(branchOffsetInCodeUnits));
	const targetIndex = codeUnitToIndexMap.get(targetCodeUnit);
	if (targetIndex === undefined) {
		throw new Error(`Invalid branch target code unit: ${isoCodeUnit.unwrap(targetCodeUnit)} (from source ${isoCodeUnit.unwrap(sourceCodeUnit)} + offset ${isoCodeUnit.unwrap(branchOffsetInCodeUnits)})`);
	}

	return isoInstructionIndex.wrap(isoInstructionIndex.unwrap(targetIndex) - isoInstructionIndex.unwrap(sourceInstructionIndex));
}

/**
 * Convert a relative instruction offset back to a code unit offset.
 * The offset is relative to the source instruction.
 */
export function convertInstructionOffsetToBranchOffset(
	instructionOffset: InstructionIndex,
	sourceInstructionIndex: InstructionIndex,
	indexToCodeUnitMap: IndexToCodeUnitMap,
): CodeUnit {
	const sourceCodeUnit = indexToCodeUnitMap.get(sourceInstructionIndex);
	if (sourceCodeUnit === undefined) {
		throw new Error(`Invalid source instruction index: ${isoInstructionIndex.unwrap(sourceInstructionIndex)}`);
	}

	const targetInstructionIndex = isoInstructionIndex.wrap(isoInstructionIndex.unwrap(sourceInstructionIndex) + isoInstructionIndex.unwrap(instructionOffset));
	const targetCodeUnit = indexToCodeUnitMap.get(targetInstructionIndex);
	if (targetCodeUnit === undefined) {
		throw new Error(`Invalid target instruction index: ${isoInstructionIndex.unwrap(targetInstructionIndex)}`);
	}

	return isoCodeUnit.wrap(isoCodeUnit.unwrap(targetCodeUnit) - isoCodeUnit.unwrap(sourceCodeUnit));
}

/**
 * Find the switch instruction that references a payload at the given index.
 * Returns the index of the switch instruction.
 */
export function findSwitchInstructionForPayload(
	instructions: RawDalvikBytecodeOperation[],
	payloadIndex: InstructionIndex,
	indexToCodeUnitMap: IndexToCodeUnitMap,
): InstructionIndex {
	const payloadCodeUnit = indexToCodeUnitMap.get(payloadIndex);
	if (payloadCodeUnit === undefined) {
		throw new Error(`Invalid payload index: ${isoInstructionIndex.unwrap(payloadIndex)}`);
	}

	for (let i = 0; i < instructions.length; i++) {
		const inst = instructions[i];
		if (
			(inst.operation === 'packed-switch' || inst.operation === 'sparse-switch')
			&& 'branchOffsetCodeUnit' in inst
		) {
			const sourceCodeUnit = indexToCodeUnitMap.get(isoInstructionIndex.wrap(i));
			if (sourceCodeUnit !== undefined && isoCodeUnit.unwrap(sourceCodeUnit) + isoCodeUnit.unwrap(inst.branchOffsetCodeUnit) === isoCodeUnit.unwrap(payloadCodeUnit)) {
				return isoInstructionIndex.wrap(i);
			}
		}
	}

	throw new Error(`No switch instruction found for payload at index ${isoInstructionIndex.unwrap(payloadIndex)}`);
}

// Type for Tier 2: InstructionIndex typed numbers (internal)
export type ConvertedBranchOffsetOperation<T> = T extends { branchOffsetCodeUnit: CodeUnit }
	? Omit<T, 'branchOffsetCodeUnit'> & { branchOffsetIndex: InstructionIndex }
	: T extends { branchOffsetsCodeUnit: CodeUnit[] }
		? Omit<T, 'branchOffsetsCodeUnit'> & { branchOffsetsIndex: InstructionIndex[] }
		: T;

export type ConvertedRawDalvikBytecodeOperation = ConvertedBranchOffsetOperation<RawDalvikBytecodeOperation>;

// Type for Tier 3: plain numbers with absolute instruction indices (public API)
export type ResolvedBranchOffsetOperation<T> = T extends { branchOffsetIndex: InstructionIndex }
	? Omit<T, 'branchOffsetIndex'> & { targetInstructionIndex: number }
	: T extends { branchOffsetsIndex: InstructionIndex[] }
		? Omit<T, 'branchOffsetsIndex'> & { targetInstructionIndices: number[] }
		: T;

// Final public type: applies both branch offset resolution and index resolution
// This ensures methodIndex→method, fieldIndex→field, typeIndex→type, stringIndex→string
export type DalvikBytecodeOperation = IndexResolvedOperation<ResolvedBranchOffsetOperation<ConvertedRawDalvikBytecodeOperation>>;
export type DalvikBytecode = DalvikBytecodeOperation[];

/**
 * Convert all branch offsets in instructions from code units to instruction offsets.
 * Tier 1 (CodeUnit) -> Tier 2 (InstructionIndex)
 */
export function convertBranchOffsetsToInstructionOffsets(
	instructions: RawDalvikBytecodeOperation[],
): ConvertedRawDalvikBytecodeOperation[] {
	const codeUnitToIndexMap = buildCodeUnitToIndexMap(instructions);
	const indexToCodeUnitMap = buildIndexToCodeUnitMap(instructions);

	return instructions.map((instruction, index) => {
		// Handle single branchOffsetCodeUnit (goto, if-*, packed-switch, sparse-switch, fill-array-data)
		if ('branchOffsetCodeUnit' in instruction) {
			const { branchOffsetCodeUnit, ...rest } = instruction;
			return {
				...rest,
				branchOffsetIndex: convertBranchOffsetToInstructionOffset(
					branchOffsetCodeUnit,
					isoInstructionIndex.wrap(index),
					indexToCodeUnitMap,
					codeUnitToIndexMap,
				),
			} as ConvertedRawDalvikBytecodeOperation;
		}

		// Handle branchOffsetsCodeUnit array (packed-switch-payload, sparse-switch-payload)
		if ('branchOffsetsCodeUnit' in instruction) {
			const { branchOffsetsCodeUnit, ...rest } = instruction;
			// For payload instructions, find the referring switch instruction
			const sourceIndex = findSwitchInstructionForPayload(instructions, isoInstructionIndex.wrap(index), indexToCodeUnitMap);
			return {
				...rest,
				branchOffsetsIndex: branchOffsetsCodeUnit.map(offset =>
					convertBranchOffsetToInstructionOffset(
						offset,
						sourceIndex,
						indexToCodeUnitMap,
						codeUnitToIndexMap,
					),
				),
			} as ConvertedRawDalvikBytecodeOperation;
		}

		return instruction as ConvertedRawDalvikBytecodeOperation;
	});
}

/**
 * Unwrap instruction indices to plain numbers and convert relative to absolute.
 * Tier 2 (InstructionIndex, relative) -> Tier 3 (plain number, absolute)
 */
export function unwrapBranchOffsets(
	instructions: ConvertedRawDalvikBytecodeOperation[],
): DalvikBytecodeOperation[] {
	// First pass: find switch instruction indices for payloads
	const payloadToSwitchIndex = new Map<number, number>();
	for (let i = 0; i < instructions.length; i++) {
		const inst = instructions[i];
		if (
			(inst.operation === 'packed-switch' || inst.operation === 'sparse-switch')
			&& 'branchOffsetIndex' in inst
		) {
			const payloadIndex = i + isoInstructionIndex.unwrap(inst.branchOffsetIndex);
			payloadToSwitchIndex.set(payloadIndex, i);
		}
	}

	return instructions.map((instruction, index) => {
		if ('branchOffsetIndex' in instruction) {
			const { branchOffsetIndex, ...rest } = instruction;
			// Convert relative offset to absolute index
			const targetInstructionIndex = index + isoInstructionIndex.unwrap(branchOffsetIndex);
			return {
				...rest,
				targetInstructionIndex,
			} as DalvikBytecodeOperation;
		}

		if ('branchOffsetsIndex' in instruction) {
			const { branchOffsetsIndex, ...rest } = instruction;
			// For payloads, the offsets are relative to the switch instruction, not the payload
			const switchIndex = payloadToSwitchIndex.get(index);
			if (switchIndex === undefined) {
				throw new Error(`No switch instruction found for payload at index ${index}`);
			}
			// Convert relative offsets to absolute indices
			const targetInstructionIndices = branchOffsetsIndex.map(
				offset => switchIndex + isoInstructionIndex.unwrap(offset),
			);
			return {
				...rest,
				targetInstructionIndices,
			} as DalvikBytecodeOperation;
		}

		return instruction as DalvikBytecodeOperation;
	});
}

/**
 * Wrap plain numbers to instruction indices and convert absolute to relative.
 * Tier 3 (plain number, absolute) -> Tier 2 (InstructionIndex, relative)
 */
export function wrapBranchOffsets(
	instructions: DalvikBytecodeOperation[],
): ConvertedRawDalvikBytecodeOperation[] {
	// First pass: find switch instruction indices for payloads
	const payloadToSwitchIndex = new Map<number, number>();
	for (let i = 0; i < instructions.length; i++) {
		const inst = instructions[i];
		if (
			(inst.operation === 'packed-switch' || inst.operation === 'sparse-switch')
			&& 'targetInstructionIndex' in inst
		) {
			const payloadIndex = inst.targetInstructionIndex;
			payloadToSwitchIndex.set(payloadIndex, i);
		}
	}

	return instructions.map((instruction, index) => {
		if ('targetInstructionIndex' in instruction) {
			const { targetInstructionIndex, ...rest } = instruction;
			// Convert absolute index to relative offset
			const branchOffsetIndex = isoInstructionIndex.wrap(targetInstructionIndex - index);
			return {
				...rest,
				branchOffsetIndex,
			} as ConvertedRawDalvikBytecodeOperation;
		}

		if ('targetInstructionIndices' in instruction) {
			const { targetInstructionIndices, ...rest } = instruction;
			// For payloads, the offsets are relative to the switch instruction, not the payload
			const switchIndex = payloadToSwitchIndex.get(index);
			if (switchIndex === undefined) {
				throw new Error(`No switch instruction found for payload at index ${index}`);
			}
			// Convert absolute indices to relative offsets from switch instruction
			const branchOffsetsIndex = targetInstructionIndices.map(
				target => isoInstructionIndex.wrap(target - switchIndex),
			);
			return {
				...rest,
				branchOffsetsIndex,
			} as ConvertedRawDalvikBytecodeOperation;
		}

		return instruction as ConvertedRawDalvikBytecodeOperation;
	});
}

/**
 * Build mapping from instruction index to code unit offset.
 * Works with any tier of operations.
 */
export function buildIndexToCodeUnitMapGeneric(
	instructions: Array<{ operation: string; data?: Uint8Array | number[] }>,
): IndexToCodeUnitMap {
	const map: IndexToCodeUnitMap = new Map();
	let codeUnitOffset = 0;

	for (let index = 0; index < instructions.length; index++) {
		map.set(isoInstructionIndex.wrap(index), isoCodeUnit.wrap(codeUnitOffset));
		codeUnitOffset += getOperationSizeInCodeUnits(instructions[index]);
	}

	// Map the end position
	map.set(isoInstructionIndex.wrap(instructions.length), isoCodeUnit.wrap(codeUnitOffset));

	return map;
}

/**
 * Build mapping from instruction index to code unit offset for Tier 2 operations.
 */
export function buildIndexToCodeUnitMapFromConverted(
	instructions: ConvertedRawDalvikBytecodeOperation[],
): IndexToCodeUnitMap {
	return buildIndexToCodeUnitMapGeneric(instructions);
}

/**
 * Build mapping from instruction index to code unit offset for Tier 3 operations.
 */
export function buildIndexToCodeUnitMapFromResolved(
	instructions: DalvikBytecodeOperation[],
): IndexToCodeUnitMap {
	return buildIndexToCodeUnitMapGeneric(instructions);
}

/**
 * Find the switch instruction that references a payload at the given index,
 * when branch offsets are in instruction indices (Tier 2).
 */
function findSwitchInstructionForPayloadByInstructionIndex(
	instructions: ConvertedRawDalvikBytecodeOperation[],
	payloadIndex: InstructionIndex,
): InstructionIndex {
	for (let i = 0; i < instructions.length; i++) {
		const inst = instructions[i];
		if (
			(inst.operation === 'packed-switch' || inst.operation === 'sparse-switch')
			&& 'branchOffsetIndex' in inst
			&& i + isoInstructionIndex.unwrap(inst.branchOffsetIndex) === isoInstructionIndex.unwrap(payloadIndex)
		) {
			return isoInstructionIndex.wrap(i);
		}
	}

	throw new Error(`No switch instruction found for payload at index ${isoInstructionIndex.unwrap(payloadIndex)}`);
}

/**
 * Convert all branch offsets in instructions from instruction offsets back to code units.
 * Tier 2 (InstructionIndex) -> Tier 1 (CodeUnit)
 */
export function convertInstructionOffsetsToBranchOffsets(
	instructions: ConvertedRawDalvikBytecodeOperation[],
): RawDalvikBytecodeOperation[] {
	const indexToCodeUnitMap = buildIndexToCodeUnitMapFromConverted(instructions);

	return instructions.map((instruction, index) => {
		// Handle single branchOffsetIndex
		if ('branchOffsetIndex' in instruction) {
			const { branchOffsetIndex, ...rest } = instruction;
			return {
				...rest,
				branchOffsetCodeUnit: convertInstructionOffsetToBranchOffset(
					branchOffsetIndex,
					isoInstructionIndex.wrap(index),
					indexToCodeUnitMap,
				),
			} as RawDalvikBytecodeOperation;
		}

		// Handle branchOffsetsIndex array
		if ('branchOffsetsIndex' in instruction) {
			const { branchOffsetsIndex, ...rest } = instruction;
			// For payload instructions, find the referring switch instruction
			const sourceIndex = findSwitchInstructionForPayloadByInstructionIndex(instructions, isoInstructionIndex.wrap(index));
			return {
				...rest,
				branchOffsetsCodeUnit: branchOffsetsIndex.map(offset =>
					convertInstructionOffsetToBranchOffset(
						offset,
						sourceIndex,
						indexToCodeUnitMap,
					),
				),
			} as RawDalvikBytecodeOperation;
		}

		return instruction as RawDalvikBytecodeOperation;
	});
}
