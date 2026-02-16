export type CodePointRange = {
	start: number;
	end: number;
};

export type CharacterSet =
	| { type: 'empty' }
	| { type: 'node'; range: CodePointRange; left: CharacterSet; right: CharacterSet };

export type RepeatBounds = number | { min: number; max?: number } | { min?: number; max: number };

export enum AssertionSign {
	POSITIVE = 0,
	NEGATIVE = 1,
}

export enum AssertionDir {
	AHEAD = 0,
	BEHIND = 1,
}

export type RegularExpression =
	| { type: 'epsilon' }
	| { type: 'literal'; charset: CharacterSet }
	| { type: 'concat'; left: RegularExpression; right: RegularExpression }
	| { type: 'union'; left: RegularExpression; right: RegularExpression }
	| { type: 'star'; inner: RegularExpression }
	| { type: 'plus'; inner: RegularExpression }
	| { type: 'optional'; inner: RegularExpression }
	| { type: 'repeat'; inner: RegularExpression; bounds: RepeatBounds }
	| { type: 'capture-group'; inner: RegularExpression; name?: string }
	| { type: 'assertion'; direction: AssertionDir; sign: AssertionSign; inner: RegularExpression; outer: RegularExpression }
	| { type: 'start-anchor'; left: RegularExpression; right: RegularExpression }
	| { type: 'end-anchor'; left: RegularExpression; right: RegularExpression };
