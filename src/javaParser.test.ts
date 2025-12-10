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
import { javaCompilationUnitParser } from './javaParser.js';

const paths = envPaths('parser.futpib.github.io');

const hasMvnPromise = hasExecutable('mvn');

const javaparserCommit = '6232a2103ebdbb0dd5b32d11e2c36ab62777b8f6';

const javaparserGitCacheMutex = new PromiseMutex();

async function ensureJavaparserGitCache() {
	return javaparserGitCacheMutex.withLock(async () => {
		const cacheDir = path.join(paths.cache, 'javaparser.git');

		try {
			await fs.access(cacheDir);
			return cacheDir;
		} catch {
			// Cache miss, clone the bare repo
		}

		await fs.mkdir(path.dirname(cacheDir), { recursive: true });

		const tempDir = `${cacheDir}.tmp`;
		await fs.rm(tempDir, { recursive: true, force: true });

		await execa('git', ['clone', '--bare', 'https://github.com/javaparser/javaparser', tempDir]);

		await fs.rename(tempDir, cacheDir);

		return cacheDir;
	});
}

async function cloneJavaparserRepo(): Promise<{ path: string; [Symbol.asyncDispose]: () => Promise<void> }> {
	const gitDir = await ensureJavaparserGitCache();

	// Fetch the specific commit if not already present
	try {
		await execa('git', ['cat-file', '-e', javaparserCommit], { cwd: gitDir });
	} catch {
		await execa('git', ['fetch', 'origin', javaparserCommit], { cwd: gitDir });
	}

	// Checkout to a temporary worktree
	const worktree = temporaryDirectory();
	await execa('git', ['--git-dir', gitDir, 'worktree', 'add', '--detach', worktree, javaparserCommit]);

	return {
		path: worktree,
		[Symbol.asyncDispose]: async () => {
			await execa('git', ['--git-dir', gitDir, 'worktree', 'remove', '--force', worktree]);
		},
	};
}

const jbangInstallMutex = new PromiseMutex();

async function ensureJbangInstalled() {
	return jbangInstallMutex.withLock(async () => {
		const jbangDir = path.join(paths.cache, 'jbang');
		const jbangBin = path.join(jbangDir, '.jbang', 'jbang', 'bin', 'jbang');

		try {
			await fs.access(jbangBin);
			return jbangBin;
		} catch {
			// Use maven plugin to bootstrap jbang installation
		}

		const dir = temporaryDirectory();
		try {
			const pomXml = `<?xml version="1.0" encoding="UTF-8"?>
<project>
	<modelVersion>4.0.0</modelVersion>
	<groupId>test</groupId>
	<artifactId>test</artifactId>
	<version>1.0</version>
	<build>
		<plugins>
			<plugin>
				<groupId>dev.jbang</groupId>
				<artifactId>jbang-maven-plugin</artifactId>
				<version>0.0.8</version>
				<configuration>
					<script>--version</script>
					<jbangInstallDir>${jbangDir}</jbangInstallDir>
				</configuration>
			</plugin>
		</plugins>
	</build>
</project>`;
			await fs.writeFile(path.join(dir, 'pom.xml'), pomXml);
			await execa('mvn', ['jbang:run', '-q'], { cwd: dir });

			return jbangBin;
		} finally {
			await fs.rm(dir, { recursive: true, force: true });
		}
	});
}

async function runJavaSnippet(code: string, args: string[] = []) {
	const jbangBin = await ensureJbangInstalled();

	const dir = temporaryDirectory();
	const file = path.join(dir, 'Main.java');
	await fs.writeFile(file, code);

	try {
		const result = await execa(jbangBin, ['--quiet', 'run', file, ...args], { cwd: dir });
		return result.stdout.trim();
	} finally {
		await fs.rm(dir, { recursive: true, force: true });
	}
}

const javaparserSnippet = `
//DEPS com.github.javaparser:javaparser-core:3.26.4

import com.github.javaparser.StaticJavaParser;
import com.github.javaparser.ast.*;
import com.github.javaparser.ast.body.*;
import com.github.javaparser.ast.expr.*;
import com.github.javaparser.ast.type.*;
import com.github.javaparser.metamodel.*;
import java.nio.file.Path;
import java.util.*;

class Main {
	public static void main(String[] args) throws Exception {
		Path filePath = Path.of(args[0]);
		CompilationUnit cu = StaticJavaParser.parse(filePath);
		System.out.println(toJson(cu));
	}

	static String toJson(Node node) {
		StringBuilder sb = new StringBuilder();
		sb.append("{");
		sb.append("\\"type\\":\\"").append(node.getClass().getSimpleName()).append("\\"");

		node.getMetaModel().getAllPropertyMetaModels().forEach(prop -> {
			String name = prop.getName();
			if (name.equals("comment") || name.equals("parentNode")) return;

			Object value = prop.getValue(node);
			if (value == null) return;

			sb.append(",\\"").append(name).append("\\":");

			if (value instanceof Node) {
				sb.append(toJson((Node) value));
			} else if (value instanceof NodeList) {
				sb.append("[");
				NodeList<?> list = (NodeList<?>) value;
				for (int i = 0; i < list.size(); i++) {
					if (i > 0) sb.append(",");
					sb.append(toJson((Node) list.get(i)));
				}
				sb.append("]");
			} else if (value instanceof Optional) {
				Optional<?> opt = (Optional<?>) value;
				if (opt.isPresent() && opt.get() instanceof Node) {
					sb.append(toJson((Node) opt.get()));
				} else if (opt.isPresent()) {
					sb.append("\\"").append(opt.get().toString().replace("\\"", "\\\\\\"")).append("\\"");
				} else {
					sb.append("null");
				}
			} else if (value instanceof Boolean) {
				sb.append(value.toString());
			} else {
				sb.append("\\"").append(value.toString().replace("\\"", "\\\\\\"").replace("\\n", "\\\\n")).append("\\"");
			}
		});

		sb.append("}");
		return sb.toString();
	}
}
`;


const compareWithJavaparser = test.macro({
	title: (_, relativePath: string) => `compare: ${relativePath}`,
	exec: async (t, relativePath: string) => {
		if (!await hasMvnPromise) {
			t.pass('skipping test because mvn is not available');
			return;
		}

		await using repo = await cloneJavaparserRepo();
		const filePath = path.join(repo.path, relativePath);

		// Parse with javaparser (reference)
		const javaparserOutput = await runJavaSnippet(javaparserSnippet, [filePath]);
		const expected = JSON.parse(javaparserOutput);

		// Parse with our parser
		const source = await fs.readFile(filePath, 'utf-8');
		const actual = await runParser(
			javaCompilationUnitParser,
			source,
			stringParserInputCompanion,
		);

		// Compare full AST
		t.deepEqual(actual, expected);
	},
});

test('empty file', async t => {
	const result = await runParser(
		javaCompilationUnitParser,
		'',
		stringParserInputCompanion,
	);

	t.deepEqual(result, {
		type: 'CompilationUnit',
		packageDeclaration: undefined,
		imports: [],
		types: [],
	});
});

test('package declaration only', async t => {
	const result = await runParser(
		javaCompilationUnitParser,
		'package com.example;',
		stringParserInputCompanion,
	);

	t.deepEqual(result, {
		type: 'CompilationUnit',
		packageDeclaration: {
			type: 'PackageDeclaration',
			annotations: [],
			name: {
				type: 'Name',
				identifier: 'example',
				qualifier: { type: 'Name', identifier: 'com' },
			},
		},
		imports: [],
		types: [],
	});
});

test('single import', async t => {
	const result = await runParser(
		javaCompilationUnitParser,
		'import java.util.List;',
		stringParserInputCompanion,
	);

	t.deepEqual(result, {
		type: 'CompilationUnit',
		packageDeclaration: undefined,
		imports: [{
			type: 'ImportDeclaration',
			isStatic: false,
			isAsterisk: false,
			name: {
				type: 'Name',
				identifier: 'List',
				qualifier: {
					type: 'Name',
					identifier: 'util',
					qualifier: { type: 'Name', identifier: 'java' },
				},
			},
		}],
		types: [],
	});
});

test('wildcard import', async t => {
	const result = await runParser(
		javaCompilationUnitParser,
		'import java.util.*;',
		stringParserInputCompanion,
	);

	t.deepEqual(result, {
		type: 'CompilationUnit',
		packageDeclaration: undefined,
		imports: [{
			type: 'ImportDeclaration',
			isStatic: false,
			isAsterisk: true,
			name: {
				type: 'Name',
				identifier: 'util',
				qualifier: { type: 'Name', identifier: 'java' },
			},
		}],
		types: [],
	});
});

test('static import', async t => {
	const result = await runParser(
		javaCompilationUnitParser,
		'import static java.lang.Math.PI;',
		stringParserInputCompanion,
	);

	t.deepEqual(result, {
		type: 'CompilationUnit',
		packageDeclaration: undefined,
		imports: [{
			type: 'ImportDeclaration',
			isStatic: true,
			isAsterisk: false,
			name: {
				type: 'Name',
				identifier: 'PI',
				qualifier: {
					type: 'Name',
					identifier: 'Math',
					qualifier: {
						type: 'Name',
						identifier: 'lang',
						qualifier: { type: 'Name', identifier: 'java' },
					},
				},
			},
		}],
		types: [],
	});
});

test('simple class declaration', async t => {
	const result = await runParser(
		javaCompilationUnitParser,
		'public class Foo {}',
		stringParserInputCompanion,
	);

	t.deepEqual(result, {
		type: 'CompilationUnit',
		packageDeclaration: undefined,
		imports: [],
		types: [{
			type: 'ClassOrInterfaceDeclaration',
			modifiers: [{ type: 'Modifier', keyword: 'PUBLIC' }],
			annotations: [],
			name: { type: 'SimpleName', identifier: 'Foo' },
			isInterface: false,
			typeParameters: [],
			extendedTypes: [],
			implementedTypes: [],
			permittedTypes: [],
			members: [],
		}],
	});
});

test('interface declaration', async t => {
	const result = await runParser(
		javaCompilationUnitParser,
		'public interface Bar {}',
		stringParserInputCompanion,
	);

	t.deepEqual(result, {
		type: 'CompilationUnit',
		packageDeclaration: undefined,
		imports: [],
		types: [{
			type: 'ClassOrInterfaceDeclaration',
			modifiers: [{ type: 'Modifier', keyword: 'PUBLIC' }],
			annotations: [],
			name: { type: 'SimpleName', identifier: 'Bar' },
			isInterface: true,
			typeParameters: [],
			extendedTypes: [],
			implementedTypes: [],
			permittedTypes: [],
			members: [],
		}],
	});
});

test('enum declaration', async t => {
	const result = await runParser(
		javaCompilationUnitParser,
		'public enum Status {}',
		stringParserInputCompanion,
	);

	t.deepEqual(result, {
		type: 'CompilationUnit',
		packageDeclaration: undefined,
		imports: [],
		types: [{
			type: 'EnumDeclaration',
			modifiers: [{ type: 'Modifier', keyword: 'PUBLIC' }],
			annotations: [],
			name: { type: 'SimpleName', identifier: 'Status' },
			implementedTypes: [],
			entries: [],
			members: [],
		}],
	});
});

test('annotated class', async t => {
	const result = await runParser(
		javaCompilationUnitParser,
		'@Deprecated public class OldClass {}',
		stringParserInputCompanion,
	);

	t.deepEqual(result, {
		type: 'CompilationUnit',
		packageDeclaration: undefined,
		imports: [],
		types: [{
			type: 'ClassOrInterfaceDeclaration',
			modifiers: [{ type: 'Modifier', keyword: 'PUBLIC' }],
			annotations: [{ type: 'MarkerAnnotationExpr', name: { type: 'Name', identifier: 'Deprecated' } }],
			name: { type: 'SimpleName', identifier: 'OldClass' },
			isInterface: false,
			typeParameters: [],
			extendedTypes: [],
			implementedTypes: [],
			permittedTypes: [],
			members: [],
		}],
	});
});

test('full compilation unit', async t => {
	const source = `
package com.example;

import java.util.List;
import java.util.Map;

public class MyClass {}
`;
	const result = await runParser(
		javaCompilationUnitParser,
		source,
		stringParserInputCompanion,
	);

	t.deepEqual(result, {
		type: 'CompilationUnit',
		packageDeclaration: {
			type: 'PackageDeclaration',
			annotations: [],
			name: {
				type: 'Name',
				identifier: 'example',
				qualifier: { type: 'Name', identifier: 'com' },
			},
		},
		imports: [
			{
				type: 'ImportDeclaration',
				isStatic: false,
				isAsterisk: false,
				name: {
					type: 'Name',
					identifier: 'List',
					qualifier: {
						type: 'Name',
						identifier: 'util',
						qualifier: { type: 'Name', identifier: 'java' },
					},
				},
			},
			{
				type: 'ImportDeclaration',
				isStatic: false,
				isAsterisk: false,
				name: {
					type: 'Name',
					identifier: 'Map',
					qualifier: {
						type: 'Name',
						identifier: 'util',
						qualifier: { type: 'Name', identifier: 'java' },
					},
				},
			},
		],
		types: [{
			type: 'ClassOrInterfaceDeclaration',
			modifiers: [{ type: 'Modifier', keyword: 'PUBLIC' }],
			annotations: [],
			name: { type: 'SimpleName', identifier: 'MyClass' },
			isInterface: false,
			typeParameters: [],
			extendedTypes: [],
			implementedTypes: [],
			permittedTypes: [],
			members: [],
		}],
	});
});

test('class with method', async t => {
	const source = `
public class Foo {
	public void bar() {}
}
`;
	const result = await runParser(
		javaCompilationUnitParser,
		source,
		stringParserInputCompanion,
	);

	t.deepEqual(result, {
		type: 'CompilationUnit',
		packageDeclaration: undefined,
		imports: [],
		types: [{
			type: 'ClassOrInterfaceDeclaration',
			modifiers: [{ type: 'Modifier', keyword: 'PUBLIC' }],
			annotations: [],
			name: { type: 'SimpleName', identifier: 'Foo' },
			isInterface: false,
			typeParameters: [],
			extendedTypes: [],
			implementedTypes: [],
			permittedTypes: [],
			members: [{
				type: { type: 'VoidType', annotations: [] },
				modifiers: [{ type: 'Modifier', keyword: 'PUBLIC' }],
				annotations: [],
				typeParameters: [],
				name: { type: 'SimpleName', identifier: 'bar' },
				parameters: [],
				thrownExceptions: [],
				body: { type: 'BlockStmt', statements: [] },
			}],
		}],
	});
});

test('class with field', async t => {
	const source = `
public class Foo {
	private int x;
}
`;
	const result = await runParser(
		javaCompilationUnitParser,
		source,
		stringParserInputCompanion,
	);

	t.deepEqual(result, {
		type: 'CompilationUnit',
		packageDeclaration: undefined,
		imports: [],
		types: [{
			type: 'ClassOrInterfaceDeclaration',
			modifiers: [{ type: 'Modifier', keyword: 'PUBLIC' }],
			annotations: [],
			name: { type: 'SimpleName', identifier: 'Foo' },
			isInterface: false,
			typeParameters: [],
			extendedTypes: [],
			implementedTypes: [],
			permittedTypes: [],
			members: [{
				type: 'FieldDeclaration',
				modifiers: [{ type: 'Modifier', keyword: 'PRIVATE' }],
				annotations: [],
				variables: [{
					type: { type: 'PrimitiveType', type_: 'INT', annotations: [] },
					name: { type: 'SimpleName', identifier: 'x' },
				}],
			}],
		}],
	});
});

test('class with method and parameters', async t => {
	const source = `
public class Foo {
	public int add(int a, int b) {}
}
`;
	const result = await runParser(
		javaCompilationUnitParser,
		source,
		stringParserInputCompanion,
	);

	t.deepEqual(result, {
		type: 'CompilationUnit',
		packageDeclaration: undefined,
		imports: [],
		types: [{
			type: 'ClassOrInterfaceDeclaration',
			modifiers: [{ type: 'Modifier', keyword: 'PUBLIC' }],
			annotations: [],
			name: { type: 'SimpleName', identifier: 'Foo' },
			isInterface: false,
			typeParameters: [],
			extendedTypes: [],
			implementedTypes: [],
			permittedTypes: [],
			members: [{
				type: { type: 'PrimitiveType', type_: 'INT', annotations: [] },
				modifiers: [{ type: 'Modifier', keyword: 'PUBLIC' }],
				annotations: [],
				typeParameters: [],
				name: { type: 'SimpleName', identifier: 'add' },
				parameters: [
					{
						type: { type: 'PrimitiveType', type_: 'INT', annotations: [] },
						modifiers: [],
						annotations: [],
						isVarArgs: false,
						varArgsAnnotations: [],
						name: { type: 'SimpleName', identifier: 'a' },
					},
					{
						type: { type: 'PrimitiveType', type_: 'INT', annotations: [] },
						modifiers: [],
						annotations: [],
						isVarArgs: false,
						varArgsAnnotations: [],
						name: { type: 'SimpleName', identifier: 'b' },
					},
				],
				thrownExceptions: [],
				body: { type: 'BlockStmt', statements: [] },
			}],
		}],
	});
});

test('class with generic type field', async t => {
	const source = `
public class Foo {
	private List<String> items;
}
`;
	const result = await runParser(
		javaCompilationUnitParser,
		source,
		stringParserInputCompanion,
	);

	t.deepEqual(result, {
		type: 'CompilationUnit',
		packageDeclaration: undefined,
		imports: [],
		types: [{
			type: 'ClassOrInterfaceDeclaration',
			modifiers: [{ type: 'Modifier', keyword: 'PUBLIC' }],
			annotations: [],
			name: { type: 'SimpleName', identifier: 'Foo' },
			isInterface: false,
			typeParameters: [],
			extendedTypes: [],
			implementedTypes: [],
			permittedTypes: [],
			members: [{
				type: 'FieldDeclaration',
				modifiers: [{ type: 'Modifier', keyword: 'PRIVATE' }],
				annotations: [],
				variables: [{
					type: {
						type: 'ClassOrInterfaceType',
						name: { type: 'SimpleName', identifier: 'List' },
						typeArguments: [{
							type: 'ClassOrInterfaceType',
							name: { type: 'SimpleName', identifier: 'String' },
							annotations: [],
						}],
						annotations: [],
					},
					name: { type: 'SimpleName', identifier: 'items' },
				}],
			}],
		}],
	});
});

test('class with field initializer', async t => {
	const source = `
public class Foo {
	private static final String NAME = "test";
}
`;
	const result = await runParser(
		javaCompilationUnitParser,
		source,
		stringParserInputCompanion,
	);

	const classDecl = result.types[0] as { members: unknown[] };
	t.is(classDecl.members.length, 1);
	t.is((classDecl.members[0] as { type: string }).type, 'FieldDeclaration');
});

test('class with complex field initializer', async t => {
	const source = `
public class Foo {
	private static final ThreadLocal<Config> config = ThreadLocal.withInitial(Config::new);
}
`;
	const result = await runParser(
		javaCompilationUnitParser,
		source,
		stringParserInputCompanion,
	);

	const classDecl = result.types[0] as { members: unknown[] };
	t.is(classDecl.members.length, 1);
	t.is((classDecl.members[0] as { type: string }).type, 'FieldDeclaration');
});

test('class with annotated method', async t => {
	const source = `
public class Foo {
	@Deprecated
	public void bar() {}
}
`;
	const result = await runParser(
		javaCompilationUnitParser,
		source,
		stringParserInputCompanion,
	);

	const classDecl = result.types[0] as { members: Array<{ parameters?: unknown[]; annotations: unknown[] }> };
	t.is(classDecl.members.length, 1);
	// Methods have parameters, fields have variables
	t.truthy(classDecl.members[0].parameters);
	t.is(classDecl.members[0].annotations.length, 1);
});

test('class with field and method', async t => {
	const source = `
public class Foo {
	private int x;
	public int getX() {}
}
`;
	const result = await runParser(
		javaCompilationUnitParser,
		source,
		stringParserInputCompanion,
	);

	const classDecl = result.types[0] as { members: Array<{ type: string | object; variables?: unknown[]; parameters?: unknown[] }> };
	t.is(classDecl.members.length, 2);
	// Fields have type: 'FieldDeclaration' and variables
	t.is(classDecl.members[0].type, 'FieldDeclaration');
	t.truthy(classDecl.members[0].variables);
	// Methods have type: {...} (return type object) and parameters
	t.truthy(classDecl.members[1].parameters);
});

test('class with multiline field initializer', async t => {
	const source = `
public class Foo {
	private static final ThreadLocal<Config> config =
		ThreadLocal.withInitial(Config::new);
}
`;
	const result = await runParser(
		javaCompilationUnitParser,
		source,
		stringParserInputCompanion,
	);

	const classDecl = result.types[0] as { members: Array<{ type: string }> };
	t.is(classDecl.members.length, 1);
	t.is(classDecl.members[0].type, 'FieldDeclaration');
});

test('generic method', async t => {
	const source = `public class Foo {
    public static <T extends Expression> T parseExpression(String expression) {
        return null;
    }
}`;
	const result = await runParser(
		javaCompilationUnitParser,
		source,
		stringParserInputCompanion,
	);

	t.is(result.types.length, 1);
	t.is(result.types[0].type, 'ClassOrInterfaceDeclaration');
});

test('wildcard type', async t => {
	const source = `public class Foo {
    public static BodyDeclaration<?> parse(String body) {
        return null;
    }
}`;
	const result = await runParser(
		javaCompilationUnitParser,
		source,
		stringParserInputCompanion,
	);

	t.is(result.types.length, 1);
	t.is(result.types[0].type, 'ClassOrInterfaceDeclaration');
});

test('class with javadoc', async t => {
	const source = `
/**
 * A test class.
 */
public class Foo {
	public void bar() {}
}
`;
	const result = await runParser(
		javaCompilationUnitParser,
		source,
		stringParserInputCompanion,
	);

	t.is(result.types.length, 1);
	t.is(result.types[0].type, 'ClassOrInterfaceDeclaration');
	const classDecl = result.types[0] as { members: unknown[] };
	t.is(classDecl.members.length, 1);
});

test('public final class', async t => {
	const source = `
package com.example;

/**
 * A test class.
 */
public final class Foo {
}
`;
	const result = await runParser(
		javaCompilationUnitParser,
		source,
		stringParserInputCompanion,
	);

	t.is(result.types.length, 1);
	t.is(result.types[0].type, 'ClassOrInterfaceDeclaration');
});

test('class with imports and javadoc', async t => {
	const source = `
package com.example;

import java.io.*;
import java.util.List;

/**
 * A test class.
 */
public final class Foo {
}
`;
	const result = await runParser(
		javaCompilationUnitParser,
		source,
		stringParserInputCompanion,
	);

	t.is(result.imports.length, 2);
	t.is(result.types.length, 1);
	t.is(result.types[0].type, 'ClassOrInterfaceDeclaration');
});

test('class with link in javadoc', async t => {
	const source = `
package com.example;

/**
 * A simpler, static API than {@link JavaParser}.
 */
public final class Foo {
}
`;
	const result = await runParser(
		javaCompilationUnitParser,
		source,
		stringParserInputCompanion,
	);

	t.is(result.types.length, 1);
	t.is(result.types[0].type, 'ClassOrInterfaceDeclaration');
});

test('class with many imports', async t => {
	const source = `
package com.github.javaparser;

import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.ImportDeclaration;
import com.github.javaparser.ast.Node;
import com.github.javaparser.ast.PackageDeclaration;
import com.github.javaparser.ast.body.BodyDeclaration;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.body.Parameter;
import com.github.javaparser.ast.body.TypeDeclaration;
import com.github.javaparser.ast.expr.*;
import com.github.javaparser.ast.modules.ModuleDeclaration;
import com.github.javaparser.ast.modules.ModuleDirective;
import com.github.javaparser.ast.stmt.BlockStmt;
import com.github.javaparser.ast.stmt.ExplicitConstructorInvocationStmt;
import com.github.javaparser.ast.stmt.Statement;
import com.github.javaparser.ast.type.ClassOrInterfaceType;
import com.github.javaparser.ast.type.Type;
import com.github.javaparser.ast.type.TypeParameter;
import com.github.javaparser.javadoc.Javadoc;
import com.github.javaparser.quality.NotNull;
import com.github.javaparser.quality.Preconditions;
import java.io.*;
import java.nio.charset.Charset;
import java.nio.file.Path;

/**
 * A simpler, static API than {@link JavaParser}.
 */
public final class StaticJavaParser {
}
`;
	const result = await runParser(
		javaCompilationUnitParser,
		source,
		stringParserInputCompanion,
	);

	t.is(result.imports.length, 23);
	t.is(result.types.length, 1);
	t.is(result.types[0].type, 'ClassOrInterfaceDeclaration');
});

test('StaticJavaParser full', async t => {
	const source = `/*
 * Copyright (C) 2007-2010 Júlio Vilmar Gesser.
 * Copyright (C) 2011, 2013-2024 The JavaParser Team.
 *
 * This file is part of JavaParser.
 *
 * JavaParser can be used either under the terms of
 * a) the GNU Lesser General Public License as published by
 *     the Free Software Foundation, either version 3 of the License, or
 *     (at your option) any later version.
 * b) the terms of the Apache License
 *
 * You should have received a copy of both licenses in LICENCE.LGPL and
 * LICENCE.APACHE. Please refer to those files for details.
 *
 * JavaParser is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Lesser General Public License for more details.
 */
package com.github.javaparser;

import com.github.javaparser.ast.CompilationUnit;
import com.github.javaparser.ast.ImportDeclaration;
import com.github.javaparser.ast.Node;
import com.github.javaparser.ast.PackageDeclaration;
import com.github.javaparser.ast.body.BodyDeclaration;
import com.github.javaparser.ast.body.MethodDeclaration;
import com.github.javaparser.ast.body.Parameter;
import com.github.javaparser.ast.body.TypeDeclaration;
import com.github.javaparser.ast.expr.*;
import com.github.javaparser.ast.modules.ModuleDeclaration;
import com.github.javaparser.ast.modules.ModuleDirective;
import com.github.javaparser.ast.stmt.BlockStmt;
import com.github.javaparser.ast.stmt.ExplicitConstructorInvocationStmt;
import com.github.javaparser.ast.stmt.Statement;
import com.github.javaparser.ast.type.ClassOrInterfaceType;
import com.github.javaparser.ast.type.Type;
import com.github.javaparser.ast.type.TypeParameter;
import com.github.javaparser.javadoc.Javadoc;
import com.github.javaparser.quality.NotNull;
import com.github.javaparser.quality.Preconditions;
import java.io.*;
import java.nio.charset.Charset;
import java.nio.file.Path;

/**
 * A simpler, static API than {@link JavaParser}.
 */
public final class StaticJavaParser {

    // use ThreadLocal to resolve possible concurrency issues.
    private static final ThreadLocal<ParserConfiguration> localConfiguration =
            ThreadLocal.withInitial(ParserConfiguration::new);

    /**
     * Get the configuration for the parse... methods. Deprecated method.
     *
     * @deprecated use {@link #getParserConfiguration()} instead
     */
    @Deprecated
    public static ParserConfiguration getConfiguration() {
        return getParserConfiguration();
    }

    /**
     * Get the configuration for the parse... methods.
     */
    public static ParserConfiguration getParserConfiguration() {
        return localConfiguration.get();
    }

    /**
     * Set the configuration for the static parse... methods.
     * This is a STATIC field, so modifying it will directly change how all static parse... methods work!
     */
    public static void setConfiguration(@NotNull ParserConfiguration configuration) {
        Preconditions.checkNotNull(configuration, "Parameter configuration can't be null.");
        localConfiguration.set(configuration);
    }

    /**
     * Parses the Java code contained in the {@link InputStream} and returns a
     * {@link CompilationUnit} that represents it.
     *
     * @param in {@link InputStream} containing Java source code. It will be closed after parsing.
     * @param encoding encoding of the source code
     * @return CompilationUnit representing the Java source code
     * @throws ParseProblemException if the source code has parser errors
     * @deprecated set the encoding in the {@link ParserConfiguration}
     */
    @Deprecated
    public static CompilationUnit parse(@NotNull final InputStream in, @NotNull Charset encoding) {
        Preconditions.checkNotNull(in, "Parameter in can't be null.");
        Preconditions.checkNotNull(encoding, "Parameter encoding can't be null.");
        return handleResult(newParser().parse(in, encoding));
    }

    /**
     * Parses the Java code contained in the {@link InputStream} and returns a
     * {@link CompilationUnit} that represents it.<br>
     *
     * @param in {@link InputStream} containing Java source code. It will be closed after parsing.
     * @return CompilationUnit representing the Java source code
     * @throws ParseProblemException if the source code has parser errors
     */
    public static CompilationUnit parse(@NotNull final InputStream in) {
        Preconditions.checkNotNull(in, "Parameter in can't be null.");
        return newParserAdapted().parse(in);
    }

    /**
     * Parses the Java code contained in a {@link File} and returns a
     * {@link CompilationUnit} that represents it.
     *
     * @param file {@link File} containing Java source code. It will be closed after parsing.
     * @param encoding encoding of the source code
     * @return CompilationUnit representing the Java source code
     * @throws ParseProblemException if the source code has parser errors
     * @throws FileNotFoundException the file was not found
     * @deprecated set the encoding in the {@link ParserConfiguration}
     */
    @Deprecated
    public static CompilationUnit parse(@NotNull final File file, @NotNull final Charset encoding)
            throws FileNotFoundException {
        Preconditions.checkNotNull(file, "Parameter file can't be null.");
        Preconditions.checkNotNull(encoding, "Parameter encoding can't be null.");
        return handleResult(newParser().parse(file, encoding));
    }

    /**
     * Parses the Java code contained in a {@link File} and returns a
     * {@link CompilationUnit} that represents it.<br>
     *
     * @param file {@link File} containing Java source code. It will be closed after parsing.
     * @return CompilationUnit representing the Java source code
     * @throws ParseProblemException if the source code has parser errors
     * @throws FileNotFoundException the file was not found
     */
    public static CompilationUnit parse(@NotNull final File file) throws FileNotFoundException {
        Preconditions.checkNotNull(file, "Parameter file can't be null.");
        return newParserAdapted().parse(file);
    }

    /**
     * Parses the Java code contained in a file and returns a
     * {@link CompilationUnit} that represents it.
     *
     * @param path path to a file containing Java source code
     * @param encoding encoding of the source code
     * @return CompilationUnit representing the Java source code
     * @throws IOException the path could not be accessed
     * @throws ParseProblemException if the source code has parser errors
     * @deprecated set the encoding in the {@link ParserConfiguration}
     */
    @Deprecated
    public static CompilationUnit parse(@NotNull final Path path, @NotNull final Charset encoding) throws IOException {
        Preconditions.checkNotNull(path, "Parameter path can't be null.");
        Preconditions.checkNotNull(encoding, "Parameter encoding can't be null.");
        return handleResult(newParser().parse(path, encoding));
    }

    public static CompilationUnit parse(@NotNull final Path path) throws IOException {
        Preconditions.checkNotNull(path, "Parameter path can't be null.");
        return newParserAdapted().parse(path);
    }

    public static CompilationUnit parseResource(@NotNull final String path) throws IOException {
        Preconditions.checkNotNull(path, "Parameter path can't be null.");
        return newParserAdapted().parseResource(path);
    }

    @Deprecated
    public static CompilationUnit parseResource(@NotNull final String path, @NotNull Charset encoding)
            throws IOException {
        Preconditions.checkNotNull(path, "Parameter path can't be null.");
        Preconditions.checkNotNull(encoding, "Parameter encoding can't be null.");
        return handleResult(newParser().parseResource(path, encoding));
    }

    @Deprecated
    public static CompilationUnit parseResource(
            @NotNull final ClassLoader classLoader, @NotNull final String path, @NotNull Charset encoding)
            throws IOException {
        Preconditions.checkNotNull(classLoader, "Parameter classLoader can't be null.");
        Preconditions.checkNotNull(path, "Parameter path can't be null.");
        Preconditions.checkNotNull(encoding, "Parameter encoding can't be null.");
        return handleResult(newParser().parseResource(classLoader, path, encoding));
    }

    public static CompilationUnit parse(@NotNull final Reader reader) {
        Preconditions.checkNotNull(reader, "Parameter reader can't be null.");
        return newParserAdapted().parse(reader);
    }

    public static CompilationUnit parse(@NotNull String code) {
        Preconditions.checkNotNull(code, "Parameter code can't be null.");
        return newParserAdapted().parse(code);
    }

    public static BlockStmt parseBlock(@NotNull final String blockStatement) {
        Preconditions.checkNotNull(blockStatement, "Parameter blockStatement can't be null.");
        return newParserAdapted().parseBlock(blockStatement);
    }

    public static Statement parseStatement(@NotNull final String statement) {
        Preconditions.checkNotNull(statement, "Parameter statement can't be null.");
        return newParserAdapted().parseStatement(statement);
    }

    public static ImportDeclaration parseImport(@NotNull final String importDeclaration) {
        Preconditions.checkNotNull(importDeclaration, "Parameter importDeclaration can't be null.");
        return newParserAdapted().parseImport(importDeclaration);
    }

    public static <T extends Expression> T parseExpression(@NotNull final String expression) {
        Preconditions.checkNotNull(expression, "Parameter expression can't be null.");
        return newParserAdapted().parseExpression(expression);
    }

    public static AnnotationExpr parseAnnotation(@NotNull final String annotation) {
        Preconditions.checkNotNull(annotation, "Parameter annotation can't be null.");
        return newParserAdapted().parseAnnotation(annotation);
    }

    public static BodyDeclaration<?> parseAnnotationBodyDeclaration(@NotNull final String body) {
        Preconditions.checkNotNull(body, "Parameter body can't be null.");
        return newParserAdapted().parseAnnotationBodyDeclaration(body);
    }

    private StaticJavaParser() {}
}
`;
	const result = await runParser(
		javaCompilationUnitParser,
		source,
		stringParserInputCompanion,
	);

	t.is(result.types.length, 1);
	t.is(result.types[0].type, 'ClassOrInterfaceDeclaration');
});

test('clone javaparser repo and list files', async t => {
	await using repo = await cloneJavaparserRepo();
	const { stdout } = await execa('find', [repo.path, '-name', '*.java', '-type', 'f'], { cwd: repo.path });
	const files = stdout.split('\n').filter(Boolean);

	t.true(files.length > 0, 'should find java files');
});

test('run java snippet', async t => {
	if (!await hasMvnPromise) {
		t.pass('skipping test because mvn is not available');
		return;
	}

	const code = `
class Main {
	public static void main(String[] args) {
		System.out.println("Hello from Java!");
	}
}
`;
	const output = await runJavaSnippet(code);
	t.is(output, 'Hello from Java!');
});

test(compareWithJavaparser, 'javaparser-core/src/main/java/com/github/javaparser/StaticJavaParser.java');
