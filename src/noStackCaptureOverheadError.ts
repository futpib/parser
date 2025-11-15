
class NoStackCaptureOverheadErrorClass extends Error {}

function NoStackCaptureOverheadErrorConstructor(this: Error, message: string) {
	this.name = 'NoStackCaptureOverheadError';
	this.message = message;
}

NoStackCaptureOverheadErrorConstructor.prototype = Error.prototype

export const NoStackCaptureOverheadError = NoStackCaptureOverheadErrorConstructor as unknown as typeof NoStackCaptureOverheadErrorClass
