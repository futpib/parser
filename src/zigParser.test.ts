import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import test from 'ava';
import envPaths from 'env-paths';
import { execa } from 'execa';
import PromiseMutex from 'p-mutex';
import { temporaryDirectory } from 'tempy';
import { hasExecutable } from './hasExecutable.js';
import { runParser } from './parser.js';
import { stringParserInputCompanion } from './parserInputCompanion.js';
import { zigSourceFileParser } from './zigParser.js';

const zigPaths = envPaths('parser.futpib.github.io');

const hasZigPromise = hasExecutable('zig');

const zigCommit = '0.13.0';

const zigGitCacheMutex = new PromiseMutex();

async function ensureZigGitCache() {
	return zigGitCacheMutex.withLock(async () => {
		const cacheDir = path.join(zigPaths.cache, 'zig.git');

		try {
			await fs.access(cacheDir);
			return cacheDir;
		} catch {
			// Cache miss, clone the bare repo
		}

		await fs.mkdir(path.dirname(cacheDir), { recursive: true });

		const tempDir = `${cacheDir}.tmp`;
		await fs.rm(tempDir, { recursive: true, force: true });

		await execa('git', ['clone', '--bare', '--depth=1', '--branch', zigCommit, 'https://codeberg.org/ziglang/zig.git', tempDir]);

		await fs.rename(tempDir, cacheDir);

		return cacheDir;
	});
}

async function cloneZigRepo(): Promise<{ path: string; [Symbol.asyncDispose]: () => Promise<void> }> {
	const gitDir = await ensureZigGitCache();

	const worktree = temporaryDirectory();
	await execa('git', ['--git-dir', gitDir, 'worktree', 'add', '--detach', worktree, zigCommit]);

	return {
		path: worktree,
		[Symbol.asyncDispose]: async () => {
			await execa('git', ['--git-dir', gitDir, 'worktree', 'remove', '--force', worktree]);
		},
	};
}

const zigAstDumperSnippet = `
const std = @import("std");

pub fn main() !void {
    var gpa = std.heap.GeneralPurposeAllocator(.{}){};
    defer _ = gpa.deinit();
    const allocator = gpa.allocator();

    const args = try std.process.argsAlloc(allocator);
    defer std.process.argsFree(allocator, args);

    const file_path = args[1];
    const source = try std.fs.cwd().readFileAlloc(allocator, file_path, std.math.maxInt(u32));
    defer allocator.free(source);

    var tree = try std.zig.Ast.parse(allocator, source, .zig);
    defer tree.deinit(allocator);

    const stdout = std.io.getStdOut().writer();
    try dumpRoot(tree, stdout);
    try stdout.writeByte('\\n');
}

fn writeJsonString(writer: anytype, s: []const u8) !void {
    try writer.writeByte('"');
    for (s) |c| {
        switch (c) {
            '"' => try writer.writeAll("\\\\\\""),
            '\\\\' => try writer.writeAll("\\\\\\\\"),
            '\\n' => try writer.writeAll("\\\\n"),
            '\\r' => try writer.writeAll("\\\\r"),
            '\\t' => try writer.writeAll("\\\\t"),
            else => try writer.writeByte(c),
        }
    }
    try writer.writeByte('"');
}

fn dumpRoot(tree: std.zig.Ast, writer: anytype) !void {
    try writer.writeAll("{\\"type\\":\\"Root\\",\\"members\\":[");
    const root_decls = tree.rootDecls();
    for (root_decls, 0..) |decl, i| {
        if (i > 0) try writer.writeByte(',');
        try dumpNode(tree, decl, writer);
    }
    try writer.writeAll("]}");
}

fn tokenSlice(tree: std.zig.Ast, token: std.zig.Ast.TokenIndex) []const u8 {
    return tree.tokenSlice(token);
}

fn dumpNode(tree: std.zig.Ast, node_index: std.zig.Ast.Node.Index, writer: anytype) !void {
    if (node_index == 0) {
        try writer.writeAll("null");
        return;
    }
    const tags = tree.nodes.items(.tag);
    const tag = tags[node_index];
    const data = tree.nodes.items(.data)[node_index];
    const main_tokens = tree.nodes.items(.main_token);

    switch (tag) {
        .identifier => {
            const name = tokenSlice(tree, main_tokens[node_index]);
            if (std.mem.eql(u8, name, "true")) {
                try writer.writeAll("{\\"type\\":\\"BoolLiteral\\",\\"value\\":true}");
            } else if (std.mem.eql(u8, name, "false")) {
                try writer.writeAll("{\\"type\\":\\"BoolLiteral\\",\\"value\\":false}");
            } else if (std.mem.eql(u8, name, "null")) {
                try writer.writeAll("{\\"type\\":\\"NullLiteral\\"}");
            } else if (std.mem.eql(u8, name, "undefined")) {
                try writer.writeAll("{\\"type\\":\\"UndefinedLiteral\\"}");
            } else {
                try writer.writeAll("{\\"type\\":\\"Identifier\\",\\"name\\":");
                try writeJsonString(writer, name);
                try writer.writeByte('}');
            }
        },
        .number_literal => {
            const slice = tokenSlice(tree, main_tokens[node_index]);
            try writer.writeAll("{\\"type\\":\\"IntegerLiteral\\",\\"value\\":");
            try writeJsonString(writer, slice);
            try writer.writeByte('}');
        },
        .string_literal => {
            const slice = tokenSlice(tree, main_tokens[node_index]);
            // Remove surrounding quotes
            const inner = slice[1..slice.len - 1];
            try writer.writeAll("{\\"type\\":\\"StringLiteral\\",\\"value\\":");
            try writeJsonString(writer, inner);
            try writer.writeByte('}');
        },
        .enum_literal => {
            const name = tokenSlice(tree, main_tokens[node_index]);
            try writer.writeAll("{\\"type\\":\\"EnumLiteral\\",\\"name\\":");
            try writeJsonString(writer, name);
            try writer.writeByte('}');
        },
        .builtin_call_two, .builtin_call_two_comma => {
            const name = tokenSlice(tree, main_tokens[node_index]);
            try writer.writeAll("{\\"type\\":\\"BuiltinCallExpr\\",\\"name\\":");
            try writeJsonString(writer, name[1..]);
            try writer.writeAll(",\\"args\\":[");
            var arg_count: u32 = 0;
            if (data.lhs != 0) {
                try dumpNode(tree, data.lhs, writer);
                arg_count += 1;
            }
            if (data.rhs != 0) {
                if (arg_count > 0) try writer.writeByte(',');
                try dumpNode(tree, data.rhs, writer);
            }
            try writer.writeAll("]}");
        },
        .field_access => {
            try writer.writeAll("{\\"type\\":\\"FieldAccessExpr\\",\\"operand\\":");
            try dumpNode(tree, data.lhs, writer);
            try writer.writeAll(",\\"member\\":");
            try writeJsonString(writer, tokenSlice(tree, data.rhs));
            try writer.writeByte('}');
        },
        .call_one, .call_one_comma => {
            try writer.writeAll("{\\"type\\":\\"CallExpr\\",\\"callee\\":");
            try dumpNode(tree, data.lhs, writer);
            try writer.writeAll(",\\"args\\":[");
            if (data.rhs != 0) {
                try dumpNode(tree, data.rhs, writer);
            }
            try writer.writeAll("]}");
        },
        .add, .sub, .mul, .div, .mod,
        .shl, .shr,
        .bit_and, .bit_or, .bit_xor,
        .equal_equal, .bang_equal,
        .less_than, .greater_than, .less_or_equal, .greater_or_equal,
        .bool_and, .bool_or,
        .array_cat, .array_mult,
        .merge_error_sets,
        => {
            const op_str = switch (tag) {
                .add => "+",
                .sub => "-",
                .mul => "*",
                .div => "/",
                .mod => "%",
                .shl => "<<",
                .shr => ">>",
                .bit_and => "&",
                .bit_or => "|",
                .bit_xor => "^",
                .equal_equal => "==",
                .bang_equal => "!=",
                .less_than => "<",
                .greater_than => ">",
                .less_or_equal => "<=",
                .greater_or_equal => ">=",
                .bool_and => "and",
                .bool_or => "or",
                .array_cat => "++",
                .array_mult => "**",
                .merge_error_sets => "||",
                else => unreachable,
            };
            try writer.writeAll("{\\"type\\":\\"BinaryExpr\\",\\"operator\\":");
            try writeJsonString(writer, op_str);
            try writer.writeAll(",\\"left\\":");
            try dumpNode(tree, data.lhs, writer);
            try writer.writeAll(",\\"right\\":");
            try dumpNode(tree, data.rhs, writer);
            try writer.writeByte('}');
        },
        .negation => {
            try writer.writeAll("{\\"type\\":\\"UnaryExpr\\",\\"operator\\":\\"-\\",\\"operand\\":");
            try dumpNode(tree, data.lhs, writer);
            try writer.writeByte('}');
        },
        .bit_not => {
            try writer.writeAll("{\\"type\\":\\"UnaryExpr\\",\\"operator\\":\\"~\\",\\"operand\\":");
            try dumpNode(tree, data.lhs, writer);
            try writer.writeByte('}');
        },
        .bool_not => {
            try writer.writeAll("{\\"type\\":\\"UnaryExpr\\",\\"operator\\":\\"!\\",\\"operand\\":");
            try dumpNode(tree, data.lhs, writer);
            try writer.writeByte('}');
        },
        .address_of => {
            try writer.writeAll("{\\"type\\":\\"UnaryExpr\\",\\"operator\\":\\"&\\",\\"operand\\":");
            try dumpNode(tree, data.lhs, writer);
            try writer.writeByte('}');
        },
        .@"try" => {
            try writer.writeAll("{\\"type\\":\\"TryExpr\\",\\"operand\\":");
            try dumpNode(tree, data.lhs, writer);
            try writer.writeByte('}');
        },
        .@"comptime" => {
            try writer.writeAll("{\\"type\\":\\"ComptimeExpr\\",\\"operand\\":");
            try dumpNode(tree, data.lhs, writer);
            try writer.writeByte('}');
        },
        .error_union => {
            try writer.writeAll("{\\"type\\":\\"ErrorUnionType\\",\\"error\\":");
            try dumpNode(tree, data.lhs, writer);
            try writer.writeAll(",\\"payload\\":");
            try dumpNode(tree, data.rhs, writer);
            try writer.writeByte('}');
        },
        .optional_type => {
            try writer.writeAll("{\\"type\\":\\"OptionalType\\",\\"child\\":");
            try dumpNode(tree, data.lhs, writer);
            try writer.writeByte('}');
        },
        .@"return" => {
            try writer.writeAll("{\\"type\\":\\"ReturnStmt\\"");
            if (data.lhs != 0) {
                try writer.writeAll(",\\"value\\":");
                try dumpNode(tree, data.lhs, writer);
            }
            try writer.writeByte('}');
        },
        .@"break" => {
            try writer.writeAll("{\\"type\\":\\"BreakStmt\\"");
            if (data.lhs != 0) {
                try writer.writeAll(",\\"label\\":");
                try writeJsonString(writer, tokenSlice(tree, data.lhs));
            }
            if (data.rhs != 0) {
                try writer.writeAll(",\\"value\\":");
                try dumpNode(tree, data.rhs, writer);
            }
            try writer.writeByte('}');
        },
        .@"continue" => {
            try writer.writeAll("{\\"type\\":\\"ContinueStmt\\"");
            if (data.lhs != 0) {
                try writer.writeAll(",\\"label\\":");
                try writeJsonString(writer, tokenSlice(tree, data.lhs));
            }
            try writer.writeByte('}');
        },
        .grouped_expression => {
            try dumpNode(tree, data.lhs, writer);
        },
        .block_two, .block_two_semicolon => {
            try writer.writeAll("{\\"type\\":\\"BlockExpr\\",\\"statements\\":[");
            var count: u32 = 0;
            if (data.lhs != 0) {
                try dumpNode(tree, data.lhs, writer);
                count += 1;
            }
            if (data.rhs != 0) {
                if (count > 0) try writer.writeByte(',');
                try dumpNode(tree, data.rhs, writer);
            }
            try writer.writeAll("]}");
        },
        .block, .block_semicolon => {
            try writer.writeAll("{\\"type\\":\\"BlockExpr\\",\\"statements\\":[");
            const extra = tree.extraData(data.lhs, std.zig.Ast.Node.SubRange);
            const stmts = tree.extra_data[extra.start..extra.end];
            for (stmts, 0..) |stmt, i| {
                if (i > 0) try writer.writeByte(',');
                try dumpNode(tree, stmt, writer);
            }
            try writer.writeAll("]}");
        },
        .simple_var_decl => {
            try dumpVarDecl(tree, node_index, writer, false);
        },
        .global_var_decl => {
            try dumpVarDecl(tree, node_index, writer, false);
        },
        .local_var_decl => {
            try dumpVarDecl(tree, node_index, writer, true);
        },
        .aligned_var_decl => {
            try dumpVarDecl(tree, node_index, writer, false);
        },
        .fn_decl => {
            try dumpFnDecl(tree, node_index, writer);
        },
        .fn_proto_simple => {
            try dumpFnProtoAsDecl(tree, node_index, writer, null);
        },
        .fn_proto_multi => {
            try dumpFnProtoAsDecl(tree, node_index, writer, null);
        },
        .fn_proto_one => {
            try dumpFnProtoAsDecl(tree, node_index, writer, null);
        },
        .test_decl => {
            try dumpTestDecl(tree, node_index, writer);
        },
        .@"usingnamespace" => {
            try writer.writeAll("{\\"type\\":\\"UsingnamespaceDecl\\",\\"isPub\\":false,\\"expression\\":");
            try dumpNode(tree, data.lhs, writer);
            try writer.writeByte('}');
        },
        .assign => {
            try writer.writeAll("{\\"type\\":\\"AssignStmt\\",\\"target\\":");
            try dumpNode(tree, data.lhs, writer);
            try writer.writeAll(",\\"operator\\":\\"=\\",\\"value\\":");
            try dumpNode(tree, data.rhs, writer);
            try writer.writeByte('}');
        },
        .assign_add => {
            try writer.writeAll("{\\"type\\":\\"AssignStmt\\",\\"target\\":");
            try dumpNode(tree, data.lhs, writer);
            try writer.writeAll(",\\"operator\\":\\"+=\\",\\"value\\":");
            try dumpNode(tree, data.rhs, writer);
            try writer.writeByte('}');
        },
        .@"defer" => {
            try writer.writeAll("{\\"type\\":\\"DeferStmt\\",\\"isErrdefer\\":false,\\"body\\":");
            try dumpNode(tree, data.rhs, writer);
            try writer.writeByte('}');
        },
        .@"errdefer" => {
            try writer.writeAll("{\\"type\\":\\"DeferStmt\\",\\"isErrdefer\\":true,\\"body\\":");
            try dumpNode(tree, data.rhs, writer);
            try writer.writeByte('}');
        },
        else => {
            try writer.writeAll("{\\"type\\":\\"Unknown\\",\\"tag\\":");
            try writeJsonString(writer, @tagName(tag));
            try writer.writeByte('}');
        },
    }
}

fn dumpVarDecl(tree: std.zig.Ast, node_index: std.zig.Ast.Node.Index, writer: anytype, is_local: bool) !void {
    const var_decl = tree.fullVarDecl(node_index) orelse return;
    const main_tokens = tree.nodes.items(.main_token);
    const token_tags = tree.tokens.items(.tag);

    const is_const = token_tags[main_tokens[node_index]] == .keyword_const;
    const name_token = main_tokens[node_index] + 1;
    const name = tokenSlice(tree, name_token);

    // Check for pub/extern/comptime/threadlocal by scanning backward
    var is_pub = false;
    var is_extern = false;
    var is_comptime = false;
    var is_threadlocal = false;
    if (var_decl.visib_token) |tok| {
        if (token_tags[tok] == .keyword_pub) is_pub = true;
    }
    if (var_decl.extern_token) |tok| {
        _ = tok;
        is_extern = true;
    }
    if (var_decl.comptime_token) |tok| {
        _ = tok;
        is_comptime = true;
    }
    if (var_decl.threadlocal_token) |tok| {
        _ = tok;
        is_threadlocal = true;
    }

    const type_str = if (is_local) "VarDeclStmt" else "VarDecl";
    try writer.writeAll("{\\"type\\":");
    try writeJsonString(writer, type_str);
    try writer.writeAll(",\\"isConst\\":");
    try writer.writeAll(if (is_const) "true" else "false");
    try writer.writeAll(",\\"isPub\\":");
    try writer.writeAll(if (is_pub) "true" else "false");
    try writer.writeAll(",\\"isExtern\\":");
    try writer.writeAll(if (is_extern) "true" else "false");
    try writer.writeAll(",\\"isComptime\\":");
    try writer.writeAll(if (is_comptime) "true" else "false");
    try writer.writeAll(",\\"isThreadlocal\\":");
    try writer.writeAll(if (is_threadlocal) "true" else "false");
    try writer.writeAll(",\\"name\\":");
    try writeJsonString(writer, name);

    if (var_decl.ast.type_node != 0) {
        try writer.writeAll(",\\"typeExpr\\":");
        try dumpNode(tree, var_decl.ast.type_node, writer);
    }
    if (var_decl.ast.align_node != 0) {
        try writer.writeAll(",\\"alignExpr\\":");
        try dumpNode(tree, var_decl.ast.align_node, writer);
    }
    if (var_decl.ast.init_node != 0) {
        try writer.writeAll(",\\"initExpr\\":");
        try dumpNode(tree, var_decl.ast.init_node, writer);
    }
    try writer.writeByte('}');
}

fn dumpFnDecl(tree: std.zig.Ast, node_index: std.zig.Ast.Node.Index, writer: anytype) !void {
    const data = tree.nodes.items(.data)[node_index];
    const body_node = data.rhs;

    // The fn_proto is data.lhs
    const proto_index = data.lhs;
    try dumpFnProtoAsDecl(tree, proto_index, writer, body_node);
}

fn dumpFnProtoAsDecl(tree: std.zig.Ast, proto_index: std.zig.Ast.Node.Index, writer: anytype, body_node: ?std.zig.Ast.Node.Index) !void {
    var buf: [1]std.zig.Ast.Node.Index = undefined;
    const fn_proto = tree.fullFnProto(&buf, proto_index) orelse return;
    const token_tags = tree.tokens.items(.tag);

    var is_pub = false;
    var is_extern = false;
    var is_export = false;
    var is_inline = false;
    var is_comptime = false;

    if (fn_proto.visib_token) |tok| {
        if (token_tags[tok] == .keyword_pub) is_pub = true;
    }
    if (fn_proto.extern_token) |tok| {
        _ = tok;
        is_extern = true;
    }
    // Check for export/inline/comptime by scanning tokens before 'fn'
    if (fn_proto.lib_name) |_| {
        // extern with lib name
        is_extern = true;
    }

    const name_token = fn_proto.name_token orelse return;
    const name = tokenSlice(tree, name_token);

    try writer.writeAll("{\\"type\\":\\"FnDecl\\",\\"isPub\\":");
    try writer.writeAll(if (is_pub) "true" else "false");
    try writer.writeAll(",\\"isExtern\\":");
    try writer.writeAll(if (is_extern) "true" else "false");
    try writer.writeAll(",\\"isExport\\":");
    try writer.writeAll(if (is_export) "true" else "false");
    try writer.writeAll(",\\"isInline\\":");
    try writer.writeAll(if (is_inline) "true" else "false");
    try writer.writeAll(",\\"isComptime\\":");
    try writer.writeAll(if (is_comptime) "true" else "false");
    try writer.writeAll(",\\"name\\":");
    try writeJsonString(writer, name);

    // Params
    try writer.writeAll(",\\"params\\":[");
    var param_it = fn_proto.iterate(tree);
    var first_param = true;
    while (param_it.next()) |param| {
        if (!first_param) try writer.writeByte(',');
        first_param = false;
        try writer.writeAll("{\\"type\\":\\"FnParam\\"");
        if (param.name_token) |nt| {
            try writer.writeAll(",\\"name\\":");
            try writeJsonString(writer, tokenSlice(tree, nt));
        }
        try writer.writeAll(",\\"isComptime\\":false,\\"isNoalias\\":false");
        if (param.type_expr != 0) {
            try writer.writeAll(",\\"typeExpr\\":");
            try dumpNode(tree, param.type_expr, writer);
        }
        try writer.writeByte('}');
    }
    try writer.writeAll("]");

    // Return type
    try writer.writeAll(",\\"returnType\\":");
    if (fn_proto.ast.return_type != 0) {
        try dumpNode(tree, fn_proto.ast.return_type, writer);
    } else {
        try writer.writeAll("{\\"type\\":\\"Identifier\\",\\"name\\":\\"void\\"}");
    }

    // Body
    if (body_node) |body| {
        if (body != 0) {
            try writer.writeAll(",\\"body\\":");
            try dumpNode(tree, body, writer);
        }
    }
    try writer.writeByte('}');
}

fn dumpTestDecl(tree: std.zig.Ast, node_index: std.zig.Ast.Node.Index, writer: anytype) !void {
    const data = tree.nodes.items(.data)[node_index];
    const main_tokens = tree.nodes.items(.main_token);
    const token_tags = tree.tokens.items(.tag);

    try writer.writeAll("{\\"type\\":\\"TestDecl\\"");

    // Test name is the token after 'test'
    const name_token = main_tokens[node_index] + 1;
    if (token_tags[name_token] == .string_literal) {
        const slice = tokenSlice(tree, name_token);
        const inner = slice[1..slice.len - 1];
        try writer.writeAll(",\\"name\\":");
        try writeJsonString(writer, inner);
    }

    try writer.writeAll(",\\"body\\":");
    try dumpNode(tree, data.rhs, writer);
    try writer.writeByte('}');
}
`;

async function runZigDumper(zigSource: string, targetFile: string) {
	const dir = temporaryDirectory();
	const dumperFile = path.join(dir, 'dump_ast.zig');
	await fs.writeFile(dumperFile, zigSource);

	try {
		const result = await execa('zig', ['run', dumperFile, '--', targetFile], { cwd: dir });
		return result.stdout.trim();
	} finally {
		await fs.rm(dir, { recursive: true, force: true });
	}
}

test('empty file', async t => {
	const result = await runParser(
		zigSourceFileParser,
		'',
		stringParserInputCompanion,
	);

	t.deepEqual(result, {
		type: 'Root',
		members: [],
	});
});

test('single const declaration', async t => {
	const result = await runParser(
		zigSourceFileParser,
		'const x = 42;',
		stringParserInputCompanion,
	);

	t.deepEqual(result, {
		type: 'Root',
		members: [{
			type: 'VarDecl',
			isConst: true,
			isPub: false,
			isExtern: false,
			isComptime: false,
			isThreadlocal: false,
			name: 'x',
			initExpr: {
				type: 'IntegerLiteral',
				value: '42',
			},
		}],
	});
});

test('pub const with type annotation', async t => {
	const result = await runParser(
		zigSourceFileParser,
		'pub const x: u32 = 0;',
		stringParserInputCompanion,
	);

	t.deepEqual(result, {
		type: 'Root',
		members: [{
			type: 'VarDecl',
			isConst: true,
			isPub: true,
			isExtern: false,
			isComptime: false,
			isThreadlocal: false,
			name: 'x',
			typeExpr: { type: 'Identifier', name: 'u32' },
			initExpr: { type: 'IntegerLiteral', value: '0' },
		}],
	});
});

test('const with @import', async t => {
	const result = await runParser(
		zigSourceFileParser,
		'const std = @import("std");',
		stringParserInputCompanion,
	);

	t.deepEqual(result, {
		type: 'Root',
		members: [{
			type: 'VarDecl',
			isConst: true,
			isPub: false,
			isExtern: false,
			isComptime: false,
			isThreadlocal: false,
			name: 'std',
			initExpr: {
				type: 'BuiltinCallExpr',
				name: 'import',
				args: [{ type: 'StringLiteral', value: 'std' }],
			},
		}],
	});
});

test('simple function declaration', async t => {
	const result = await runParser(
		zigSourceFileParser,
		'fn add(a: u32, b: u32) u32 { return a + b; }',
		stringParserInputCompanion,
	);

	t.is(result.type, 'Root');
	t.is(result.members.length, 1);
	const fn = result.members[0];
	t.is(fn.type, 'FnDecl');
	if (fn.type === 'FnDecl') {
		t.is(fn.name, 'add');
		t.is(fn.isPub, false);
		t.is(fn.params.length, 2);
		t.is(fn.params[0].name, 'a');
		t.is(fn.params[1].name, 'b');
		t.truthy(fn.body);
	}
});

test('pub fn with no params and void return', async t => {
	const result = await runParser(
		zigSourceFileParser,
		'pub fn main() void {}',
		stringParserInputCompanion,
	);

	t.deepEqual(result, {
		type: 'Root',
		members: [{
			type: 'FnDecl',
			isPub: true,
			isExtern: false,
			isExport: false,
			isInline: false,
			isComptime: false,
			name: 'main',
			params: [],
			returnType: { type: 'Identifier', name: 'void' },
			body: {
				type: 'BlockExpr',
				statements: [],
			},
		}],
	});
});

test('extern fn without body', async t => {
	const result = await runParser(
		zigSourceFileParser,
		'extern fn puts(s: [*]const u8) c_int;',
		stringParserInputCompanion,
	);

	t.is(result.members.length, 1);
	const fn = result.members[0];
	t.is(fn.type, 'FnDecl');
	if (fn.type === 'FnDecl') {
		t.is(fn.isExtern, true);
		t.is(fn.name, 'puts');
		t.is(fn.body, undefined);
	}
});

test('test declaration', async t => {
	const result = await runParser(
		zigSourceFileParser,
		'test "basic test" { const x = 1; }',
		stringParserInputCompanion,
	);

	t.deepEqual(result, {
		type: 'Root',
		members: [{
			type: 'TestDecl',
			name: 'basic test',
			body: {
				type: 'BlockExpr',
				statements: [{
					type: 'VarDeclStmt',
					isConst: true,
					isPub: false,
					isExtern: false,
					isComptime: false,
					isThreadlocal: false,
					name: 'x',
					initExpr: { type: 'IntegerLiteral', value: '1' },
				}],
			},
		}],
	});
});

test('usingnamespace declaration', async t => {
	const result = await runParser(
		zigSourceFileParser,
		'pub usingnamespace @import("c");',
		stringParserInputCompanion,
	);

	t.deepEqual(result, {
		type: 'Root',
		members: [{
			type: 'UsingnamespaceDecl',
			isPub: true,
			expression: {
				type: 'BuiltinCallExpr',
				name: 'import',
				args: [{ type: 'StringLiteral', value: 'c' }],
			},
		}],
	});
});

test('function with return statement', async t => {
	const result = await runParser(
		zigSourceFileParser,
		'fn foo() u32 { return 42; }',
		stringParserInputCompanion,
	);

	const fn = result.members[0];
	if (fn.type === 'FnDecl' && fn.body) {
		t.is(fn.body.statements.length, 1);
		t.deepEqual(fn.body.statements[0], {
			type: 'ReturnStmt',
			value: { type: 'IntegerLiteral', value: '42' },
		});
	} else {
		t.fail('Expected FnDecl with body');
	}
});

test('field access expression', async t => {
	const result = await runParser(
		zigSourceFileParser,
		'const x = std.debug.print;',
		stringParserInputCompanion,
	);

	const decl = result.members[0];
	if (decl.type === 'VarDecl') {
		t.deepEqual(decl.initExpr, {
			type: 'FieldAccessExpr',
			operand: {
				type: 'FieldAccessExpr',
				operand: { type: 'Identifier', name: 'std' },
				member: 'debug',
			},
			member: 'print',
		});
	} else {
		t.fail('Expected VarDecl');
	}
});

test('function call expression', async t => {
	const result = await runParser(
		zigSourceFileParser,
		'const x = foo(1, 2);',
		stringParserInputCompanion,
	);

	const decl = result.members[0];
	if (decl.type === 'VarDecl') {
		t.deepEqual(decl.initExpr, {
			type: 'CallExpr',
			callee: { type: 'Identifier', name: 'foo' },
			args: [
				{ type: 'IntegerLiteral', value: '1' },
				{ type: 'IntegerLiteral', value: '2' },
			],
		});
	} else {
		t.fail('Expected VarDecl');
	}
});

test('binary expression', async t => {
	const result = await runParser(
		zigSourceFileParser,
		'const x = a + b;',
		stringParserInputCompanion,
	);

	const decl = result.members[0];
	if (decl.type === 'VarDecl') {
		t.deepEqual(decl.initExpr, {
			type: 'BinaryExpr',
			operator: '+',
			left: { type: 'Identifier', name: 'a' },
			right: { type: 'Identifier', name: 'b' },
		});
	} else {
		t.fail('Expected VarDecl');
	}
});

test('operator precedence: multiplication before addition', async t => {
	const result = await runParser(
		zigSourceFileParser,
		'const x = a + b * c;',
		stringParserInputCompanion,
	);

	const decl = result.members[0];
	if (decl.type === 'VarDecl') {
		t.deepEqual(decl.initExpr, {
			type: 'BinaryExpr',
			operator: '+',
			left: { type: 'Identifier', name: 'a' },
			right: {
				type: 'BinaryExpr',
				operator: '*',
				left: { type: 'Identifier', name: 'b' },
				right: { type: 'Identifier', name: 'c' },
			},
		});
	} else {
		t.fail('Expected VarDecl');
	}
});

test('error union type', async t => {
	const result = await runParser(
		zigSourceFileParser,
		'fn foo() anyerror!u32 {}',
		stringParserInputCompanion,
	);

	const fn = result.members[0];
	if (fn.type === 'FnDecl') {
		t.deepEqual(fn.returnType, {
			type: 'ErrorUnionType',
			error: { type: 'Identifier', name: 'anyerror' },
			payload: { type: 'Identifier', name: 'u32' },
		});
	} else {
		t.fail('Expected FnDecl');
	}
});

test('if expression in const', async t => {
	const result = await runParser(
		zigSourceFileParser,
		'const x = if (a) b else c;',
		stringParserInputCompanion,
	);

	const decl = result.members[0];
	if (decl.type === 'VarDecl') {
		t.deepEqual(decl.initExpr, {
			type: 'IfExpr',
			condition: { type: 'Identifier', name: 'a' },
			body: { type: 'Identifier', name: 'b' },
			elseBody: { type: 'Identifier', name: 'c' },
		});
	} else {
		t.fail('Expected VarDecl');
	}
});

test('struct init expression', async t => {
	const result = await runParser(
		zigSourceFileParser,
		'const x = .{ .a = 1, .b = 2 };',
		stringParserInputCompanion,
	);

	const decl = result.members[0];
	if (decl.type === 'VarDecl') {
		t.deepEqual(decl.initExpr, {
			type: 'StructInitExpr',
			fields: [
				{ type: 'StructInitField', name: 'a', value: { type: 'IntegerLiteral', value: '1' } },
				{ type: 'StructInitField', name: 'b', value: { type: 'IntegerLiteral', value: '2' } },
			],
		});
	} else {
		t.fail('Expected VarDecl');
	}
});

test('enum literal', async t => {
	const result = await runParser(
		zigSourceFileParser,
		'const x = .foo;',
		stringParserInputCompanion,
	);

	const decl = result.members[0];
	if (decl.type === 'VarDecl') {
		t.deepEqual(decl.initExpr, {
			type: 'EnumLiteral',
			name: 'foo',
		});
	} else {
		t.fail('Expected VarDecl');
	}
});

test('multiple declarations', async t => {
	const source = `
const std = @import("std");

pub fn main() void {}

test "hello" {}
`;
	const result = await runParser(
		zigSourceFileParser,
		source,
		stringParserInputCompanion,
	);

	t.is(result.members.length, 3);
	t.is(result.members[0].type, 'VarDecl');
	t.is(result.members[1].type, 'FnDecl');
	t.is(result.members[2].type, 'TestDecl');
});

test('line comments are skipped', async t => {
	const source = `
// This is a comment
const x = 1;
// Another comment
const y = 2;
`;
	const result = await runParser(
		zigSourceFileParser,
		source,
		stringParserInputCompanion,
	);

	t.is(result.members.length, 2);
});

test('try expression', async t => {
	const result = await runParser(
		zigSourceFileParser,
		'const x = try foo();',
		stringParserInputCompanion,
	);

	const decl = result.members[0];
	if (decl.type === 'VarDecl') {
		t.deepEqual(decl.initExpr, {
			type: 'TryExpr',
			operand: {
				type: 'CallExpr',
				callee: { type: 'Identifier', name: 'foo' },
				args: [],
			},
		});
	} else {
		t.fail('Expected VarDecl');
	}
});

test('unary negation', async t => {
	const result = await runParser(
		zigSourceFileParser,
		'const x = -a;',
		stringParserInputCompanion,
	);

	const decl = result.members[0];
	if (decl.type === 'VarDecl') {
		t.deepEqual(decl.initExpr, {
			type: 'UnaryExpr',
			operator: '-',
			operand: { type: 'Identifier', name: 'a' },
		});
	} else {
		t.fail('Expected VarDecl');
	}
});

test('bool and null literals', async t => {
	const source = `
const a = true;
const b = false;
const c = null;
const d = undefined;
`;
	const result = await runParser(
		zigSourceFileParser,
		source,
		stringParserInputCompanion,
	);

	t.is(result.members.length, 4);
	if (result.members[0].type === 'VarDecl') {
		t.deepEqual(result.members[0].initExpr, { type: 'BoolLiteral', value: true });
	}
	if (result.members[1].type === 'VarDecl') {
		t.deepEqual(result.members[1].initExpr, { type: 'BoolLiteral', value: false });
	}
	if (result.members[2].type === 'VarDecl') {
		t.deepEqual(result.members[2].initExpr, { type: 'NullLiteral' });
	}
	if (result.members[3].type === 'VarDecl') {
		t.deepEqual(result.members[3].initExpr, { type: 'UndefinedLiteral' });
	}
});

test('assignment statement in function body', async t => {
	const result = await runParser(
		zigSourceFileParser,
		'fn foo() void { x = 1; }',
		stringParserInputCompanion,
	);

	const fn = result.members[0];
	if (fn.type === 'FnDecl' && fn.body) {
		t.deepEqual(fn.body.statements[0], {
			type: 'AssignStmt',
			target: { type: 'Identifier', name: 'x' },
			operator: '=',
			value: { type: 'IntegerLiteral', value: '1' },
		});
	} else {
		t.fail('Expected FnDecl with body');
	}
});

test('defer statement', async t => {
	const result = await runParser(
		zigSourceFileParser,
		'fn foo() void { defer bar(); }',
		stringParserInputCompanion,
	);

	const fn = result.members[0];
	if (fn.type === 'FnDecl' && fn.body) {
		const stmt = fn.body.statements[0];
		t.is(stmt.type, 'DeferStmt');
		if (stmt.type === 'DeferStmt') {
			t.is(stmt.isErrdefer, false);
		}
	} else {
		t.fail('Expected FnDecl with body');
	}
});

test('orelse expression', async t => {
	const result = await runParser(
		zigSourceFileParser,
		'const x = a orelse b;',
		stringParserInputCompanion,
	);

	const decl = result.members[0];
	if (decl.type === 'VarDecl') {
		t.deepEqual(decl.initExpr, {
			type: 'BinaryExpr',
			operator: 'orelse',
			left: { type: 'Identifier', name: 'a' },
			right: { type: 'Identifier', name: 'b' },
		});
	} else {
		t.fail('Expected VarDecl');
	}
});

// Integration test: compare with Zig reference parser
const compareWithZigParser = test.macro({
	title: (_, relativePath: string) => `compare: ${relativePath}`,
	exec: async (t, relativePath: string) => {
		if (!await hasZigPromise) {
			t.pass('skipping test because zig is not available');
			return;
		}

		await using repo = await cloneZigRepo();
		const filePath = path.join(repo.path, relativePath);

		// Parse with Zig reference (std.zig.Ast)
		const zigOutput = await runZigDumper(zigAstDumperSnippet, filePath);
		const expected = JSON.parse(zigOutput);

		// Parse with our parser
		const source = await fs.readFile(filePath, 'utf-8');
		const actual = await runParser(
			zigSourceFileParser,
			source,
			stringParserInputCompanion,
		);

		// Compare full AST
		t.deepEqual(actual, expected);
	},
});

test(compareWithZigParser, 'lib/std/once.zig');
