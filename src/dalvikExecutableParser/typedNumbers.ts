import { type Newtype, iso } from 'newtype-ts';

export type IndexIntoStringIds = {} & Newtype<{ readonly IndexIntoStringIds: unique symbol }, number>;
export const isoIndexIntoStringIds = iso<IndexIntoStringIds>();

export type IndexIntoTypeIds = {} & Newtype<{ readonly IndexIntoTypeIds: unique symbol }, number>;
export const isoIndexIntoTypeIds = iso<IndexIntoTypeIds>();

export type IndexIntoPrototypeIds = {} & Newtype<{ readonly IndexIntoPrototypeIds: unique symbol }, number>;
export const isoIndexIntoPrototypeIds = iso<IndexIntoPrototypeIds>();

export type IndexIntoFieldIds = {} & Newtype<{ readonly IndexIntoFieldIds: unique symbol }, number>;
export const isoIndexIntoFieldIds = iso<IndexIntoFieldIds>();

export type IndexIntoMethodIds = {} & Newtype<{ readonly IndexIntoMethodIds: unique symbol }, number>;
export const isoIndexIntoMethodIds = iso<IndexIntoMethodIds>();

export type IndexIntoCallSiteIds = {} & Newtype<{ readonly IndexIntoCallSiteIds: unique symbol }, number>;
export const isoIndexIntoCallSiteIds = iso<IndexIntoCallSiteIds>();

export type OffsetToStringDataItem = {} & Newtype<{ readonly OffsetToStringDataItem: unique symbol }, number>;
export const isoOffsetToStringDataItem = iso<OffsetToStringDataItem>();

export type OffsetToTypeList = {} & Newtype<{ readonly OffsetToTypeList: unique symbol }, number>;
export const isoOffsetToTypeList = iso<OffsetToTypeList>();

export type OffsetToAnnotationsDirectoryItem = {} & Newtype<{ readonly OffsetToAnnotationsDirectoryItem: unique symbol }, number>;
export const isoOffsetToAnnotationsDirectoryItem = iso<OffsetToAnnotationsDirectoryItem>();

export type OffsetToAnnotationSetItem = {} & Newtype<{ readonly OffsetToAnnotationSetItem: unique symbol }, number>;
export const isoOffsetToAnnotationSetItem = iso<OffsetToAnnotationSetItem>();

export type OffsetToAnnotationSetRefListItem = {} & Newtype<{ readonly OffsetToAnnotationSetRefListItem: unique symbol }, number>;
export const isoOffsetToAnnotationSetRefListItem = iso<OffsetToAnnotationSetRefListItem>();

export type OffsetToClassDataItem = {} & Newtype<{ readonly OffsetToClassDataItem: unique symbol }, number>;
export const isoOffsetToClassDataItem = iso<OffsetToClassDataItem>();

export type OffsetToEncodedArrayItem = {} & Newtype<{ readonly OffsetToEncodedArrayItem: unique symbol }, number>;
export const isoOffsetToEncodedArrayItem = iso<OffsetToEncodedArrayItem>();

export type OffsetToCodeItem = {} & Newtype<{ readonly OffsetToCodeItem: unique symbol }, number>;
export const isoOffsetToCodeItem = iso<OffsetToCodeItem>();

export type OffsetToDebugInfoItem = {} & Newtype<{ readonly OffsetToDebugInfoItem: unique symbol }, number>;
export const isoOffsetToDebugInfoItem = iso<OffsetToDebugInfoItem>();

export type OffsetToAnnotationItem = {} & Newtype<{ readonly OffsetToAnnotationItem: unique symbol }, number>;
export const isoOffsetToAnnotationItem = iso<OffsetToAnnotationItem>();

export type OffsetFromEncodedCatchHandlerListToEncodedCatchHandler = {} & Newtype<{ readonly OffsetFromEncodedCatchHandlerListToEncodedCatchHandler: unique symbol }, number>;
export const isoOffsetFromEncodedCatchHandlerListToEncodedCatchHandler = iso<OffsetFromEncodedCatchHandlerListToEncodedCatchHandler>();

export type TypedNumberArray<IndexType, ValueType> = {
	get length(): number;
	at(index: IndexType): undefined | ValueType;
	map<NewValueType>(fn: (value: ValueType, index: IndexType) => NewValueType): TypedNumberArray<IndexType, NewValueType>;
	[Symbol.iterator](): IterableIterator<ValueType>;
} & Newtype<{ readonly TypedNumberArray: unique symbol }, ValueType[]>;
export const getIsoTypedNumberArray = <IndexType, ValueType>() => iso<TypedNumberArray<IndexType, ValueType>>();
