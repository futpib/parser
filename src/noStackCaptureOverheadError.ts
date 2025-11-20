
class NoStackCaptureOverheadErrorClass extends Error {}

function NoStackCaptureOverheadErrorConstructor(this: Error, message: string) {
	this.name = 'NoStackCaptureOverheadError';
	this.message = message;
	this.stack = 'This stack is intentionally left blank to avoid capture overhead.';
}

NoStackCaptureOverheadErrorConstructor.prototype = Object.create(Error.prototype);

export const NoStackCaptureOverheadError = NoStackCaptureOverheadErrorConstructor as unknown as typeof NoStackCaptureOverheadErrorClass
