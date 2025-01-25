import { Newtype, iso } from 'newtype-ts';

export interface IndexIntoStringIds extends Newtype<{ readonly IndexIntoStringIds: unique symbol }, number> {}
export const isoIndexIntoStringIds = iso<IndexIntoStringIds>();

export interface IndexIntoTypeIds extends Newtype<{ readonly IndexIntoTypeIds: unique symbol }, number> {}
export const isoIndexIntoTypeIds = iso<IndexIntoTypeIds>();

export interface IndexIntoPrototypeIds extends Newtype<{ readonly IndexIntoPrototypeIds: unique symbol }, number> {}
export const isoIndexIntoPrototypeIds = iso<IndexIntoPrototypeIds>();

export interface IndexIntoFieldIds extends Newtype<{ readonly IndexIntoFieldIds: unique symbol }, number> {}
export const isoIndexIntoFieldIds = iso<IndexIntoFieldIds>();

export interface IndexIntoMethodIds extends Newtype<{ readonly IndexIntoMethodIds: unique symbol }, number> {}
export const isoIndexIntoMethodIds = iso<IndexIntoMethodIds>();

export interface OffsetToStringDataItem extends Newtype<{ readonly OffsetToStringDataItem: unique symbol }, number> {}
export const isoOffsetToStringDataItem = iso<OffsetToStringDataItem>();

export interface OffsetToTypeList extends Newtype<{ readonly OffsetToTypeList: unique symbol }, number> {}
export const isoOffsetToTypeList = iso<OffsetToTypeList>();

export interface OffsetToAnnotationsDirectoryItem extends Newtype<{ readonly OffsetToAnnotationsDirectoryItem: unique symbol }, number> {}
export const isoOffsetToAnnotationsDirectoryItem = iso<OffsetToAnnotationsDirectoryItem>();

export interface OffsetToAnnotationSetItem extends Newtype<{ readonly OffsetToAnnotationSetItem: unique symbol }, number> {}
export const isoOffsetToAnnotationSetItem = iso<OffsetToAnnotationSetItem>();

export interface OffsetToAnnotationSetRefListItem extends Newtype<{ readonly OffsetToAnnotationSetRefListItem: unique symbol }, number> {}
export const isoOffsetToAnnotationSetRefListItem = iso<OffsetToAnnotationSetRefListItem>();

export interface OffsetToClassDataItem extends Newtype<{ readonly OffsetToClassDataItem: unique symbol }, number> {}
export const isoOffsetToClassDataItem = iso<OffsetToClassDataItem>();

export interface OffsetToEncodedArrayItem extends Newtype<{ readonly OffsetToEncodedArrayItem: unique symbol }, number> {}
export const isoOffsetToEncodedArrayItem = iso<OffsetToEncodedArrayItem>();

export interface OffsetToCodeItem extends Newtype<{ readonly OffsetToCodeItem: unique symbol }, number> {}
export const isoOffsetToCodeItem = iso<OffsetToCodeItem>();

export interface OffsetToDebugInfoItem extends Newtype<{ readonly OffsetToDebugInfoItem: unique symbol }, number> {}
export const isoOffsetToDebugInfoItem = iso<OffsetToDebugInfoItem>();

export interface OffsetToAnnotationItem extends Newtype<{ readonly OffsetToAnnotationItem: unique symbol }, number> {}
export const isoOffsetToAnnotationItem = iso<OffsetToAnnotationItem>();

export interface OffsetFromEncodedCatchHandlerListToEncodedCatchHandler extends Newtype<{ readonly OffsetFromEncodedCatchHandlerListToEncodedCatchHandler: unique symbol }, number> {}
export const isoOffsetFromEncodedCatchHandlerListToEncodedCatchHandler = iso<OffsetFromEncodedCatchHandlerListToEncodedCatchHandler>();

export interface TypedNumberArray<IndexType, ValueType> extends Newtype<{ readonly TypedNumberArray: unique symbol }, Array<ValueType>> {
	get length(): number;
	at(index: IndexType): undefined | ValueType;
	map<NewValueType>(fn: (value: ValueType, index: IndexType) => NewValueType): TypedNumberArray<IndexType, NewValueType>;
	[Symbol.iterator](): IterableIterator<ValueType>;
};
export const getIsoTypedNumberArray = <IndexType, ValueType>() => iso<TypedNumberArray<IndexType, ValueType>>();
