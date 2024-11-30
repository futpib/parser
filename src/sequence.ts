
export type DeriveSequenceElement<Sequence> = (
	Sequence extends string
		? string
		: (
			Sequence extends Uint8Array
				? number
				: never
		)
);
