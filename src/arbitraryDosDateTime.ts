import * as fc from 'fast-check';

export const arbitraryDosDateTime = fc.date({
	min: new Date(Date.UTC(1980, 0, 1)),
	max: new Date(Date.UTC(2099, 11, 31)),
}).map(date => {
	date.setSeconds(0);
	date.setMilliseconds(0);
	return date;
});
