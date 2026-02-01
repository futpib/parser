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

const zigCommit = '0.15.2';

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
    const source = try std.fs.cwd().readFileAllocOptions(allocator, file_path, std.math.maxInt(u32), null, .@"1", 0);
    defer allocator.free(source);

    var tree = try std.zig.Ast.parse(allocator, source, .zig);
    defer tree.deinit(allocator);

    var list: std.ArrayList(u8) = .{};
    defer list.deinit(allocator);

    try dumpRoot(allocator, &tree, list.writer(allocator));
    try list.writer(allocator).writeByte('\\n');
    _ = try std.posix.write(std.posix.STDOUT_FILENO, list.items);
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

fn unescapeZigStringLiteral(allocator: std.mem.Allocator, raw: []const u8) ![]const u8 {
    var list: std.ArrayList(u8) = .{};
    errdefer list.deinit(allocator);
    var i: usize = 0;
    while (i < raw.len) {
        if (raw[i] == '\\\\' and i + 1 < raw.len) {
            const next = raw[i + 1];
            switch (next) {
                'n' => { try list.append(allocator, '\\n'); i += 2; },
                't' => { try list.append(allocator, '\\t'); i += 2; },
                'r' => { try list.append(allocator, '\\r'); i += 2; },
                '\\\\' => { try list.append(allocator, '\\\\'); i += 2; },
                '"' => { try list.append(allocator, '"'); i += 2; },
                '\\'' => { try list.append(allocator, '\\''); i += 2; },
                'x' => {
                    if (i + 3 < raw.len) {
                        const byte = std.fmt.parseInt(u8, raw[i+2..i+4], 16) catch {
                            try list.append(allocator, raw[i]);
                            i += 1;
                            continue;
                        };
                        try list.append(allocator, byte);
                        i += 4;
                    } else {
                        try list.append(allocator, raw[i]);
                        i += 1;
                    }
                },
                'u' => {
                    if (i + 2 < raw.len and raw[i + 2] == '{') {
                        const close = std.mem.indexOfScalarPos(u8, raw, i + 3, '}') orelse {
                            try list.append(allocator, raw[i]);
                            i += 1;
                            continue;
                        };
                        const codepoint = std.fmt.parseInt(u21, raw[i+3..close], 16) catch {
                            try list.append(allocator, raw[i]);
                            i += 1;
                            continue;
                        };
                        var buf: [4]u8 = undefined;
                        const len = std.unicode.utf8Encode(codepoint, &buf) catch {
                            try list.append(allocator, raw[i]);
                            i += 1;
                            continue;
                        };
                        try list.appendSlice(allocator, buf[0..len]);
                        i = close + 1;
                    } else {
                        try list.append(allocator, raw[i]);
                        i += 1;
                    }
                },
                else => {
                    try list.append(allocator, raw[i]);
                    i += 1;
                },
            }
        } else {
            try list.append(allocator, raw[i]);
            i += 1;
        }
    }
    return list.toOwnedSlice(allocator);
}

const Ast = std.zig.Ast;
const Node = Ast.Node;

fn dumpRoot(allocator: std.mem.Allocator, tree: *const Ast, writer: anytype) !void {
    try writer.writeAll("{\\"type\\":\\"Root\\",\\"members\\":[");
    const root_decls = tree.rootDecls();
    for (root_decls, 0..) |decl, i| {
        if (i > 0) try writer.writeByte(',');
        try dumpNode(allocator, tree, decl, writer);
    }
    try writer.writeAll("]}");
}

fn dumpNode(allocator: std.mem.Allocator, tree: *const Ast, node_index: Node.Index, writer: anytype) anyerror!void {
    if (node_index == .root) {
        try writer.writeAll("null");
        return;
    }
    const tag = tree.nodeTag(node_index);
    const data = tree.nodeData(node_index);
    const main_token = tree.nodeMainToken(node_index);

    switch (tag) {
        .identifier => {
            const name = tree.tokenSlice(main_token);
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
            const slice = tree.tokenSlice(main_token);
            try writer.writeAll("{\\"type\\":\\"IntegerLiteral\\",\\"value\\":");
            try writeJsonString(writer, slice);
            try writer.writeByte('}');
        },
        .string_literal => {
            const slice = tree.tokenSlice(main_token);
            const inner = slice[1..slice.len - 1];
            const unescaped = try unescapeZigStringLiteral(allocator, inner);
            defer allocator.free(unescaped);
            try writer.writeAll("{\\"type\\":\\"StringLiteral\\",\\"value\\":");
            try writeJsonString(writer, unescaped);
            try writer.writeByte('}');
        },
        .enum_literal => {
            const name = tree.tokenSlice(main_token);
            try writer.writeAll("{\\"type\\":\\"EnumLiteral\\",\\"name\\":");
            try writeJsonString(writer, name);
            try writer.writeByte('}');
        },
        .builtin_call_two, .builtin_call_two_comma => {
            const name = tree.tokenSlice(main_token);
            try writer.writeAll("{\\"type\\":\\"BuiltinCallExpr\\",\\"name\\":");
            try writeJsonString(writer, name[1..]);
            try writer.writeAll(",\\"args\\":[");
            const args = data.opt_node_and_opt_node;
            var arg_count: u32 = 0;
            if (args[0].unwrap()) |arg| {
                try dumpNode(allocator, tree,arg, writer);
                arg_count += 1;
            }
            if (args[1].unwrap()) |arg| {
                if (arg_count > 0) try writer.writeByte(',');
                try dumpNode(allocator, tree,arg, writer);
            }
            try writer.writeAll("]}");
        },
        .builtin_call, .builtin_call_comma => {
            const name = tree.tokenSlice(main_token);
            try writer.writeAll("{\\"type\\":\\"BuiltinCallExpr\\",\\"name\\":");
            try writeJsonString(writer, name[1..]);
            try writer.writeAll(",\\"args\\":[");
            const args_range = tree.extraDataSlice(data.extra_range, Node.Index);
            for (args_range, 0..) |arg, i| {
                if (i > 0) try writer.writeByte(',');
                try dumpNode(allocator, tree,arg, writer);
            }
            try writer.writeAll("]}");
        },
        .field_access => {
            const fa = data.node_and_token;
            try writer.writeAll("{\\"type\\":\\"FieldAccessExpr\\",\\"operand\\":");
            try dumpNode(allocator, tree,fa[0], writer);
            try writer.writeAll(",\\"member\\":");
            try writeJsonString(writer, tree.tokenSlice(fa[1]));
            try writer.writeByte('}');
        },
        .call_one, .call_one_comma => {
            const callee, const first_arg = data.node_and_opt_node;
            try writer.writeAll("{\\"type\\":\\"CallExpr\\",\\"callee\\":");
            try dumpNode(allocator, tree,callee, writer);
            try writer.writeAll(",\\"args\\":[");
            if (first_arg.unwrap()) |arg| {
                try dumpNode(allocator, tree,arg, writer);
            }
            try writer.writeAll("]}");
        },
        .call, .call_comma => {
            var buf1: [1]Node.Index = undefined;
            const full_call = tree.fullCall(&buf1, node_index) orelse {
                try writer.writeAll("{\\"type\\":\\"Unknown\\",\\"tag\\":\\"call_error\\"}");
                return;
            };
            try writer.writeAll("{\\"type\\":\\"CallExpr\\",\\"callee\\":");
            try dumpNode(allocator, tree,full_call.ast.fn_expr, writer);
            try writer.writeAll(",\\"args\\":[");
            for (full_call.ast.params, 0..) |arg, i| {
                if (i > 0) try writer.writeByte(',');
                try dumpNode(allocator, tree,arg, writer);
            }
            try writer.writeAll("]}");
        },
        .add, .sub, .mul, .div, .mod,
        .shl, .shr,
        .bit_and, .bit_or, .bit_xor,
        .equal_equal, .bang_equal,
        .less_than, .greater_than, .less_or_equal, .greater_or_equal,
        .bool_and, .bool_or,
        .@"orelse",
        .@"catch",
        .array_cat, .array_mult,
        .merge_error_sets,
        .error_union,
        => {
            const lhs, const rhs = data.node_and_node;
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
                .@"orelse" => "orelse",
                .@"catch" => "catch",
                .array_cat => "++",
                .array_mult => "**",
                .merge_error_sets => "||",
                .error_union => "!",
                else => unreachable,
            };
            if (tag == .error_union) {
                try writer.writeAll("{\\"type\\":\\"ErrorUnionType\\",\\"error\\":");
                try dumpNode(allocator, tree,lhs, writer);
                try writer.writeAll(",\\"payload\\":");
                try dumpNode(allocator, tree,rhs, writer);
                try writer.writeByte('}');
            } else {
                try writer.writeAll("{\\"type\\":\\"BinaryExpr\\",\\"operator\\":");
                try writeJsonString(writer, op_str);
                try writer.writeAll(",\\"left\\":");
                try dumpNode(allocator, tree,lhs, writer);
                try writer.writeAll(",\\"right\\":");
                try dumpNode(allocator, tree,rhs, writer);
                try writer.writeByte('}');
            }
        },
        .negation => {
            try writer.writeAll("{\\"type\\":\\"UnaryExpr\\",\\"operator\\":\\"-\\",\\"operand\\":");
            try dumpNode(allocator, tree,data.node, writer);
            try writer.writeByte('}');
        },
        .bit_not => {
            try writer.writeAll("{\\"type\\":\\"UnaryExpr\\",\\"operator\\":\\"~\\",\\"operand\\":");
            try dumpNode(allocator, tree,data.node, writer);
            try writer.writeByte('}');
        },
        .bool_not => {
            try writer.writeAll("{\\"type\\":\\"UnaryExpr\\",\\"operator\\":\\"!\\",\\"operand\\":");
            try dumpNode(allocator, tree,data.node, writer);
            try writer.writeByte('}');
        },
        .address_of => {
            try writer.writeAll("{\\"type\\":\\"UnaryExpr\\",\\"operator\\":\\"&\\",\\"operand\\":");
            try dumpNode(allocator, tree,data.node, writer);
            try writer.writeByte('}');
        },
        .@"try" => {
            try writer.writeAll("{\\"type\\":\\"TryExpr\\",\\"operand\\":");
            try dumpNode(allocator, tree,data.node, writer);
            try writer.writeByte('}');
        },
        .@"comptime" => {
            try writer.writeAll("{\\"type\\":\\"ComptimeExpr\\",\\"operand\\":");
            try dumpNode(allocator, tree,data.node, writer);
            try writer.writeByte('}');
        },
        .optional_type => {
            try writer.writeAll("{\\"type\\":\\"OptionalType\\",\\"child\\":");
            try dumpNode(allocator, tree,data.node, writer);
            try writer.writeByte('}');
        },
        .@"return" => {
            try writer.writeAll("{\\"type\\":\\"ReturnStmt\\"");
            if (data.opt_node.unwrap()) |val| {
                try writer.writeAll(",\\"value\\":");
                try dumpNode(allocator, tree,val, writer);
            }
            try writer.writeByte('}');
        },
        .@"break" => {
            const label_tok, const val = data.opt_token_and_opt_node;
            try writer.writeAll("{\\"type\\":\\"BreakStmt\\"");
            if (label_tok != .none) {
                try writer.writeAll(",\\"label\\":");
                try writeJsonString(writer, tree.tokenSlice(@intFromEnum(label_tok)));
            }
            if (val.unwrap()) |v| {
                try writer.writeAll(",\\"value\\":");
                try dumpNode(allocator, tree,v, writer);
            }
            try writer.writeByte('}');
        },
        .@"continue" => {
            const label_tok, const val = data.opt_token_and_opt_node;
            _ = val;
            try writer.writeAll("{\\"type\\":\\"ContinueStmt\\"");
            if (label_tok != .none) {
                try writer.writeAll(",\\"label\\":");
                try writeJsonString(writer, tree.tokenSlice(@intFromEnum(label_tok)));
            }
            try writer.writeByte('}');
        },
        .grouped_expression => {
            try dumpNode(allocator, tree,data.node_and_token[0], writer);
        },
        .block_two, .block_two_semicolon => {
            try writer.writeAll("{\\"type\\":\\"BlockExpr\\",\\"statements\\":[");
            const stmts = data.opt_node_and_opt_node;
            var count: u32 = 0;
            if (stmts[0].unwrap()) |s| {
                try dumpNode(allocator, tree,s, writer);
                count += 1;
            }
            if (stmts[1].unwrap()) |s| {
                if (count > 0) try writer.writeByte(',');
                try dumpNode(allocator, tree,s, writer);
            }
            try writer.writeAll("]}");
        },
        .block, .block_semicolon => {
            try writer.writeAll("{\\"type\\":\\"BlockExpr\\",\\"statements\\":[");
            const stmts = tree.extraDataSlice(data.extra_range, Node.Index);
            for (stmts, 0..) |stmt, i| {
                if (i > 0) try writer.writeByte(',');
                try dumpNode(allocator, tree,stmt, writer);
            }
            try writer.writeAll("]}");
        },
        .simple_var_decl => {
            try dumpVarDecl(allocator, tree,node_index, writer);
        },
        .global_var_decl => {
            try dumpVarDecl(allocator, tree,node_index, writer);
        },
        .local_var_decl => {
            try dumpVarDecl(allocator, tree,node_index, writer);
        },
        .aligned_var_decl => {
            try dumpVarDecl(allocator, tree,node_index, writer);
        },
        .fn_decl => {
            try dumpFnDecl(allocator, tree,node_index, writer);
        },
        .fn_proto_simple => {
            try dumpFnProtoAsDecl(allocator, tree,node_index, writer, null);
        },
        .fn_proto_multi => {
            try dumpFnProtoAsDecl(allocator, tree,node_index, writer, null);
        },
        .fn_proto_one => {
            try dumpFnProtoAsDecl(allocator, tree,node_index, writer, null);
        },
        .fn_proto => {
            try dumpFnProtoAsDecl(allocator, tree,node_index, writer, null);
        },
        .test_decl => {
            try dumpTestDecl(allocator, tree,node_index, writer);
        },
        .assign => {
            const lhs, const rhs = data.node_and_node;
            try writer.writeAll("{\\"type\\":\\"AssignStmt\\",\\"target\\":");
            try dumpNode(allocator, tree,lhs, writer);
            try writer.writeAll(",\\"operator\\":\\"=\\",\\"value\\":");
            try dumpNode(allocator, tree,rhs, writer);
            try writer.writeByte('}');
        },
        .assign_add => {
            const lhs, const rhs = data.node_and_node;
            try writer.writeAll("{\\"type\\":\\"AssignStmt\\",\\"target\\":");
            try dumpNode(allocator, tree,lhs, writer);
            try writer.writeAll(",\\"operator\\":\\"+=\\",\\"value\\":");
            try dumpNode(allocator, tree,rhs, writer);
            try writer.writeByte('}');
        },
        .@"defer" => {
            try writer.writeAll("{\\"type\\":\\"DeferStmt\\",\\"isErrdefer\\":false,\\"body\\":");
            try dumpNode(allocator, tree,data.node, writer);
            try writer.writeByte('}');
        },
        .@"errdefer" => {
            const body = data.opt_token_and_node[1];
            try writer.writeAll("{\\"type\\":\\"DeferStmt\\",\\"isErrdefer\\":true,\\"body\\":");
            try dumpNode(allocator, tree,body, writer);
            try writer.writeByte('}');
        },
        .if_simple => {
            const full_if = tree.ifSimple(node_index);
            try dumpIfExpr(allocator, tree,full_if, writer);
        },
        .@"if" => {
            const full_if = tree.ifFull(node_index);
            try dumpIfExpr(allocator, tree,full_if, writer);
        },
        .struct_init_dot_two, .struct_init_dot_two_comma => {
            var buf2: [2]Node.Index = undefined;
            const si = tree.structInitDotTwo(&buf2, node_index);
            try dumpStructInit(allocator, tree,si, writer);
        },
        .struct_init_dot, .struct_init_dot_comma => {
            const si = tree.structInitDot(node_index);
            try dumpStructInit(allocator, tree,si, writer);
        },
        .struct_init_one, .struct_init_one_comma => {
            var buf1: [1]Node.Index = undefined;
            const si = tree.structInitOne(&buf1, node_index);
            try dumpStructInit(allocator, tree,si, writer);
        },
        .struct_init, .struct_init_comma => {
            const si = tree.structInit(node_index);
            try dumpStructInit(allocator, tree,si, writer);
        },
        .array_init_one, .array_init_one_comma => {
            var buf1: [1]Node.Index = undefined;
            const ai = tree.arrayInitOne(&buf1, node_index);
            try dumpArrayInit(allocator, tree,ai, writer);
        },
        .array_init_dot_two, .array_init_dot_two_comma => {
            var buf2: [2]Node.Index = undefined;
            const ai = tree.arrayInitDotTwo(&buf2, node_index);
            try dumpArrayInit(allocator, tree,ai, writer);
        },
        .array_init_dot, .array_init_dot_comma => {
            const ai = tree.arrayInitDot(node_index);
            try dumpArrayInit(allocator, tree,ai, writer);
        },
        .array_init, .array_init_comma => {
            const ai = tree.arrayInit(node_index);
            try dumpArrayInit(allocator, tree,ai, writer);
        },
        .deref => {
            try writer.writeAll("{\\"type\\":\\"FieldAccessExpr\\",\\"operand\\":");
            try dumpNode(allocator, tree,data.node, writer);
            try writer.writeAll(",\\"member\\":\\"*\\"}");
        },
        .unwrap_optional => {
            try writer.writeAll("{\\"type\\":\\"FieldAccessExpr\\",\\"operand\\":");
            try dumpNode(allocator, tree,data.node, writer);
            try writer.writeAll(",\\"member\\":\\"?\\"}");
        },
        .slice_open => {
            const lhs, const start = data.node_and_node;
            try writer.writeAll("{\\"type\\":\\"SliceExpr\\",\\"operand\\":");
            try dumpNode(allocator, tree,lhs, writer);
            try writer.writeAll(",\\"start\\":");
            try dumpNode(allocator, tree,start, writer);
            try writer.writeAll("}");
        },
        .slice, .slice_sentinel => {
            const full_slice = tree.fullSlice(node_index) orelse {
                try writer.writeAll("{\\"type\\":\\"Unknown\\",\\"tag\\":\\"slice_error\\"}");
                return;
            };
            try writer.writeAll("{\\"type\\":\\"SliceExpr\\",\\"operand\\":");
            try dumpNode(allocator, tree,full_slice.ast.sliced, writer);
            try writer.writeAll(",\\"start\\":");
            try dumpNode(allocator, tree,full_slice.ast.start, writer);
            if (full_slice.ast.end.unwrap()) |end| {
                try writer.writeAll(",\\"end\\":");
                try dumpNode(allocator, tree,end, writer);
            }
            try writer.writeAll("}");
        },
        .array_access => {
            const lhs, const index = data.node_and_node;
            try writer.writeAll("{\\"type\\":\\"IndexExpr\\",\\"operand\\":");
            try dumpNode(allocator, tree,lhs, writer);
            try writer.writeAll(",\\"index\\":");
            try dumpNode(allocator, tree,index, writer);
            try writer.writeAll("}");
        },
        .array_type => {
            const full_at = tree.arrayType(node_index);
            try writer.writeAll("{\\"type\\":\\"ArrayType\\",\\"length\\":");
            try dumpNode(allocator, tree,full_at.ast.elem_count, writer);
            try writer.writeAll(",\\"child\\":");
            try dumpNode(allocator, tree,full_at.ast.elem_type, writer);
            try writer.writeAll("}");
        },
        .array_type_sentinel => {
            const full_at = tree.arrayTypeSentinel(node_index);
            try writer.writeAll("{\\"type\\":\\"ArrayType\\",\\"length\\":");
            try dumpNode(allocator, tree,full_at.ast.elem_count, writer);
            if (full_at.ast.sentinel.unwrap()) |sentinel| {
                try writer.writeAll(",\\"sentinel\\":");
                try dumpNode(allocator, tree,sentinel, writer);
            }
            try writer.writeAll(",\\"child\\":");
            try dumpNode(allocator, tree,full_at.ast.elem_type, writer);
            try writer.writeAll("}");
        },
        .ptr_type_aligned, .ptr_type_sentinel, .ptr_type, .ptr_type_bit_range => {
            const full_pt = tree.fullPtrType(node_index) orelse {
                try writer.writeAll("{\\"type\\":\\"Unknown\\",\\"tag\\":\\"ptr_type_error\\"}");
                return;
            };
            try writer.writeAll("{\\"type\\":\\"PointerType\\",\\"size\\":");
            const size_str = switch (full_pt.size) {
                .one => "\\"one\\"",
                .many => "\\"many\\"",
                .slice => "\\"slice\\"",
                .c => "\\"c\\"",
            };
            try writer.writeAll(size_str);
            try writer.writeAll(",\\"isConst\\":");
            try writer.writeAll(if (full_pt.const_token != null) "true" else "false");
            try writer.writeAll(",\\"child\\":");
            try dumpNode(allocator, tree,full_pt.ast.child_type, writer);
            try writer.writeAll("}");
        },
        .for_simple => {
            try dumpForLoop(allocator, tree,tree.forSimple(node_index), writer);
        },
        .for_range => {
            // lhs..rhs range expression (used inside for inputs)
            const lhs, const rhs_opt = data.node_and_opt_node;
            try writer.writeAll("{\\"type\\":\\"BinaryExpr\\",\\"operator\\":\\"..\\",\\"left\\":");
            try dumpNode(allocator, tree,lhs, writer);
            try writer.writeAll(",\\"right\\":");
            if (rhs_opt.unwrap()) |rhs| {
                try dumpNode(allocator, tree,rhs, writer);
            } else {
                try writer.writeAll("null");
            }
            try writer.writeAll("}");
        },
        .@"for" => {
            try dumpForLoop(allocator, tree,tree.forFull(node_index), writer);
        },
        .while_simple => {
            const full_while = tree.whileSimple(node_index);
            try dumpWhileLoop(allocator, tree,full_while, writer);
        },
        .while_cont => {
            const full_while = tree.whileCont(node_index);
            try dumpWhileLoop(allocator, tree,full_while, writer);
        },
        .@"while" => {
            const full_while = tree.whileFull(node_index);
            try dumpWhileLoop(allocator, tree,full_while, writer);
        },
        .container_decl_two, .container_decl_two_trailing => {
            var buf2: [2]Node.Index = undefined;
            const cd = tree.containerDeclTwo(&buf2, node_index);
            try dumpContainerDecl(allocator, tree,cd, writer);
        },
        .container_decl, .container_decl_trailing => {
            const cd = tree.containerDecl(node_index);
            try dumpContainerDecl(allocator, tree,cd, writer);
        },
        .container_field_init => {
            try dumpContainerField(allocator, tree,tree.containerFieldInit(node_index), writer);
        },
        .container_field => {
            try dumpContainerField(allocator, tree,tree.containerField(node_index), writer);
        },
        .char_literal => {
            const slice = tree.tokenSlice(main_token);
            const inner = slice[1..slice.len - 1];
            const unescaped = try unescapeZigStringLiteral(allocator, inner);
            defer allocator.free(unescaped);
            try writer.writeAll("{\\"type\\":\\"CharLiteral\\",\\"value\\":");
            try writeJsonString(writer, unescaped);
            try writer.writeByte('}');
        },
        .multiline_string_literal => {
            const slice = tree.tokenSlice(main_token);
            try writer.writeAll("{\\"type\\":\\"MultilineStringLiteral\\",\\"value\\":");
            try writeJsonString(writer, slice);
            try writer.writeByte('}');
        },
        .error_set_decl => {
            try writer.writeAll("{\\"type\\":\\"ErrorSetExpr\\",\\"names\\":[");
            // Iterate tokens between the { and } of error set
            var tok = main_token + 2; // skip 'error' and '{'
            var first = true;
            while (true) {
                const tok_tag = tree.tokenTag(tok);
                if (tok_tag == .r_brace) break;
                if (tok_tag == .identifier) {
                    if (!first) try writer.writeByte(',');
                    first = false;
                    try writeJsonString(writer, tree.tokenSlice(tok));
                }
                tok += 1;
            }
            try writer.writeAll("]}");
        },
        .@"switch", .switch_comma => {
            const full_switch = tree.fullSwitch(node_index) orelse {
                try writer.writeAll("{\\"type\\":\\"Unknown\\",\\"tag\\":\\"switch_error\\"}");
                return;
            };
            try writer.writeAll("{\\"type\\":\\"SwitchExpr\\",\\"operand\\":");
            try dumpNode(allocator, tree,full_switch.ast.condition, writer);
            try writer.writeAll(",\\"prongs\\":[");
            for (full_switch.ast.cases, 0..) |case, i| {
                if (i > 0) try writer.writeByte(',');
                const full_case = tree.fullSwitchCase(case) orelse continue;
                try dumpSwitchProng(allocator, tree,full_case, writer);
            }
            try writer.writeAll("]}");
        },
        .assign_mul => {
            const lhs, const rhs = data.node_and_node;
            try writer.writeAll("{\\"type\\":\\"AssignStmt\\",\\"target\\":");
            try dumpNode(allocator, tree,lhs, writer);
            try writer.writeAll(",\\"operator\\":\\"*=\\",\\"value\\":");
            try dumpNode(allocator, tree,rhs, writer);
            try writer.writeByte('}');
        },
        .assign_sub => {
            const lhs, const rhs = data.node_and_node;
            try writer.writeAll("{\\"type\\":\\"AssignStmt\\",\\"target\\":");
            try dumpNode(allocator, tree,lhs, writer);
            try writer.writeAll(",\\"operator\\":\\"-=\\",\\"value\\":");
            try dumpNode(allocator, tree,rhs, writer);
            try writer.writeByte('}');
        },
        else => {
            try writer.writeAll("{\\"type\\":\\"Unknown\\",\\"tag\\":");
            try writeJsonString(writer, @tagName(tag));
            try writer.writeByte('}');
        },
    }
}

fn dumpIfExpr(allocator: std.mem.Allocator, tree: *const Ast, full_if: Ast.full.If, writer: anytype) !void {
    try writer.writeAll("{\\"type\\":\\"IfExpr\\",\\"condition\\":");
    try dumpNode(allocator, tree,full_if.ast.cond_expr, writer);
    try writer.writeAll(",\\"body\\":");
    try dumpNode(allocator, tree,full_if.ast.then_expr, writer);
    if (full_if.ast.else_expr.unwrap()) |else_expr| {
        try writer.writeAll(",\\"elseBody\\":");
        try dumpNode(allocator, tree,else_expr, writer);
    }
    try writer.writeByte('}');
}

fn dumpStructInit(allocator: std.mem.Allocator, tree: *const Ast, si: Ast.full.StructInit, writer: anytype) !void {
    try writer.writeAll("{\\"type\\":\\"StructInitExpr\\"");
    if (si.ast.type_expr.unwrap()) |te| {
        try writer.writeAll(",\\"operand\\":");
        try dumpNode(allocator, tree,te, writer);
    }
    try writer.writeAll(",\\"fields\\":[");
    for (si.ast.fields, 0..) |field, i| {
        if (i > 0) try writer.writeByte(',');
        const name_token = tree.firstToken(field) - 2;
        try writer.writeAll("{\\"type\\":\\"StructInitField\\",\\"name\\":");
        try writeJsonString(writer, tree.tokenSlice(name_token));
        try writer.writeAll(",\\"value\\":");
        try dumpNode(allocator, tree,field, writer);
        try writer.writeByte('}');
    }
    try writer.writeAll("]}");
}

fn dumpVarDecl(allocator: std.mem.Allocator, tree: *const Ast, node_index: Node.Index, writer: anytype) !void {
    const var_decl = tree.fullVarDecl(node_index) orelse {
        try writer.writeAll("{\\"type\\":\\"Unknown\\",\\"tag\\":\\"var_decl_error\\"}");
        return;
    };
    const main_token = tree.nodeMainToken(node_index);

    const is_const = tree.tokenTag(main_token) == .keyword_const;
    const name_token = main_token + 1;
    const name = tree.tokenSlice(name_token);

    const is_pub = if (var_decl.visib_token) |tok| tree.tokenTag(tok) == .keyword_pub else false;
    const is_extern = var_decl.extern_export_token != null;
    const is_comptime = var_decl.comptime_token != null;
    const is_threadlocal = var_decl.threadlocal_token != null;

    const type_str = "VarDecl";
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

    if (var_decl.ast.type_node.unwrap()) |type_node| {
        try writer.writeAll(",\\"typeExpr\\":");
        try dumpNode(allocator, tree,type_node, writer);
    }
    if (var_decl.ast.align_node.unwrap()) |align_node| {
        try writer.writeAll(",\\"alignExpr\\":");
        try dumpNode(allocator, tree,align_node, writer);
    }
    if (var_decl.ast.init_node.unwrap()) |init_node| {
        try writer.writeAll(",\\"initExpr\\":");
        try dumpNode(allocator, tree,init_node, writer);
    }
    try writer.writeByte('}');
}

fn dumpFnDecl(allocator: std.mem.Allocator, tree: *const Ast, node_index: Node.Index, writer: anytype) !void {
    const proto_index, const body_node = tree.nodeData(node_index).node_and_node;
    try dumpFnProtoAsDecl(allocator, tree,proto_index, writer, body_node);
}

fn dumpFnProtoAsDecl(allocator: std.mem.Allocator, tree: *const Ast, proto_index: Node.Index, writer: anytype, body_node: ?Node.Index) !void {
    var buf: [1]Node.Index = undefined;
    const fn_proto = tree.fullFnProto(&buf, proto_index) orelse {
        try writer.writeAll("{\\"type\\":\\"Unknown\\",\\"tag\\":\\"fn_proto_error\\"}");
        return;
    };

    var is_pub = false;
    var is_extern = false;
    const is_export = false;
    const is_inline = false;
    const is_comptime = false;

    if (fn_proto.visib_token) |tok| {
        if (tree.tokenTag(tok) == .keyword_pub) is_pub = true;
    }
    if (fn_proto.extern_export_inline_token) |tok| {
        if (tree.tokenTag(tok) == .keyword_extern) is_extern = true;
    }
    if (fn_proto.lib_name) |_| {
        is_extern = true;
    }

    const name_token = fn_proto.name_token orelse {
        try dumpFnProtoType(allocator, tree,fn_proto, writer);
        return;
    };
    const name = tree.tokenSlice(name_token);

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
            try writeJsonString(writer, tree.tokenSlice(nt));
        }
        const param_is_comptime = param.comptime_noalias != null and tree.tokenTag(param.comptime_noalias.?) == .keyword_comptime;
        const param_is_noalias = param.comptime_noalias != null and tree.tokenTag(param.comptime_noalias.?) == .keyword_noalias;
        try writer.writeAll(",\\"isComptime\\":");
        try writer.writeAll(if (param_is_comptime) "true" else "false");
        try writer.writeAll(",\\"isNoalias\\":");
        try writer.writeAll(if (param_is_noalias) "true" else "false");
        if (param.type_expr) |te| {
            try writer.writeAll(",\\"typeExpr\\":");
            try dumpNode(allocator, tree,te, writer);
        }
        try writer.writeByte('}');
    }
    try writer.writeAll("]");

    // Return type
    try writer.writeAll(",\\"returnType\\":");
    if (fn_proto.ast.return_type.unwrap()) |rt| {
        try dumpNode(allocator, tree,rt, writer);
    } else {
        try writer.writeAll("{\\"type\\":\\"Identifier\\",\\"name\\":\\"void\\"}");
    }

    // Body
    if (body_node) |body| {
        if (body != .root) {
            try writer.writeAll(",\\"body\\":");
            try dumpNode(allocator, tree,body, writer);
        }
    }
    try writer.writeByte('}');
}

fn dumpFnProtoType(allocator: std.mem.Allocator, tree: *const Ast, fn_proto: Ast.full.FnProto, writer: anytype) !void {
    try writer.writeAll("{\\"type\\":\\"FnProtoType\\",\\"params\\":[");
    var param_it = fn_proto.iterate(tree);
    var first_param = true;
    while (param_it.next()) |param| {
        if (!first_param) try writer.writeByte(',');
        first_param = false;
        try writer.writeAll("{\\"type\\":\\"FnParam\\"");
        if (param.name_token) |nt| {
            try writer.writeAll(",\\"name\\":");
            try writeJsonString(writer, tree.tokenSlice(nt));
        }
        const param_is_comptime = param.comptime_noalias != null and tree.tokenTag(param.comptime_noalias.?) == .keyword_comptime;
        const param_is_noalias = param.comptime_noalias != null and tree.tokenTag(param.comptime_noalias.?) == .keyword_noalias;
        try writer.writeAll(",\\"isComptime\\":");
        try writer.writeAll(if (param_is_comptime) "true" else "false");
        try writer.writeAll(",\\"isNoalias\\":");
        try writer.writeAll(if (param_is_noalias) "true" else "false");
        if (param.type_expr) |te| {
            try writer.writeAll(",\\"typeExpr\\":");
            try dumpNode(allocator, tree,te, writer);
        }
        try writer.writeByte('}');
    }
    try writer.writeAll("],\\"returnType\\":");
    if (fn_proto.ast.return_type.unwrap()) |rt| {
        try dumpNode(allocator, tree,rt, writer);
    } else {
        try writer.writeAll("{\\"type\\":\\"Identifier\\",\\"name\\":\\"void\\"}");
    }
    try writer.writeByte('}');
}

fn dumpTestDecl(allocator: std.mem.Allocator, tree: *const Ast, node_index: Node.Index, writer: anytype) !void {
    const name_tok, const body = tree.nodeData(node_index).opt_token_and_node;

    try writer.writeAll("{\\"type\\":\\"TestDecl\\"");

    if (name_tok != .none) {
        const tok_idx: Ast.TokenIndex = @intFromEnum(name_tok);
        if (tree.tokenTag(tok_idx) == .string_literal) {
            const slice = tree.tokenSlice(tok_idx);
            const inner = slice[1..slice.len - 1];
            const unescaped = try unescapeZigStringLiteral(allocator, inner);
            defer allocator.free(unescaped);
            try writer.writeAll(",\\"name\\":");
            try writeJsonString(writer, unescaped);
        }
    }

    try writer.writeAll(",\\"body\\":");
    try dumpNode(allocator, tree,body, writer);
    try writer.writeByte('}');
}

fn dumpArrayInit(allocator: std.mem.Allocator, tree: *const Ast, ai: Ast.full.ArrayInit, writer: anytype) !void {
    try writer.writeAll("{\\"type\\":\\"ArrayInitExpr\\"");
    if (ai.ast.type_expr.unwrap()) |te| {
        try writer.writeAll(",\\"operand\\":");
        try dumpNode(allocator, tree,te, writer);
    }
    try writer.writeAll(",\\"elements\\":[");
    for (ai.ast.elements, 0..) |elem, i| {
        if (i > 0) try writer.writeByte(',');
        try dumpNode(allocator, tree,elem, writer);
    }
    try writer.writeAll("]}");
}

fn dumpForLoop(allocator: std.mem.Allocator, tree: *const Ast, full_for: Ast.full.For, writer: anytype) !void {
    try writer.writeAll("{\\"type\\":\\"ForStmt\\",\\"inputs\\":[");
    for (full_for.ast.inputs, 0..) |input, i| {
        if (i > 0) try writer.writeByte(',');
        try dumpNode(allocator, tree,input, writer);
    }
    try writer.writeAll("],\\"captures\\":[");
    // Extract captures from token stream starting at payload_token
    var tok = full_for.payload_token;
    var first_cap = true;
    while (tree.tokenTag(tok) != .pipe) {
        const is_ptr = tree.tokenTag(tok) == .asterisk;
        if (is_ptr) tok += 1;
        if (tree.tokenTag(tok) == .identifier) {
            if (!first_cap) try writer.writeByte(',');
            first_cap = false;
            const name = tree.tokenSlice(tok);
            if (is_ptr) {
                try writer.writeByte('"');
                try writer.writeByte('*');
                try writer.writeAll(name);
                try writer.writeByte('"');
            } else {
                try writeJsonString(writer, name);
            }
        }
        tok += 1;
    }
    try writer.writeAll("],\\"body\\":");
    try dumpNode(allocator, tree,full_for.ast.then_expr, writer);
    try writer.writeAll(",\\"isInline\\":");
    try writer.writeAll(if (full_for.inline_token != null) "true" else "false");
    if (full_for.ast.else_expr.unwrap()) |else_expr| {
        try writer.writeAll(",\\"elseBody\\":");
        try dumpNode(allocator, tree,else_expr, writer);
    }
    if (full_for.label_token) |lt| {
        try writer.writeAll(",\\"label\\":");
        try writeJsonString(writer, tree.tokenSlice(lt));
    }
    try writer.writeAll("}");
}

fn dumpWhileLoop(allocator: std.mem.Allocator, tree: *const Ast, full_while: Ast.full.While, writer: anytype) !void {
    try writer.writeAll("{\\"type\\":\\"WhileStmt\\",\\"condition\\":");
    try dumpNode(allocator, tree,full_while.ast.cond_expr, writer);
    if (full_while.payload_token) |pt| {
        try writer.writeAll(",\\"capture\\":");
        try writeJsonString(writer, tree.tokenSlice(pt));
    }
    if (full_while.ast.cont_expr.unwrap()) |cont| {
        try writer.writeAll(",\\"continuation\\":");
        try dumpNode(allocator, tree,cont, writer);
    }
    try writer.writeAll(",\\"body\\":");
    try dumpNode(allocator, tree,full_while.ast.then_expr, writer);
    if (full_while.ast.else_expr.unwrap()) |else_expr| {
        try writer.writeAll(",\\"elseBody\\":");
        try dumpNode(allocator, tree,else_expr, writer);
    }
    if (full_while.label_token) |lt| {
        try writer.writeAll(",\\"label\\":");
        try writeJsonString(writer, tree.tokenSlice(lt));
    }
    try writer.writeAll(",\\"isInline\\":");
    try writer.writeAll(if (full_while.inline_token != null) "true" else "false");
    try writer.writeAll("}");
}

fn dumpContainerDecl(allocator: std.mem.Allocator, tree: *const Ast, cd: Ast.full.ContainerDecl, writer: anytype) !void {
    const kw_tok = cd.ast.main_token;
    const kw = tree.tokenTag(kw_tok);
    if (kw == .keyword_struct) {
        try writer.writeAll("{\\"type\\":\\"StructExpr\\",\\"members\\":[");
        for (cd.ast.members, 0..) |member, i| {
            if (i > 0) try writer.writeByte(',');
            try dumpNode(allocator, tree,member, writer);
        }
        try writer.writeAll("]}");
    } else {
        try writer.writeAll("{\\"type\\":\\"Unknown\\",\\"tag\\":\\"container_decl\\"}");
    }
}

fn dumpContainerField(allocator: std.mem.Allocator, tree: *const Ast, cf: Ast.full.ContainerField, writer: anytype) !void {
    try writer.writeAll("{\\"type\\":\\"ContainerField\\",\\"name\\":");
    try writeJsonString(writer, tree.tokenSlice(cf.ast.main_token));
    if (cf.ast.type_expr.unwrap()) |te| {
        try writer.writeAll(",\\"typeExpr\\":");
        try dumpNode(allocator, tree,te, writer);
    }
    if (cf.ast.align_expr.unwrap()) |ae| {
        try writer.writeAll(",\\"alignExpr\\":");
        try dumpNode(allocator, tree,ae, writer);
    }
    if (cf.ast.value_expr.unwrap()) |dv| {
        try writer.writeAll(",\\"defaultValue\\":");
        try dumpNode(allocator, tree,dv, writer);
    }
    try writer.writeAll("}");
}

fn dumpSwitchProng(allocator: std.mem.Allocator, tree: *const Ast, full_case: Ast.full.SwitchCase, writer: anytype) !void {
    try writer.writeAll("{\\"type\\":\\"SwitchProng\\"");
    const is_else = full_case.ast.values.len == 0;
    if (is_else) {
        try writer.writeAll(",\\"isElse\\":true,\\"cases\\":[]");
    } else {
        try writer.writeAll(",\\"isElse\\":false,\\"cases\\":[");
        for (full_case.ast.values, 0..) |item, i| {
            if (i > 0) try writer.writeByte(',');
            try dumpNode(allocator, tree,item, writer);
        }
        try writer.writeAll("]");
    }
    if (full_case.payload_token) |pt| {
        try writer.writeAll(",\\"capture\\":");
        try writeJsonString(writer, tree.tokenSlice(pt));
    }
    try writer.writeAll(",\\"body\\":");
    try dumpNode(allocator, tree,full_case.ast.target_expr, writer);
    try writer.writeAll("}");
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
					type: 'VarDecl',
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

test(compareWithZigParser, 'lib/std/compress.zig');
test(compareWithZigParser, 'lib/std/once.zig');
