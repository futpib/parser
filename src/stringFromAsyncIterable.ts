export async function stringFromAsyncIterable(asyncIterable: AsyncIterable<string>) {
	let string = '';

	for await (const chunk of asyncIterable) {
		string += chunk;
	}

	return string;
}