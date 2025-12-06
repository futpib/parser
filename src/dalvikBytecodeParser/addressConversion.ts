import { type DalvikBytecodeOperation } from '../dalvikBytecodeParser.js';
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
 * Calculate the size of an operation in code units (16-bit words).
 * This matches the logic in smaliParser.ts getOperationFormatSize.
 */
export function getOperationSizeInCodeUnits(operation: DalvikBytecodeOperation): number {
	if (operation.operation === 'packed-switch-payload') {
		// Header (4 code units) + targets (2 code units each)
		return (operation.branchOffsetsCodeUnit.length * 2) + 4;
	}

	if (operation.operation === 'sparse-switch-payload') {
		// Header (2 code units) + keys (2 code units each) + targets (2 code units each)
		return (operation.branchOffsetsCodeUnit.length * 4) + 2;
	}

	if (operation.operation === 'fill-array-data-payload') {
		// data.length is already the total number of bytes (size * elementWidth)
		const dataSize = operation.data.length;
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
	instructions: DalvikBytecodeOperation[],
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
	instructions: DalvikBytecodeOperation[],
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
	instructions: DalvikBytecodeOperation[],
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

// Type for Tier 2: InstructionIndex typed numbers
export type ConvertedBranchOffsetOperation<T> = T extends { branchOffsetCodeUnit: CodeUnit }
	? Omit<T, 'branchOffsetCodeUnit'> & { branchOffsetIndex: InstructionIndex }
	: T extends { branchOffsetsCodeUnit: CodeUnit[] }
		? Omit<T, 'branchOffsetsCodeUnit'> & { branchOffsetsIndex: InstructionIndex[] }
		: T;

export type ConvertedDalvikBytecodeOperation = ConvertedBranchOffsetOperation<DalvikBytecodeOperation>;

// Type for Tier 3: plain numbers (final unwrapped form)
export type ResolvedBranchOffsetOperation<T> = T extends { branchOffsetIndex: InstructionIndex }
	? Omit<T, 'branchOffsetIndex'> & { branchOffset: number }
	: T extends { branchOffsetsIndex: InstructionIndex[] }
		? Omit<T, 'branchOffsetsIndex'> & { branchOffsets: number[] }
		: T;

export type ResolvedDalvikBytecodeOperation = ResolvedBranchOffsetOperation<ConvertedDalvikBytecodeOperation>;

/**
 * Convert all branch offsets in instructions from code units to instruction offsets.
 * Tier 1 (CodeUnit) -> Tier 2 (InstructionIndex)
 */
export function convertBranchOffsetsToInstructionOffsets(
	instructions: DalvikBytecodeOperation[],
): ConvertedDalvikBytecodeOperation[] {
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
			} as ConvertedDalvikBytecodeOperation;
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
			} as ConvertedDalvikBytecodeOperation;
		}

		return instruction as ConvertedDalvikBytecodeOperation;
	});
}

/**
 * Unwrap instruction indices to plain numbers.
 * Tier 2 (InstructionIndex) -> Tier 3 (plain number)
 */
export function unwrapBranchOffsets(
	instructions: ConvertedDalvikBytecodeOperation[],
): ResolvedDalvikBytecodeOperation[] {
	return instructions.map(instruction => {
		if ('branchOffsetIndex' in instruction) {
			const { branchOffsetIndex, ...rest } = instruction;
			return {
				...rest,
				branchOffset: isoInstructionIndex.unwrap(branchOffsetIndex),
			} as ResolvedDalvikBytecodeOperation;
		}

		if ('branchOffsetsIndex' in instruction) {
			const { branchOffsetsIndex, ...rest } = instruction;
			return {
				...rest,
				branchOffsets: branchOffsetsIndex.map(isoInstructionIndex.unwrap),
			} as ResolvedDalvikBytecodeOperation;
		}

		return instruction as ResolvedDalvikBytecodeOperation;
	});
}

/**
 * Wrap plain numbers to instruction indices.
 * Tier 3 (plain number) -> Tier 2 (InstructionIndex)
 */
export function wrapBranchOffsets(
	instructions: ResolvedDalvikBytecodeOperation[],
): ConvertedDalvikBytecodeOperation[] {
	return instructions.map(instruction => {
		if ('branchOffset' in instruction) {
			const { branchOffset, ...rest } = instruction;
			return {
				...rest,
				branchOffsetIndex: isoInstructionIndex.wrap(branchOffset),
			} as ConvertedDalvikBytecodeOperation;
		}

		if ('branchOffsets' in instruction) {
			const { branchOffsets, ...rest } = instruction;
			return {
				...rest,
				branchOffsetsIndex: branchOffsets.map(isoInstructionIndex.wrap),
			} as ConvertedDalvikBytecodeOperation;
		}

		return instruction as ConvertedDalvikBytecodeOperation;
	});
}

/**
 * Calculate the size of a Tier 2 operation in code units (16-bit words).
 */
export function getConvertedOperationSizeInCodeUnits(operation: ConvertedDalvikBytecodeOperation): number {
	if (operation.operation === 'packed-switch-payload') {
		// Header (4 code units) + targets (2 code units each)
		return ((operation as any).branchOffsetsIndex.length * 2) + 4;
	}

	if (operation.operation === 'sparse-switch-payload') {
		// Header (2 code units) + keys (2 code units each) + targets (2 code units each)
		return ((operation as any).branchOffsetsIndex.length * 4) + 2;
	}

	if (operation.operation === 'fill-array-data-payload') {
		// data.length is already the total number of bytes (size * elementWidth)
		const dataSize = operation.data.length;
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
 * Build mapping from instruction index to code unit offset for Tier 2 operations.
 */
export function buildIndexToCodeUnitMapFromConverted(
	instructions: ConvertedDalvikBytecodeOperation[],
): IndexToCodeUnitMap {
	const map: IndexToCodeUnitMap = new Map();
	let codeUnitOffset = 0;

	for (let index = 0; index < instructions.length; index++) {
		map.set(isoInstructionIndex.wrap(index), isoCodeUnit.wrap(codeUnitOffset));
		codeUnitOffset += getConvertedOperationSizeInCodeUnits(instructions[index]);
	}

	// Map the end position
	map.set(isoInstructionIndex.wrap(instructions.length), isoCodeUnit.wrap(codeUnitOffset));

	return map;
}

/**
 * Calculate the size of a Tier 3 operation in code units (16-bit words).
 */
export function getResolvedOperationSizeInCodeUnits(operation: ResolvedDalvikBytecodeOperation): number {
	if (operation.operation === 'packed-switch-payload') {
		// Header (4 code units) + targets (2 code units each)
		return ((operation as any).branchOffsets.length * 2) + 4;
	}

	if (operation.operation === 'sparse-switch-payload') {
		// Header (2 code units) + keys (2 code units each) + targets (2 code units each)
		return ((operation as any).branchOffsets.length * 4) + 2;
	}

	if (operation.operation === 'fill-array-data-payload') {
		// data.length is already the total number of bytes (size * elementWidth)
		const dataSize = operation.data.length;
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
 * Build mapping from instruction index to code unit offset for Tier 3 operations.
 */
export function buildIndexToCodeUnitMapFromResolved(
	instructions: ResolvedDalvikBytecodeOperation[],
): IndexToCodeUnitMap {
	const map: IndexToCodeUnitMap = new Map();
	let codeUnitOffset = 0;

	for (let index = 0; index < instructions.length; index++) {
		map.set(isoInstructionIndex.wrap(index), isoCodeUnit.wrap(codeUnitOffset));
		codeUnitOffset += getResolvedOperationSizeInCodeUnits(instructions[index]);
	}

	// Map the end position
	map.set(isoInstructionIndex.wrap(instructions.length), isoCodeUnit.wrap(codeUnitOffset));

	return map;
}

/**
 * Find the switch instruction that references a payload at the given index,
 * when branch offsets are in instruction indices (Tier 2).
 */
function findSwitchInstructionForPayloadByInstructionIndex(
	instructions: ConvertedDalvikBytecodeOperation[],
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
	instructions: ConvertedDalvikBytecodeOperation[],
): DalvikBytecodeOperation[] {
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
			} as DalvikBytecodeOperation;
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
			} as DalvikBytecodeOperation;
		}

		return instruction as DalvikBytecodeOperation;
	});
}
