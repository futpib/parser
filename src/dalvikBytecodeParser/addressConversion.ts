import { type DalvikBytecodeOperation } from '../dalvikBytecodeParser.js';
import { operationFormats } from './operationFormats.js';
import { formatSizes } from './formatSizes.js';

/**
 * Calculate the size of an operation in code units (16-bit words).
 * This matches the logic in smaliParser.ts getOperationFormatSize.
 */
export function getOperationSizeInCodeUnits(operation: DalvikBytecodeOperation): number {
	if (operation.operation === 'packed-switch-payload') {
		// Header (4 code units) + targets (2 code units each)
		return (operation.branchOffsets.length * 2) + 4;
	}

	if (operation.operation === 'sparse-switch-payload') {
		// Header (2 code units) + keys (2 code units each) + targets (2 code units each)
		return (operation.branchOffsets.length * 4) + 2;
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
): Map<number, number> {
	const map = new Map<number, number>();
	let codeUnitOffset = 0;

	for (let index = 0; index < instructions.length; index++) {
		map.set(codeUnitOffset, index);
		codeUnitOffset += getOperationSizeInCodeUnits(instructions[index]);
	}

	// Map the end position
	map.set(codeUnitOffset, instructions.length);

	return map;
}

/**
 * Build mapping from instruction index to code unit offset.
 * Also maps instructions.length to the total code units.
 */
export function buildIndexToCodeUnitMap(
	instructions: DalvikBytecodeOperation[],
): Map<number, number> {
	const map = new Map<number, number>();
	let codeUnitOffset = 0;

	for (let index = 0; index < instructions.length; index++) {
		map.set(index, codeUnitOffset);
		codeUnitOffset += getOperationSizeInCodeUnits(instructions[index]);
	}

	// Map the end position
	map.set(instructions.length, codeUnitOffset);

	return map;
}

/**
 * Convert a code unit offset to an instruction index.
 */
export function codeUnitToInstructionIndex(
	codeUnitOffset: number,
	codeUnitToIndexMap: Map<number, number>,
): number {
	const index = codeUnitToIndexMap.get(codeUnitOffset);
	if (index === undefined) {
		throw new Error(`Invalid code unit offset: ${codeUnitOffset}. Valid offsets: ${[...codeUnitToIndexMap.keys()].join(', ')}`);
	}

	return index;
}

/**
 * Convert an instruction index to a code unit offset.
 */
export function instructionIndexToCodeUnit(
	instructionIndex: number,
	indexToCodeUnitMap: Map<number, number>,
): number {
	const offset = indexToCodeUnitMap.get(instructionIndex);
	if (offset === undefined) {
		throw new Error(`Invalid instruction index: ${instructionIndex}. Valid indices: ${[...indexToCodeUnitMap.keys()].join(', ')}`);
	}

	return offset;
}

/**
 * Convert a relative branch offset (in code units) to a relative instruction offset.
 * The offset is relative to the source instruction.
 */
export function convertBranchOffsetToInstructionOffset(
	branchOffsetInCodeUnits: number,
	sourceInstructionIndex: number,
	indexToCodeUnitMap: Map<number, number>,
	codeUnitToIndexMap: Map<number, number>,
): number {
	const sourceCodeUnit = indexToCodeUnitMap.get(sourceInstructionIndex);
	if (sourceCodeUnit === undefined) {
		throw new Error(`Invalid source instruction index: ${sourceInstructionIndex}`);
	}

	const targetCodeUnit = sourceCodeUnit + branchOffsetInCodeUnits;
	const targetIndex = codeUnitToIndexMap.get(targetCodeUnit);
	if (targetIndex === undefined) {
		throw new Error(`Invalid branch target code unit: ${targetCodeUnit} (from source ${sourceCodeUnit} + offset ${branchOffsetInCodeUnits})`);
	}

	return targetIndex - sourceInstructionIndex;
}

/**
 * Convert a relative instruction offset back to a code unit offset.
 * The offset is relative to the source instruction.
 */
export function convertInstructionOffsetToBranchOffset(
	instructionOffset: number,
	sourceInstructionIndex: number,
	indexToCodeUnitMap: Map<number, number>,
): number {
	const sourceCodeUnit = indexToCodeUnitMap.get(sourceInstructionIndex);
	if (sourceCodeUnit === undefined) {
		throw new Error(`Invalid source instruction index: ${sourceInstructionIndex}`);
	}

	const targetCodeUnit = indexToCodeUnitMap.get(sourceInstructionIndex + instructionOffset);
	if (targetCodeUnit === undefined) {
		throw new Error(`Invalid target instruction index: ${sourceInstructionIndex + instructionOffset}`);
	}

	return targetCodeUnit - sourceCodeUnit;
}

/**
 * Find the switch instruction that references a payload at the given index.
 * Returns the index of the switch instruction.
 */
export function findSwitchInstructionForPayload(
	instructions: DalvikBytecodeOperation[],
	payloadIndex: number,
	indexToCodeUnitMap: Map<number, number>,
): number {
	const payloadCodeUnit = indexToCodeUnitMap.get(payloadIndex);
	if (payloadCodeUnit === undefined) {
		throw new Error(`Invalid payload index: ${payloadIndex}`);
	}

	for (let i = 0; i < instructions.length; i++) {
		const inst = instructions[i];
		if (
			(inst.operation === 'packed-switch' || inst.operation === 'sparse-switch')
			&& 'branchOffset' in inst
		) {
			const sourceCodeUnit = indexToCodeUnitMap.get(i);
			if (sourceCodeUnit !== undefined && sourceCodeUnit + inst.branchOffset === payloadCodeUnit) {
				return i;
			}
		}
	}

	throw new Error(`No switch instruction found for payload at index ${payloadIndex}`);
}

/**
 * Convert all branch offsets in instructions from code units to instruction offsets.
 * This is a post-processing step after parsing.
 */
export function convertBranchOffsetsToInstructionOffsets(
	instructions: DalvikBytecodeOperation[],
): DalvikBytecodeOperation[] {
	const codeUnitToIndexMap = buildCodeUnitToIndexMap(instructions);
	const indexToCodeUnitMap = buildIndexToCodeUnitMap(instructions);

	return instructions.map((instruction, index) => {
		// Handle single branchOffset (goto, if-*, packed-switch, sparse-switch, fill-array-data)
		if ('branchOffset' in instruction && typeof instruction.branchOffset === 'number') {
			return {
				...instruction,
				branchOffset: convertBranchOffsetToInstructionOffset(
					instruction.branchOffset,
					index,
					indexToCodeUnitMap,
					codeUnitToIndexMap,
				),
			};
		}

		// Handle branchOffsets array (packed-switch-payload, sparse-switch-payload)
		if ('branchOffsets' in instruction && Array.isArray(instruction.branchOffsets)) {
			// For payload instructions, find the referring switch instruction
			const sourceIndex = findSwitchInstructionForPayload(instructions, index, indexToCodeUnitMap);
			return {
				...instruction,
				branchOffsets: instruction.branchOffsets.map(offset =>
					convertBranchOffsetToInstructionOffset(
						offset,
						sourceIndex,
						indexToCodeUnitMap,
						codeUnitToIndexMap,
					),
				),
			};
		}

		return instruction;
	});
}

/**
 * Convert all branch offsets in instructions from instruction offsets back to code units.
 * This is a pre-processing step before unparsing.
 */
export function convertInstructionOffsetsToBranchOffsets(
	instructions: DalvikBytecodeOperation[],
): DalvikBytecodeOperation[] {
	const indexToCodeUnitMap = buildIndexToCodeUnitMap(instructions);

	return instructions.map((instruction, index) => {
		// Handle single branchOffset
		if ('branchOffset' in instruction && typeof instruction.branchOffset === 'number') {
			return {
				...instruction,
				branchOffset: convertInstructionOffsetToBranchOffset(
					instruction.branchOffset,
					index,
					indexToCodeUnitMap,
				),
			};
		}

		// Handle branchOffsets array
		if ('branchOffsets' in instruction && Array.isArray(instruction.branchOffsets)) {
			// For payload instructions, find the referring switch instruction
			// Note: At this point branchOffset in switch is already in instruction offsets
			const sourceIndex = findSwitchInstructionForPayloadByInstructionOffset(instructions, index);
			return {
				...instruction,
				branchOffsets: instruction.branchOffsets.map(offset =>
					convertInstructionOffsetToBranchOffset(
						offset,
						sourceIndex,
						indexToCodeUnitMap,
					),
				),
			};
		}

		return instruction;
	});
}

/**
 * Find the switch instruction that references a payload at the given index,
 * when branch offsets are in instruction offsets (not code units).
 */
function findSwitchInstructionForPayloadByInstructionOffset(
	instructions: DalvikBytecodeOperation[],
	payloadIndex: number,
): number {
	for (let i = 0; i < instructions.length; i++) {
		const inst = instructions[i];
		if (
			(inst.operation === 'packed-switch' || inst.operation === 'sparse-switch')
			&& 'branchOffset' in inst
			&& i + inst.branchOffset === payloadIndex
		) {
			return i;
		}
	}

	throw new Error(`No switch instruction found for payload at index ${payloadIndex}`);
}
