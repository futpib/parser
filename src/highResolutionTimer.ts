import invariant from 'invariant';
import process from 'node:process';

class HighResolutionSubTimer {
	private _ended = false;

	constructor(
		private readonly _parent: HighResolutionTotalTimer,
		private readonly _start: bigint,
	) {}

	end() {
		invariant(!this._ended, 'Timer already ended.');
		const end = process.hrtime.bigint();
		const time = end - this._start;
		this._parent.add(time);
		this._ended = true;
	}
}

export class HighResolutionTotalTimer {
	private _total = 0n;

	start(): HighResolutionSubTimer {
		return new HighResolutionSubTimer(this, process.hrtime.bigint());
	}

	add(time: bigint) {
		this._total += time;
	}

	get time() {
		return this._total;
	}

	measure<T>(fn: () => T): T {
		const timer = this.start();
		const result = fn();
		timer.end();
		return result;
	}

	async measureAsync<T>(fn: () => Promise<T>): Promise<T> {
		const timer = this.start();
		const result = await fn();
		timer.end();
		return result;
	}
}
