export type CodePointRange = {
	start: number;
	end: number;
};

export type CharacterSet =
	| { type: 'empty' }
	| { type: 'node'; range: CodePointRange; left: CharacterSet; right: CharacterSet };

export type RepeatBounds = number | { min: number; max?: number } | { min?: number; max: number };

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
	| { type: 'lookahead'; isPositive: boolean; inner: RegularExpression; right: RegularExpression }
	| { type: 'start-anchor'; left: RegularExpression; right: RegularExpression }
	| { type: 'end-anchor'; left: RegularExpression; right: RegularExpression };
