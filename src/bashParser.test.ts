import test from 'ava';
import { runParser, runParserWithRemainingInput } from './parser.js';
import { stringParserInputCompanion } from './parserInputCompanion.js';
import { bashScriptParser, bashWordParser, bashSimpleCommandParser } from './bashParser.js';

test('simple command parser - single word', async t => {
	const result = await runParser(
		bashSimpleCommandParser,
		'cmd',
		stringParserInputCompanion,
		{ errorStack: true },
	);

	t.is(result.type, 'simple');
	t.deepEqual(result.name, { parts: [{ type: 'literal', value: 'cmd' }] });
});

test('simple command parser - two words', async t => {
	const result = await runParser(
		bashSimpleCommandParser,
		'echo hello',
		stringParserInputCompanion,
	);

	t.is(result.type, 'simple');
	t.deepEqual(result.name, { parts: [{ type: 'literal', value: 'echo' }] });
	t.is(result.args.length, 1);
});

test('word parser - simple literal', async t => {
	const result = await runParser(
		bashWordParser,
		'hello',
		stringParserInputCompanion,
	);

	t.deepEqual(result, {
		parts: [{ type: 'literal', value: 'hello' }],
	});
});

test('word parser - variable', async t => {
	const result = await runParser(
		bashWordParser,
		'$HOME',
		stringParserInputCompanion,
	);

	t.deepEqual(result, {
		parts: [{ type: 'variable', name: 'HOME' }],
	});
});

test('simple command', async t => {
	const result = await runParser(
		bashScriptParser,
		'echo hello',
		stringParserInputCompanion,
	);

	t.deepEqual(result, {
		type: 'list',
		entries: [{
			pipeline: {
				type: 'pipeline',
				negated: false,
				commands: [{
					type: 'simple',
					name: { parts: [{ type: 'literal', value: 'echo' }] },
					args: [{ parts: [{ type: 'literal', value: 'hello' }] }],
					redirects: [],
					assignments: [],
				}],
			},
			separator: undefined,
		}],
	});
});

test('simple command with multiple args', async t => {
	const result = await runParser(
		bashScriptParser,
		'echo hello world',
		stringParserInputCompanion,
	);

	t.is(result.entries[0].pipeline.commands[0].type, 'simple');
	const cmd = result.entries[0].pipeline.commands[0];
	if (cmd.type === 'simple') {
		t.is(cmd.args.length, 2);
	}
});

test('pipeline', async t => {
	const result = await runParser(
		bashScriptParser,
		'cat file | grep pattern',
		stringParserInputCompanion,
	);

	t.is(result.entries[0].pipeline.commands.length, 2);
});

test('redirect output', async t => {
	const result = await runParser(
		bashScriptParser,
		'echo foo > file',
		stringParserInputCompanion,
	);

	const cmd = result.entries[0].pipeline.commands[0];
	if (cmd.type === 'simple') {
		t.is(cmd.redirects.length, 1);
		t.is(cmd.redirects[0].operator, '>');
	}
});

test('redirect with fd', async t => {
	const result = await runParser(
		bashScriptParser,
		'cmd 2>&1',
		stringParserInputCompanion,
	);

	const cmd = result.entries[0].pipeline.commands[0];
	if (cmd.type === 'simple') {
		t.is(cmd.redirects.length, 1);
		t.is(cmd.redirects[0].fd, 2);
		t.is(cmd.redirects[0].operator, '>&');
	}
});

test('single quoted string', async t => {
	const result = await runParser(
		bashScriptParser,
		"echo 'hello world'",
		stringParserInputCompanion,
	);

	const cmd = result.entries[0].pipeline.commands[0];
	if (cmd.type === 'simple') {
		t.deepEqual(cmd.args[0], {
			parts: [{ type: 'singleQuoted', value: 'hello world' }],
		});
	}
});

test('double quoted string with variable', async t => {
	const result = await runParser(
		bashScriptParser,
		'echo "hello $name"',
		stringParserInputCompanion,
	);

	const cmd = result.entries[0].pipeline.commands[0];
	if (cmd.type === 'simple') {
		t.deepEqual(cmd.args[0], {
			parts: [{
				type: 'doubleQuoted',
				parts: [
					{ type: 'literal', value: 'hello ' },
					{ type: 'variable', name: 'name' },
				],
			}],
		});
	}
});

test('double quoted string with trailing dollar', async t => {
	const result = await runParser(
		bashScriptParser,
		'echo "hello$"',
		stringParserInputCompanion,
	);

	const cmd = result.entries[0].pipeline.commands[0];
	if (cmd.type === 'simple') {
		t.deepEqual(cmd.args[0], {
			parts: [{
				type: 'doubleQuoted',
				parts: [
					{ type: 'literal', value: 'hello' },
					{ type: 'literal', value: '$' },
				],
			}],
		});
	}
});

test('double quoted string with only dollar', async t => {
	const result = await runParser(
		bashScriptParser,
		'echo "$"',
		stringParserInputCompanion,
	);

	const cmd = result.entries[0].pipeline.commands[0];
	if (cmd.type === 'simple') {
		t.deepEqual(cmd.args[0], {
			parts: [{
				type: 'doubleQuoted',
				parts: [
					{ type: 'literal', value: '$' },
				],
			}],
		});
	}
});

test('grep with dollar anchor in double quotes', async t => {
	const result = await runParser(
		bashScriptParser,
		'grep "\\.ts$"',
		stringParserInputCompanion,
	);

	const cmd = result.entries[0].pipeline.commands[0];
	if (cmd.type === 'simple') {
		t.deepEqual(cmd.args[0], {
			parts: [{
				type: 'doubleQuoted',
				parts: [
					{ type: 'literal', value: '\\' },
					{ type: 'literal', value: '.ts' },
					{ type: 'literal', value: '$' },
				],
			}],
		});
	}
});

test('pipeline with dollar anchor in double quoted grep pattern', async t => {
	const result = await runParser(
		bashScriptParser,
		'ls -la /home | grep "\\.ts$" | grep -v "\\.test\\.ts"',
		stringParserInputCompanion,
	);

	t.is(result.entries[0].pipeline.commands.length, 3);
});

test('simple variable', async t => {
	const result = await runParser(
		bashScriptParser,
		'echo $HOME',
		stringParserInputCompanion,
	);

	const cmd = result.entries[0].pipeline.commands[0];
	if (cmd.type === 'simple') {
		t.deepEqual(cmd.args[0], {
			parts: [{ type: 'variable', name: 'HOME' }],
		});
	}
});

test('command substitution', async t => {
	const result = await runParser(
		bashScriptParser,
		'echo $(pwd)',
		stringParserInputCompanion,
	);

	const cmd = result.entries[0].pipeline.commands[0];
	if (cmd.type === 'simple') {
		t.is(cmd.args[0].parts[0].type, 'commandSubstitution');
	}
});

test('backtick substitution', async t => {
	const result = await runParser(
		bashScriptParser,
		'echo `pwd`',
		stringParserInputCompanion,
	);

	const cmd = result.entries[0].pipeline.commands[0];
	if (cmd.type === 'simple') {
		t.is(cmd.args[0].parts[0].type, 'backtickSubstitution');
	}
});

test('subshell', async t => {
	const result = await runParser(
		bashScriptParser,
		'(cd dir; pwd)',
		stringParserInputCompanion,
	);

	t.is(result.entries[0].pipeline.commands[0].type, 'subshell');
});

test('brace group', async t => {
	const result = await runParser(
		bashScriptParser,
		'{ echo hello; }',
		stringParserInputCompanion,
	);

	t.is(result.entries[0].pipeline.commands[0].type, 'braceGroup');
});

test('command list with &&', async t => {
	const result = await runParser(
		bashScriptParser,
		'cmd1 && cmd2',
		stringParserInputCompanion,
	);

	t.is(result.entries.length, 2);
	t.is(result.entries[0].separator, '&&');
});

test('command list with ||', async t => {
	const result = await runParser(
		bashScriptParser,
		'cmd1 || cmd2',
		stringParserInputCompanion,
	);

	t.is(result.entries.length, 2);
	t.is(result.entries[0].separator, '||');
});

test('command list with ;', async t => {
	const result = await runParser(
		bashScriptParser,
		'cmd1; cmd2',
		stringParserInputCompanion,
	);

	t.is(result.entries.length, 2);
	t.is(result.entries[0].separator, ';');
});

test('background command', async t => {
	const result = await runParser(
		bashScriptParser,
		'cmd &',
		stringParserInputCompanion,
	);

	t.is(result.entries[0].separator, '&');
});

test('assignment', async t => {
	const result = await runParser(
		bashScriptParser,
		'VAR=value cmd',
		stringParserInputCompanion,
	);

	const cmd = result.entries[0].pipeline.commands[0];
	if (cmd.type === 'simple') {
		t.is(cmd.assignments.length, 1);
		t.is(cmd.assignments[0].name, 'VAR');
	}
});

test('negated pipeline', async t => {
	const result = await runParser(
		bashScriptParser,
		'! cmd',
		stringParserInputCompanion,
	);

	t.is(result.entries[0].pipeline.negated, true);
});

test('complex pipeline with redirects', async t => {
	const result = await runParser(
		bashScriptParser,
		'cat file 2>/dev/null | grep pattern | sort > output',
		stringParserInputCompanion,
	);

	t.is(result.entries[0].pipeline.commands.length, 3);
});

test('[[ treated as command name', async t => {
	const result = await runParser(
		bashScriptParser,
		'[[ -f file ]]',
		stringParserInputCompanion,
	);

	const cmd = result.entries[0].pipeline.commands[0];
	if (cmd.type === 'simple') {
		t.deepEqual(cmd.name, { parts: [{ type: 'literal', value: '[[' }] });
		t.is(cmd.args.length, 3); // -f, file, ]]
	}
});

// Braced variable expansion: ${VAR}
test('braced variable expansion', async t => {
	const result = await runParser(
		bashScriptParser,
		'echo ${HOME}',
		stringParserInputCompanion,
	);

	const cmd = result.entries[0].pipeline.commands[0];
	if (cmd.type === 'simple') {
		t.is(cmd.args[0].parts[0].type, 'variableBraced');
	}
});

// Braced variable with default: ${VAR:-default}
test('braced variable with default value', async t => {
	const result = await runParser(
		bashScriptParser,
		'echo ${VAR:-default}',
		stringParserInputCompanion,
	);

	const cmd = result.entries[0].pipeline.commands[0];
	if (cmd.type === 'simple') {
		t.is(cmd.args[0].parts[0].type, 'variableBraced');
	}
});

// Arithmetic expansion: $((1+2))
test('arithmetic expansion', async t => {
	const result = await runParser(
		bashScriptParser,
		'echo $((1+2))',
		stringParserInputCompanion,
	);

	const cmd = result.entries[0].pipeline.commands[0];
	if (cmd.type === 'simple') {
		t.is(cmd.args[0].parts[0].type, 'arithmeticExpansion');
	}
});

// Bare $ at end of unquoted word
test('bare dollar at end of unquoted word', async t => {
	const result = await runParser(
		bashScriptParser,
		'echo foo$',
		stringParserInputCompanion,
	);

	const cmd = result.entries[0].pipeline.commands[0];
	if (cmd.type === 'simple') {
		t.deepEqual(cmd.args[0], {
			parts: [
				{ type: 'literal', value: 'foo' },
				{ type: 'literal', value: '$' },
			],
		});
	}
});

// Bare $ as its own unquoted word
test('bare dollar as standalone unquoted word', async t => {
	const result = await runParser(
		bashScriptParser,
		'echo $',
		stringParserInputCompanion,
	);

	const cmd = result.entries[0].pipeline.commands[0];
	if (cmd.type === 'simple') {
		t.deepEqual(cmd.args[0], {
			parts: [
				{ type: 'literal', value: '$' },
			],
		});
	}
});

// Comment after command
test('comment after command', async t => {
	const result = await runParser(
		bashScriptParser,
		'echo hello # this is a comment',
		stringParserInputCompanion,
	);

	const cmd = result.entries[0].pipeline.commands[0];
	if (cmd.type === 'simple') {
		t.is(cmd.args.length, 1);
		t.deepEqual(cmd.args[0], {
			parts: [{ type: 'literal', value: 'hello' }],
		});
	}
});

// ANSI-C quoting: $'...'
test('ansi-c quoting', async t => {
	const result = await runParser(
		bashScriptParser,
		"echo $'hello\\nworld'",
		stringParserInputCompanion,
	);

	const cmd = result.entries[0].pipeline.commands[0];
	if (cmd.type === 'simple') {
		t.is(cmd.args.length, 1);
	}
});

// Braced variable in double quotes: "${VAR}"
test('braced variable in double quotes', async t => {
	const result = await runParser(
		bashScriptParser,
		'echo "${HOME}"',
		stringParserInputCompanion,
	);

	const cmd = result.entries[0].pipeline.commands[0];
	if (cmd.type === 'simple') {
		const dq = cmd.args[0].parts[0];
		if (dq.type === 'doubleQuoted') {
			t.is(dq.parts[0].type, 'variableBraced');
		}
	}
});

// Arithmetic expansion in double quotes
test('arithmetic expansion in double quotes', async t => {
	const result = await runParser(
		bashScriptParser,
		'echo "$((1+2))"',
		stringParserInputCompanion,
	);

	const cmd = result.entries[0].pipeline.commands[0];
	if (cmd.type === 'simple') {
		const dq = cmd.args[0].parts[0];
		if (dq.type === 'doubleQuoted') {
			t.is(dq.parts[0].type, 'arithmeticExpansion');
		}
	}
});

// Process substitution: <(cmd)
test('process substitution input', async t => {
	const result = await runParser(
		bashScriptParser,
		'diff <(sort file1) <(sort file2)',
		stringParserInputCompanion,
	);

	t.truthy(result);
});

// Line continuation (backslash-newline)
test('line continuation', async t => {
	const result = await runParser(
		bashScriptParser,
		'echo hello \\\nworld',
		stringParserInputCompanion,
	);

	const cmd = result.entries[0].pipeline.commands[0];
	if (cmd.type === 'simple') {
		t.is(cmd.args.length, 2);
	}
});

// Hash in middle of unquoted word is literal, not a comment
test('hash in middle of unquoted word', async t => {
	const result = await runParser(
		bashScriptParser,
		'echo foo#bar',
		stringParserInputCompanion,
	);

	const cmd = result.entries[0].pipeline.commands[0];
	if (cmd.type === 'simple') {
		t.deepEqual(cmd.args[0], {
			parts: [{ type: 'literal', value: 'foo#bar' }],
		});
	}
});

test('if treated as command name', async t => {
	const result = await runParser(
		bashScriptParser,
		'if true',
		stringParserInputCompanion,
	);

	const cmd = result.entries[0].pipeline.commands[0];
	if (cmd.type === 'simple') {
		t.deepEqual(cmd.name, { parts: [{ type: 'literal', value: 'if' }] });
	}
});
