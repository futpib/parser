import { expectType } from 'tsd';
import { type ParserOutput } from './parser.js';
import { dalvikExecutableParser } from './dalvikExecutableParser.js';

// Test that DalvikExecutable instruction index fields use plain number types
// This ensures typed numbers (CodeUnit, InstructionIndex) do not leak into the public API

// Derive types from the actual parser output
type ParsedDalvikExecutable = ParserOutput<typeof dalvikExecutableParser>;
type ParsedClassDefinition = ParsedDalvikExecutable['classDefinitions'][number];
type ParsedClassData = NonNullable<ParsedClassDefinition['classData']>;
type ParsedMethod = ParsedClassData['directMethods'][number];
type ParsedCode = NonNullable<ParsedMethod['code']>;
type ParsedInstructions = ParsedCode['instructions'];
type ParsedOperation = ParsedInstructions[number];

// Test try/catch block types
declare const dex: ParsedDalvikExecutable;
const classDef = dex.classDefinitions[0];
const classData = classDef.classData!;
const method = classData.directMethods[0];
const code = method.code!;

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
type GotoOperation = Extract<ParsedOperation, { operation: 'goto' }>;
declare const gotoOp: GotoOperation;
expectType<number>(gotoOp.targetInstructionIndex);

type Goto16Operation = Extract<ParsedOperation, { operation: 'goto/16' }>;
declare const goto16Op: Goto16Operation;
expectType<number>(goto16Op.targetInstructionIndex);

type Goto32Operation = Extract<ParsedOperation, { operation: 'goto/32' }>;
declare const goto32Op: Goto32Operation;
expectType<number>(goto32Op.targetInstructionIndex);

type PackedSwitchOperation = Extract<ParsedOperation, { operation: 'packed-switch' }>;
declare const packedSwitchOp: PackedSwitchOperation;
expectType<number>(packedSwitchOp.targetInstructionIndex);

type SparseSwitchOperation = Extract<ParsedOperation, { operation: 'sparse-switch' }>;
declare const sparseSwitchOp: SparseSwitchOperation;
expectType<number>(sparseSwitchOp.targetInstructionIndex);

type PackedSwitchPayloadOperation = Extract<ParsedOperation, { operation: 'packed-switch-payload' }>;
declare const packedSwitchPayloadOp: PackedSwitchPayloadOperation;
expectType<number[]>(packedSwitchPayloadOp.targetInstructionIndices);

type SparseSwitchPayloadOperation = Extract<ParsedOperation, { operation: 'sparse-switch-payload' }>;
declare const sparseSwitchPayloadOp: SparseSwitchPayloadOperation;
expectType<number[]>(sparseSwitchPayloadOp.targetInstructionIndices);

type FillArrayDataOperation = Extract<ParsedOperation, { operation: 'fill-array-data' }>;
declare const fillArrayDataOp: FillArrayDataOperation;
expectType<number>(fillArrayDataOp.targetInstructionIndex);

type IfEqOperation = Extract<ParsedOperation, { operation: 'if-eq' }>;
declare const ifEqOp: IfEqOperation;
expectType<number>(ifEqOp.targetInstructionIndex);

type IfEqzOperation = Extract<ParsedOperation, { operation: 'if-eqz' }>;
declare const ifEqzOp: IfEqzOperation;
expectType<number>(ifEqzOp.targetInstructionIndex);

// Test that index fields are resolved to their actual types (not raw indices)
// Operations with methodIndex should have method: DalvikExecutableMethod
type InvokeVirtualOperation = Extract<ParsedOperation, { operation: 'invoke-virtual' }>;
declare const invokeVirtualOp: InvokeVirtualOperation;
expectType<{ class: string; prototype: { shorty: string; returnType: string; parameters: string[] }; name: string }>(invokeVirtualOp.method);

// Operations with fieldIndex should have field: DalvikExecutableField
type IgetOperation = Extract<ParsedOperation, { operation: 'iget' }>;
declare const igetOp: IgetOperation;
expectType<{ class: string; type: string; name: string }>(igetOp.field);

// Operations with typeIndex should have type: string
type CheckCastOperation = Extract<ParsedOperation, { operation: 'check-cast' }>;
declare const checkCastOp: CheckCastOperation;
expectType<string>(checkCastOp.type);

// Operations with stringIndex should have string: string
type ConstStringOperation = Extract<ParsedOperation, { operation: 'const-string' }>;
declare const constStringOp: ConstStringOperation;
expectType<string>(constStringOp.string);
