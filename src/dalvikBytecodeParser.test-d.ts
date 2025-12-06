import { expectType } from 'tsd';
import { type DalvikBytecodeOperation } from './dalvikBytecodeParser.js';

// All operations from https://source.android.com/docs/core/runtime/dalvik-bytecode

type DalvikBytecodeOperationName = DalvikBytecodeOperation['operation'];

// Helper to check that a literal type is assignable to the operation name union
const _checkOperation = <T extends DalvikBytecodeOperationName>(_: T) => {};

// nop
_checkOperation('nop');

// move operations
_checkOperation('move');
_checkOperation('move/from16');
_checkOperation('move/16');
_checkOperation('move-wide');
_checkOperation('move-wide/from16');
_checkOperation('move-wide/16');
_checkOperation('move-object');
_checkOperation('move-object/from16');
_checkOperation('move-object/16');

// move-result operations
_checkOperation('move-result');
_checkOperation('move-result-wide');
_checkOperation('move-result-object');
_checkOperation('move-exception');

// return operations
_checkOperation('return-void');
_checkOperation('return');
_checkOperation('return-wide');
_checkOperation('return-object');

// const operations
_checkOperation('const/4');
_checkOperation('const/16');
_checkOperation('const');
_checkOperation('const/high16');
_checkOperation('const-wide/16');
_checkOperation('const-wide/32');
_checkOperation('const-wide');
_checkOperation('const-wide/high16');
_checkOperation('const-string');
_checkOperation('const-string/jumbo');
_checkOperation('const-class');
_checkOperation('const-method-handle');
_checkOperation('const-method-type');

// monitor operations
_checkOperation('monitor-enter');
_checkOperation('monitor-exit');

// type operations
_checkOperation('check-cast');
_checkOperation('instance-of');

// array operations
_checkOperation('array-length');
_checkOperation('new-instance');
_checkOperation('new-array');
_checkOperation('filled-new-array');
_checkOperation('filled-new-array/range');
_checkOperation('fill-array-data');
_checkOperation('fill-array-data-payload');

// throw
_checkOperation('throw');

// goto operations
_checkOperation('goto');
_checkOperation('goto/16');
_checkOperation('goto/32');

// switch operations
_checkOperation('packed-switch');
_checkOperation('packed-switch-payload');
_checkOperation('sparse-switch');
_checkOperation('sparse-switch-payload');

// compare operations
_checkOperation('cmpl-float');
_checkOperation('cmpg-float');
_checkOperation('cmpl-double');
_checkOperation('cmpg-double');
_checkOperation('cmp-long');

// if-test operations
_checkOperation('if-eq');
_checkOperation('if-ne');
_checkOperation('if-lt');
_checkOperation('if-ge');
_checkOperation('if-gt');
_checkOperation('if-le');

// if-testz operations
_checkOperation('if-eqz');
_checkOperation('if-nez');
_checkOperation('if-ltz');
_checkOperation('if-gez');
_checkOperation('if-gtz');
_checkOperation('if-lez');

// aget operations
_checkOperation('aget');
_checkOperation('aget-wide');
_checkOperation('aget-object');
_checkOperation('aget-boolean');
_checkOperation('aget-byte');
_checkOperation('aget-char');
_checkOperation('aget-short');

// aput operations
_checkOperation('aput');
_checkOperation('aput-wide');
_checkOperation('aput-object');
_checkOperation('aput-boolean');
_checkOperation('aput-byte');
_checkOperation('aput-char');
_checkOperation('aput-short');

// iget operations
_checkOperation('iget');
_checkOperation('iget-wide');
_checkOperation('iget-object');
_checkOperation('iget-boolean');
_checkOperation('iget-byte');
_checkOperation('iget-char');
_checkOperation('iget-short');

// iput operations
_checkOperation('iput');
_checkOperation('iput-wide');
_checkOperation('iput-object');
_checkOperation('iput-boolean');
_checkOperation('iput-byte');
_checkOperation('iput-char');
_checkOperation('iput-short');

// sget operations
_checkOperation('sget');
_checkOperation('sget-wide');
_checkOperation('sget-object');
_checkOperation('sget-boolean');
_checkOperation('sget-byte');
_checkOperation('sget-char');
_checkOperation('sget-short');

// sput operations
_checkOperation('sput');
_checkOperation('sput-wide');
_checkOperation('sput-object');
_checkOperation('sput-boolean');
_checkOperation('sput-byte');
_checkOperation('sput-char');
_checkOperation('sput-short');

// invoke operations
_checkOperation('invoke-virtual');
_checkOperation('invoke-super');
_checkOperation('invoke-direct');
_checkOperation('invoke-static');
_checkOperation('invoke-interface');

// invoke/range operations
_checkOperation('invoke-virtual/range');
_checkOperation('invoke-super/range');
_checkOperation('invoke-direct/range');
_checkOperation('invoke-static/range');
_checkOperation('invoke-interface/range');

// invoke-polymorphic operations
_checkOperation('invoke-polymorphic');
_checkOperation('invoke-polymorphic/range');

// invoke-custom operations
_checkOperation('invoke-custom');
_checkOperation('invoke-custom/range');

// unary operations
_checkOperation('neg-int');
_checkOperation('not-int');
_checkOperation('neg-long');
_checkOperation('not-long');
_checkOperation('neg-float');
_checkOperation('neg-double');
_checkOperation('int-to-long');
_checkOperation('int-to-float');
_checkOperation('int-to-double');
_checkOperation('long-to-int');
_checkOperation('long-to-float');
_checkOperation('long-to-double');
_checkOperation('float-to-int');
_checkOperation('float-to-long');
_checkOperation('float-to-double');
_checkOperation('double-to-int');
_checkOperation('double-to-long');
_checkOperation('double-to-float');
_checkOperation('int-to-byte');
_checkOperation('int-to-char');
_checkOperation('int-to-short');

// binary int operations
_checkOperation('add-int');
_checkOperation('sub-int');
_checkOperation('mul-int');
_checkOperation('div-int');
_checkOperation('rem-int');
_checkOperation('and-int');
_checkOperation('or-int');
_checkOperation('xor-int');
_checkOperation('shl-int');
_checkOperation('shr-int');
_checkOperation('ushr-int');

// binary long operations
_checkOperation('add-long');
_checkOperation('sub-long');
_checkOperation('mul-long');
_checkOperation('div-long');
_checkOperation('rem-long');
_checkOperation('and-long');
_checkOperation('or-long');
_checkOperation('xor-long');
_checkOperation('shl-long');
_checkOperation('shr-long');
_checkOperation('ushr-long');

// binary float operations
_checkOperation('add-float');
_checkOperation('sub-float');
_checkOperation('mul-float');
_checkOperation('div-float');
_checkOperation('rem-float');

// binary double operations
_checkOperation('add-double');
_checkOperation('sub-double');
_checkOperation('mul-double');
_checkOperation('div-double');
_checkOperation('rem-double');

// binary int/2addr operations
_checkOperation('add-int/2addr');
_checkOperation('sub-int/2addr');
_checkOperation('mul-int/2addr');
_checkOperation('div-int/2addr');
_checkOperation('rem-int/2addr');
_checkOperation('and-int/2addr');
_checkOperation('or-int/2addr');
_checkOperation('xor-int/2addr');
_checkOperation('shl-int/2addr');
_checkOperation('shr-int/2addr');
_checkOperation('ushr-int/2addr');

// binary long/2addr operations
_checkOperation('add-long/2addr');
_checkOperation('sub-long/2addr');
_checkOperation('mul-long/2addr');
_checkOperation('div-long/2addr');
_checkOperation('rem-long/2addr');
_checkOperation('and-long/2addr');
_checkOperation('or-long/2addr');
_checkOperation('xor-long/2addr');
_checkOperation('shl-long/2addr');
_checkOperation('shr-long/2addr');
_checkOperation('ushr-long/2addr');

// binary float/2addr operations
_checkOperation('add-float/2addr');
_checkOperation('sub-float/2addr');
_checkOperation('mul-float/2addr');
_checkOperation('div-float/2addr');
_checkOperation('rem-float/2addr');

// binary double/2addr operations
_checkOperation('add-double/2addr');
_checkOperation('sub-double/2addr');
_checkOperation('mul-double/2addr');
_checkOperation('div-double/2addr');
_checkOperation('rem-double/2addr');

// binary int/lit16 operations
_checkOperation('add-int/lit16');
_checkOperation('rsub-int');
_checkOperation('mul-int/lit16');
_checkOperation('div-int/lit16');
_checkOperation('rem-int/lit16');
_checkOperation('and-int/lit16');
_checkOperation('or-int/lit16');
_checkOperation('xor-int/lit16');

// binary int/lit8 operations
_checkOperation('add-int/lit8');
_checkOperation('rsub-int/lit8');
_checkOperation('mul-int/lit8');
_checkOperation('div-int/lit8');
_checkOperation('rem-int/lit8');
_checkOperation('and-int/lit8');
_checkOperation('or-int/lit8');
_checkOperation('xor-int/lit8');
_checkOperation('shl-int/lit8');
_checkOperation('shr-int/lit8');
_checkOperation('ushr-int/lit8');

// Verify the type check actually works - this should be a type error
// @ts-expect-error
_checkOperation('fake-operation');
