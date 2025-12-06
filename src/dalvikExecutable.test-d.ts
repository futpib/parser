import { expectType } from 'tsd';
import {
	type DalvikExecutable,
	type DalvikExecutableCode,
} from './dalvikExecutable.js';
import { type ResolvedDalvikBytecodeOperation } from './dalvikBytecodeParser/addressConversion.js';

// Test that DalvikExecutable instruction index fields use plain number types
// This ensures typed numbers (CodeUnit, InstructionIndex) do not leak into the public API

type Instructions = ResolvedDalvikBytecodeOperation[];

// Test try/catch block types
declare const dex: DalvikExecutable<Instructions>;
declare const code: DalvikExecutableCode<Instructions>;

// Try block field types
const tryBlock = code.tries[0];
expectType<number>(tryBlock.startInstructionIndex);
expectType<number>(tryBlock.instructionCount);

// Handler field types
const handler = tryBlock.handler;
expectType<number | undefined>(handler.catchAllInstructionIndex);

// Type-address pair field types
const typeAddressPair = handler.handlers[0];
expectType<number>(typeAddressPair.handlerInstructionIndex);

// Test bytecode operation types - branch offsets should be plain numbers
type GotoOperation = Extract<ResolvedDalvikBytecodeOperation, { operation: 'goto' }>;
declare const gotoOp: GotoOperation;
expectType<number>(gotoOp.targetInstructionIndex);

type Goto16Operation = Extract<ResolvedDalvikBytecodeOperation, { operation: 'goto/16' }>;
declare const goto16Op: Goto16Operation;
expectType<number>(goto16Op.targetInstructionIndex);

type Goto32Operation = Extract<ResolvedDalvikBytecodeOperation, { operation: 'goto/32' }>;
declare const goto32Op: Goto32Operation;
expectType<number>(goto32Op.targetInstructionIndex);

type PackedSwitchOperation = Extract<ResolvedDalvikBytecodeOperation, { operation: 'packed-switch' }>;
declare const packedSwitchOp: PackedSwitchOperation;
expectType<number>(packedSwitchOp.targetInstructionIndex);

type SparseSwitchOperation = Extract<ResolvedDalvikBytecodeOperation, { operation: 'sparse-switch' }>;
declare const sparseSwitchOp: SparseSwitchOperation;
expectType<number>(sparseSwitchOp.targetInstructionIndex);

type PackedSwitchPayloadOperation = Extract<ResolvedDalvikBytecodeOperation, { operation: 'packed-switch-payload' }>;
declare const packedSwitchPayloadOp: PackedSwitchPayloadOperation;
expectType<number[]>(packedSwitchPayloadOp.targetInstructionIndices);

type SparseSwitchPayloadOperation = Extract<ResolvedDalvikBytecodeOperation, { operation: 'sparse-switch-payload' }>;
declare const sparseSwitchPayloadOp: SparseSwitchPayloadOperation;
expectType<number[]>(sparseSwitchPayloadOp.targetInstructionIndices);

type FillArrayDataOperation = Extract<ResolvedDalvikBytecodeOperation, { operation: 'fill-array-data' }>;
declare const fillArrayDataOp: FillArrayDataOperation;
expectType<number>(fillArrayDataOp.targetInstructionIndex);

type IfEqOperation = Extract<ResolvedDalvikBytecodeOperation, { operation: 'if-eq' }>;
declare const ifEqOp: IfEqOperation;
expectType<number>(ifEqOp.targetInstructionIndex);

type IfEqzOperation = Extract<ResolvedDalvikBytecodeOperation, { operation: 'if-eqz' }>;
declare const ifEqzOp: IfEqzOperation;
expectType<number>(ifEqzOp.targetInstructionIndex);
