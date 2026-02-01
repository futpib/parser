export function unescapeZigString(raw: string): string {
	let result = '';
	let i = 0;
	while (i < raw.length) {
		if (raw[i] === '\\' && i + 1 < raw.length) {
			const next = raw[i + 1]!;
			switch (next) {
				case 'n':
					result += '\n';
					i += 2;
					break;
				case 't':
					result += '\t';
					i += 2;
					break;
				case 'r':
					result += '\r';
					i += 2;
					break;
				case '\\':
					result += '\\';
					i += 2;
					break;
				case '"':
					result += '"';
					i += 2;
					break;
				case '\'':
					result += '\'';
					i += 2;
					break;
				case 'x': {
					const hex = raw.slice(i + 2, i + 4);
					result += String.fromCharCode(parseInt(hex, 16));
					i += 4;
					break;
				}

				case 'u': {
					// \u{H+}
					const closeBrace = raw.indexOf('}', i + 3);
					const hex = raw.slice(i + 3, closeBrace);
					result += String.fromCodePoint(parseInt(hex, 16));
					i = closeBrace + 1;
					break;
				}

				default:
					result += raw[i];
					i++;
					break;
			}
		} else {
			result += raw[i];
			i++;
		}
	}

	return result;
}

export function escapeZigString(value: string): string {
	let result = '';
	for (const ch of value) {
		const code = ch.codePointAt(0)!;
		switch (ch) {
			case '\\':
				result += '\\\\';
				break;
			case '"':
				result += '\\"';
				break;
			case '\n':
				result += '\\n';
				break;
			case '\r':
				result += '\\r';
				break;
			case '\t':
				result += '\\t';
				break;
			default:
				if (code < 0x20) {
					result += '\\x' + code.toString(16).padStart(2, '0');
				} else if (code > 0x7E && code > 0xFFFF) {
					result += '\\u{' + code.toString(16) + '}';
				} else {
					result += ch;
				}

				break;
		}
	}

	return result;
}

export function escapeZigChar(value: string): string {
	let result = '';
	for (const ch of value) {
		const code = ch.codePointAt(0)!;
		switch (ch) {
			case '\\':
				result += '\\\\';
				break;
			case '\'':
				result += '\\\'';
				break;
			case '\n':
				result += '\\n';
				break;
			case '\r':
				result += '\\r';
				break;
			case '\t':
				result += '\\t';
				break;
			default:
				if (code < 0x20) {
					result += '\\x' + code.toString(16).padStart(2, '0');
				} else if (code > 0x7E && code > 0xFFFF) {
					result += '\\u{' + code.toString(16) + '}';
				} else {
					result += ch;
				}

				break;
		}
	}

	return result;
}

export function unescapeJavaString(raw: string): string {
	let result = '';
	let i = 0;
	while (i < raw.length) {
		if (raw[i] === '\\' && i + 1 < raw.length) {
			const next = raw[i + 1]!;
			switch (next) {
				case 'n':
					result += '\n';
					i += 2;
					break;
				case 't':
					result += '\t';
					i += 2;
					break;
				case 'r':
					result += '\r';
					i += 2;
					break;
				case 'b':
					result += '\b';
					i += 2;
					break;
				case 'f':
					result += '\f';
					i += 2;
					break;
				case '\\':
					result += '\\';
					i += 2;
					break;
				case '"':
					result += '"';
					i += 2;
					break;
				case '\'':
					result += '\'';
					i += 2;
					break;
				case 'u': {
					const hex = raw.slice(i + 2, i + 6);
					result += String.fromCharCode(parseInt(hex, 16));
					i += 6;
					break;
				}

				default: {
					// Octal escape: \0 - \377
					if (next >= '0' && next <= '7') {
						let octal = next;
						let j = i + 2;
						// Up to 3 octal digits, max value 377 (0xFF)
						if (j < raw.length && raw[j]! >= '0' && raw[j]! <= '7') {
							octal += raw[j]!;
							j++;
							if (j < raw.length && raw[j]! >= '0' && raw[j]! <= '7' && parseInt(octal + raw[j]!, 8) <= 0xFF) {
								octal += raw[j]!;
								j++;
							}
						}

						result += String.fromCharCode(parseInt(octal, 8));
						i = j;
					} else {
						result += raw[i];
						i++;
					}

					break;
				}
			}
		} else {
			result += raw[i];
			i++;
		}
	}

	return result;
}

export function escapeJavaString(value: string): string {
	let result = '';
	for (const ch of value) {
		switch (ch) {
			case '\\':
				result += '\\\\';
				break;
			case '"':
				result += '\\"';
				break;
			case '\n':
				result += '\\n';
				break;
			case '\r':
				result += '\\r';
				break;
			case '\t':
				result += '\\t';
				break;
			case '\b':
				result += '\\b';
				break;
			case '\f':
				result += '\\f';
				break;
			default: {
				const code = ch.charCodeAt(0);
				if (code < 0x20) {
					result += '\\u' + code.toString(16).padStart(4, '0');
				} else {
					result += ch;
				}

				break;
			}
		}
	}

	return result;
}
