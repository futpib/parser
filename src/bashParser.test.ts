import test from 'ava';
import { runParser, runParserWithRemainingInput } from './parser.js';
import { stringParserInputCompanion } from './parserInputCompanion.js';
import { bashScriptParser, bashWordParser, bashSimpleCommandParser } from './bashParser.js';
import type { BashSimpleCommand, BashWordPartLiteral } from './bash.js';

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

test('incomplete if rejected as simple command', async t => {
	// `if` is now a reserved word at command-name position. An incomplete `if true`
	// (no `then ... fi`) is invalid bash syntax and must fail rather than silently
	// parse as a simple command.
	await t.throwsAsync(async () => runParser(
		bashScriptParser,
		'if true',
		stringParserInputCompanion,
	));
});

test('find -exec with {} placeholder', async t => {
	const result = await runParser(
		bashScriptParser,
		'find . -name "*.tmp" -exec rm {} \\;',
		stringParserInputCompanion,
	);

	const cmd = result.entries[0].pipeline.commands[0] as BashSimpleCommand;
	t.is(cmd.name!.parts[0].type, 'literal');
	t.is((cmd.name!.parts[0] as BashWordPartLiteral).value, 'find');
	// {} should be parsed as a literal word argument
	const braceArg = cmd.args[5]; // ., -name, "*.tmp", -exec, rm, {}, \;
	t.is(braceArg.parts[0].type, 'literal');
	t.is((braceArg.parts[0] as BashWordPartLiteral).value, '{}');
});

test('lone open brace as argument', async t => {
	const result = await runParser(
		bashScriptParser,
		'echo {',
		stringParserInputCompanion,
	);

	const cmd = result.entries[0].pipeline.commands[0] as BashSimpleCommand;
	t.deepEqual(cmd.args[0], {
		parts: [{ type: 'literal', value: '{' }],
	});
});

test('close brace mid-word', async t => {
	const result = await runParser(
		bashScriptParser,
		'echo foo}bar',
		stringParserInputCompanion,
	);

	const cmd = result.entries[0].pipeline.commands[0] as BashSimpleCommand;
	t.is(cmd.args.length, 1);
	t.is(cmd.args[0].parts[0].type, 'literal');
});

test('open brace mid-word', async t => {
	const result = await runParser(
		bashScriptParser,
		'echo foo{bar',
		stringParserInputCompanion,
	);

	const cmd = result.entries[0].pipeline.commands[0] as BashSimpleCommand;
	t.is(cmd.args.length, 1);
	t.is(cmd.args[0].parts[0].type, 'literal');
});

test('braces mid-word like brace expansion', async t => {
	const result = await runParser(
		bashScriptParser,
		'echo file.{c,h}',
		stringParserInputCompanion,
	);

	const cmd = result.entries[0].pipeline.commands[0] as BashSimpleCommand;
	t.is(cmd.args.length, 1);
	t.is(cmd.args[0].parts[0].type, 'literal');
});

test('find -exec with {.} placeholder variant', async t => {
	const result = await runParser(
		bashScriptParser,
		'echo {.}',
		stringParserInputCompanion,
	);

	const cmd = result.entries[0].pipeline.commands[0] as BashSimpleCommand;
	t.is(cmd.args.length, 1);
	t.is(cmd.args[0].parts[0].type, 'literal');
});

test('lone close brace as argument', async t => {
	const result = await runParser(
		bashScriptParser,
		'echo }',
		stringParserInputCompanion,
	);

	const cmd = result.entries[0].pipeline.commands[0] as BashSimpleCommand;
	t.deepEqual(cmd.args[0], {
		parts: [{ type: 'literal', value: '}' }],
	});
});

test('close brace at start of word', async t => {
	const result = await runParser(
		bashScriptParser,
		'echo }hello',
		stringParserInputCompanion,
	);

	const cmd = result.entries[0].pipeline.commands[0] as BashSimpleCommand;
	t.is(cmd.args.length, 1);
	t.is(cmd.args[0].parts[0].type, 'literal');
});

test('multi-line script with blank lines', async t => {
	const result = await runParser(
		bashScriptParser,
		'echo hello\n\necho world',
		stringParserInputCompanion,
	);

	t.is(result.entries.length, 2);
});

test('mid-script comment', async t => {
	const result = await runParser(
		bashScriptParser,
		'echo hello\n# comment\necho world',
		stringParserInputCompanion,
	);

	t.is(result.entries.length, 2);
});

test('heredoc in command substitution', async t => {
	const result = await runParser(
		bashScriptParser,
		'git commit -m "$(cat <<\'EOF\'\nSuppress terminal emulator responses during replay to prevent spurious input\n\nWhen replaying buffered output into a fresh Terminal on reattach, escape\nsequences like \\e[6n (cursor position request) and \\e[c (device attributes\nrequest) cause the terminal emulator to generate responses (e.g. \\e[24;80R\nand \\e[?1;0c). These were being forwarded to the SSH session as keyboard\ninput, appearing as garbage like "R2R0;0;0c" in TUI apps like htop.\n\nFix by setting a _replayingData flag during replay and dropping all\nonOutput callbacks while it is set.\nEOF\n)"',
		stringParserInputCompanion,
	);

	const cmd = result.entries[0].pipeline.commands[0] as BashSimpleCommand;
	t.deepEqual(cmd.name, { parts: [{ type: 'literal', value: 'git' }] });
	t.is(cmd.args.length, 3);
	t.deepEqual(cmd.args[0], { parts: [{ type: 'literal', value: 'commit' }] });
	t.deepEqual(cmd.args[1], { parts: [{ type: 'literal', value: '-m' }] });

	// The third arg is a double-quoted string containing $(cat <<'EOF'...EOF)
	const dqArg = cmd.args[2];
	t.is(dqArg.parts.length, 1);
	const dq = dqArg.parts[0];
	t.is(dq.type, 'doubleQuoted');
	if (dq.type === 'doubleQuoted') {
		t.is(dq.parts[0].type, 'commandSubstitution');
		if (dq.parts[0].type === 'commandSubstitution') {
			const catCmd = dq.parts[0].command.entries[0].pipeline.commands[0] as BashSimpleCommand;
			t.deepEqual(catCmd.name, { parts: [{ type: 'literal', value: 'cat' }] });
			t.is(catCmd.redirects.length, 1);
			t.is(catCmd.redirects[0].operator, '<<');
			const target = catCmd.redirects[0].target;
			t.truthy('type' in target && target.type === 'hereDoc');
			if ('type' in target && target.type === 'hereDoc') {
				t.is(target.delimiter, 'EOF');
				t.is(target.quoted, true);
				t.true(target.content.startsWith('Suppress terminal emulator'));
				t.true(target.content.endsWith('while it is set.\n'));
			}
		}
	}
});

test('heredoc in command substitution with gh in content', async t => {
	const result = await runParser(
		bashScriptParser,
		'git commit -m "$(cat <<\'EOF\'\nDetect write subcommands in gh/ghx/glab/glabx CLI tools\n\nThe ban-write-operations hook previously only caught write operations\nvia the `api` subcommand (e.g. `gh api -X POST`). Now it also detects\nwrite-action subcommands like `gh pr create`, `gh issue close`,\n`gh pr merge`, etc. by scanning positional args against the shared\nwriteActionWords set.\nEOF\n)"',
		stringParserInputCompanion,
	);

	const cmd = result.entries[0].pipeline.commands[0] as BashSimpleCommand;
	t.deepEqual(cmd.name, { parts: [{ type: 'literal', value: 'git' }] });
	t.is(cmd.args.length, 3);
	t.deepEqual(cmd.args[0], { parts: [{ type: 'literal', value: 'commit' }] });
	t.deepEqual(cmd.args[1], { parts: [{ type: 'literal', value: '-m' }] });

	const dqArg = cmd.args[2];
	t.is(dqArg.parts.length, 1);
	const dq = dqArg.parts[0];
	t.is(dq.type, 'doubleQuoted');
	if (dq.type === 'doubleQuoted') {
		t.is(dq.parts[0].type, 'commandSubstitution');
		if (dq.parts[0].type === 'commandSubstitution') {
			const catCmd = dq.parts[0].command.entries[0].pipeline.commands[0] as BashSimpleCommand;
			t.deepEqual(catCmd.name, { parts: [{ type: 'literal', value: 'cat' }] });
			t.is(catCmd.redirects.length, 1);
			t.is(catCmd.redirects[0].operator, '<<');
			const target = catCmd.redirects[0].target;
			t.truthy('type' in target && target.type === 'hereDoc');
			if ('type' in target && target.type === 'hereDoc') {
				t.is(target.delimiter, 'EOF');
				t.is(target.quoted, true);
				t.true(target.content.includes('gh/ghx/glab/glabx'));
				t.true(target.content.includes('writeActionWords set.'));
			}
		}
	}
});

test('heredoc with indented delimiter in command substitution', async t => {
	const result = await runParser(
		bashScriptParser,
		'git commit -m "$(cat <<\'EOF\'\n   Detect write subcommands in gh/ghx/glab/glabx CLI tools\n\n   The ban-write-operations hook previously only caught write operations\n   via the `api` subcommand (e.g. `gh api -X POST`). Now it also detects\n   write-action subcommands like `gh pr create`, `gh issue close`,\n   `gh pr merge`, etc. by scanning positional args against the shared\n   writeActionWords set.\n   EOF\n   )"',
		stringParserInputCompanion,
	);

	const cmd = result.entries[0].pipeline.commands[0] as BashSimpleCommand;
	t.deepEqual(cmd.name, { parts: [{ type: 'literal', value: 'git' }] });
	t.is(cmd.args.length, 3);
	t.deepEqual(cmd.args[0], { parts: [{ type: 'literal', value: 'commit' }] });
	t.deepEqual(cmd.args[1], { parts: [{ type: 'literal', value: '-m' }] });

	const dqArg = cmd.args[2];
	t.is(dqArg.parts.length, 1);
	const dq = dqArg.parts[0];
	t.is(dq.type, 'doubleQuoted');
	if (dq.type === 'doubleQuoted') {
		t.is(dq.parts[0].type, 'commandSubstitution');
		if (dq.parts[0].type === 'commandSubstitution') {
			const catCmd = dq.parts[0].command.entries[0].pipeline.commands[0] as BashSimpleCommand;
			t.deepEqual(catCmd.name, { parts: [{ type: 'literal', value: 'cat' }] });
			t.is(catCmd.redirects.length, 1);
			t.is(catCmd.redirects[0].operator, '<<');
			const target = catCmd.redirects[0].target;
			t.truthy('type' in target && target.type === 'hereDoc');
			if ('type' in target && target.type === 'hereDoc') {
				t.is(target.delimiter, 'EOF');
				t.is(target.quoted, true);
				t.true(target.content.includes('gh/ghx/glab/glabx'));
			}
		}
	}
});

test('heredoc with backticks in content', async t => {
	const result = await runParser(
		bashScriptParser,
		'git commit -m "$(cat <<\'EOF\'\nThe `api` subcommand (e.g. `gh api -X POST`) is detected.\nEOF\n)"',
		stringParserInputCompanion,
	);

	const cmd = result.entries[0].pipeline.commands[0] as BashSimpleCommand;
	t.deepEqual(cmd.name, { parts: [{ type: 'literal', value: 'git' }] });
	t.is(cmd.args.length, 3);

	const dqArg = cmd.args[2];
	const dq = dqArg.parts[0];
	t.is(dq.type, 'doubleQuoted');
	if (dq.type === 'doubleQuoted') {
		t.is(dq.parts[0].type, 'commandSubstitution');
		if (dq.parts[0].type === 'commandSubstitution') {
			const catCmd = dq.parts[0].command.entries[0].pipeline.commands[0] as BashSimpleCommand;
			t.deepEqual(catCmd.name, { parts: [{ type: 'literal', value: 'cat' }] });
			const target = catCmd.redirects[0].target;
			t.truthy('type' in target && target.type === 'hereDoc');
			if ('type' in target && target.type === 'hereDoc') {
				t.is(target.delimiter, 'EOF');
				t.true(target.content.includes('`gh api -X POST`'));
			}
		}
	}
});

test('nested parentheses in arithmetic expansion', async t => {
	const result = await runParser(
		bashScriptParser,
		'echo $((1 + (2 * 3)))',
		stringParserInputCompanion,
	);

	const cmd = result.entries[0].pipeline.commands[0] as BashSimpleCommand;
	const arith = cmd.args[0].parts[0];
	t.is(arith.type, 'arithmeticExpansion');
	if (arith.type === 'arithmeticExpansion') {
		t.is(arith.expression, '1 + (2 * 3)');
	}
});

test('while loop', async t => {
	const result = await runParser(
		bashScriptParser,
		'while true; do echo hi; done',
		stringParserInputCompanion,
	);

	const unit = result.entries[0].pipeline.commands[0];
	t.is(unit.type, 'whileLoop');
	if (unit.type === 'whileLoop') {
		const condCmd = unit.condition.entries[0].pipeline.commands[0] as BashSimpleCommand;
		t.deepEqual(condCmd.name, { parts: [{ type: 'literal', value: 'true' }] });
		const bodyCmd = unit.body.entries[0].pipeline.commands[0] as BashSimpleCommand;
		t.deepEqual(bodyCmd.name, { parts: [{ type: 'literal', value: 'echo' }] });
	}
});

test('until loop', async t => {
	const result = await runParser(
		bashScriptParser,
		'until false; do echo hi; done',
		stringParserInputCompanion,
	);

	const unit = result.entries[0].pipeline.commands[0];
	t.is(unit.type, 'untilLoop');
});

test('for-in loop with words', async t => {
	const result = await runParser(
		bashScriptParser,
		'for i in a b c; do echo $i; done',
		stringParserInputCompanion,
	);

	const unit = result.entries[0].pipeline.commands[0];
	t.is(unit.type, 'forInLoop');
	if (unit.type === 'forInLoop') {
		t.is(unit.name, 'i');
		t.deepEqual(unit.words, [
			{ parts: [{ type: 'literal', value: 'a' }] },
			{ parts: [{ type: 'literal', value: 'b' }] },
			{ parts: [{ type: 'literal', value: 'c' }] },
		]);
	}
});

test('for-in loop without `in` clause', async t => {
	const result = await runParser(
		bashScriptParser,
		'for i; do echo $i; done',
		stringParserInputCompanion,
	);

	const unit = result.entries[0].pipeline.commands[0];
	t.is(unit.type, 'forInLoop');
	if (unit.type === 'forInLoop') {
		t.is(unit.name, 'i');
		t.is(unit.words, undefined);
	}
});

test('for-in loop with empty `in` clause', async t => {
	const result = await runParser(
		bashScriptParser,
		'for i in; do echo $i; done',
		stringParserInputCompanion,
	);

	const unit = result.entries[0].pipeline.commands[0];
	t.is(unit.type, 'forInLoop');
	if (unit.type === 'forInLoop') {
		t.is(unit.name, 'i');
		t.deepEqual(unit.words, []);
	}
});

test('for-arithmetic loop', async t => {
	const result = await runParser(
		bashScriptParser,
		'for ((i=0;i<10;i++)); do echo $i; done',
		stringParserInputCompanion,
	);

	const unit = result.entries[0].pipeline.commands[0];
	t.is(unit.type, 'forArithmeticLoop');
	if (unit.type === 'forArithmeticLoop') {
		t.is(unit.init, 'i=0');
		t.is(unit.condition, 'i<10');
		t.is(unit.update, 'i++');
	}
});

test('if expression', async t => {
	const result = await runParser(
		bashScriptParser,
		'if true; then echo yes; fi',
		stringParserInputCompanion,
	);

	const unit = result.entries[0].pipeline.commands[0];
	t.is(unit.type, 'ifExpression');
	if (unit.type === 'ifExpression') {
		t.is(unit.branches.length, 1);
		t.is(unit.elseBody, undefined);
	}
});

test('if/elif/else expression', async t => {
	const result = await runParser(
		bashScriptParser,
		'if a; then b; elif c; then d; else e; fi',
		stringParserInputCompanion,
	);

	const unit = result.entries[0].pipeline.commands[0];
	t.is(unit.type, 'ifExpression');
	if (unit.type === 'ifExpression') {
		t.is(unit.branches.length, 2);
		t.not(unit.elseBody, undefined);
	}
});

test('case expression with multiple branches', async t => {
	const result = await runParser(
		bashScriptParser,
		'case x in foo) echo a;; bar|baz) echo b;& *) echo c;; esac',
		stringParserInputCompanion,
	);

	const unit = result.entries[0].pipeline.commands[0];
	t.is(unit.type, 'caseExpression');
	if (unit.type === 'caseExpression') {
		t.deepEqual(unit.word, { parts: [{ type: 'literal', value: 'x' }] });
		t.is(unit.branches.length, 3);
		t.is(unit.branches[0].patterns.length, 1);
		t.is(unit.branches[0].terminator, ';;');
		t.is(unit.branches[1].patterns.length, 2);
		t.is(unit.branches[1].terminator, ';&');
		t.is(unit.branches[2].terminator, ';;');
	}
});

test('case expression with no branches', async t => {
	const result = await runParser(
		bashScriptParser,
		'case x in esac',
		stringParserInputCompanion,
	);

	const unit = result.entries[0].pipeline.commands[0];
	t.is(unit.type, 'caseExpression');
	if (unit.type === 'caseExpression') {
		t.is(unit.branches.length, 0);
	}
});

test('function with `function` keyword and braces', async t => {
	const result = await runParser(
		bashScriptParser,
		'function foo { echo hi; }',
		stringParserInputCompanion,
	);

	const unit = result.entries[0].pipeline.commands[0];
	t.is(unit.type, 'function');
	if (unit.type === 'function') {
		t.is(unit.name, 'foo');
		t.is(unit.hasFunctionKeyword, true);
		t.is(unit.hasParentheses, false);
		t.is(unit.body.type, 'braceGroup');
	}
});

test('function with `function` keyword and parentheses', async t => {
	const result = await runParser(
		bashScriptParser,
		'function foo() { echo hi; }',
		stringParserInputCompanion,
	);

	const unit = result.entries[0].pipeline.commands[0];
	t.is(unit.type, 'function');
	if (unit.type === 'function') {
		t.is(unit.hasFunctionKeyword, true);
		t.is(unit.hasParentheses, true);
	}
});

test('function with parentheses only (POSIX form)', async t => {
	const result = await runParser(
		bashScriptParser,
		'foo() { echo hi; }',
		stringParserInputCompanion,
	);

	const unit = result.entries[0].pipeline.commands[0];
	t.is(unit.type, 'function');
	if (unit.type === 'function') {
		t.is(unit.name, 'foo');
		t.is(unit.hasFunctionKeyword, false);
		t.is(unit.hasParentheses, true);
	}
});

test('compound command in pipeline', async t => {
	const result = await runParser(
		bashScriptParser,
		'while true; do echo hi; done | tee log',
		stringParserInputCompanion,
	);

	const pipeline = result.entries[0].pipeline;
	t.is(pipeline.commands.length, 2);
	t.is(pipeline.commands[0].type, 'whileLoop');
	t.is(pipeline.commands[1].type, 'simple');
});

test('nested compound: if inside while', async t => {
	const result = await runParser(
		bashScriptParser,
		'while read line; do if test -n "$line"; then echo "$line"; fi; done',
		stringParserInputCompanion,
	);

	const unit = result.entries[0].pipeline.commands[0];
	t.is(unit.type, 'whileLoop');
	if (unit.type === 'whileLoop') {
		const innerUnit = unit.body.entries[0].pipeline.commands[0];
		t.is(innerUnit.type, 'ifExpression');
	}
});
