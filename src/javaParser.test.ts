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

			// Rename 'type' property to 'type_' to avoid collision with node class name
			String outputName = name.equals("type") ? "type_" : name;
			sb.append(",\\"").append(outputName).append("\\":");

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
				type: 'MethodDeclaration',
				modifiers: [{ type: 'Modifier', keyword: 'PUBLIC' }],
				annotations: [],
				typeParameters: [],
				type_: { type: 'VoidType', annotations: [] },
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
					type: 'VariableDeclarator',
					name: { type: 'SimpleName', identifier: 'x' },
					type_: { type: 'PrimitiveType', type_: 'INT', annotations: [] },
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
				type: 'MethodDeclaration',
				modifiers: [{ type: 'Modifier', keyword: 'PUBLIC' }],
				annotations: [],
				typeParameters: [],
				type_: { type: 'PrimitiveType', type_: 'INT', annotations: [] },
				name: { type: 'SimpleName', identifier: 'add' },
				parameters: [
					{
						type: 'Parameter',
						modifiers: [],
						annotations: [],
						type_: { type: 'PrimitiveType', type_: 'INT', annotations: [] },
						isVarArgs: false,
						varArgsAnnotations: [],
						name: { type: 'SimpleName', identifier: 'a' },
					},
					{
						type: 'Parameter',
						modifiers: [],
						annotations: [],
						type_: { type: 'PrimitiveType', type_: 'INT', annotations: [] },
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
					type: 'VariableDeclarator',
					name: { type: 'SimpleName', identifier: 'items' },
					type_: {
						type: 'ClassOrInterfaceType',
						name: { type: 'SimpleName', identifier: 'List' },
						typeArguments: [{
							type: 'ClassOrInterfaceType',
							name: { type: 'SimpleName', identifier: 'String' },
							annotations: [],
						}],
						annotations: [],
					},
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

	const classDecl = result.types[0] as { members: Array<{ type: string; annotations: unknown[] }> };
	t.is(classDecl.members.length, 1);
	t.is(classDecl.members[0].type, 'MethodDeclaration');
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

	const classDecl = result.types[0] as { members: Array<{ type: string }> };
	t.is(classDecl.members.length, 2);
	t.is(classDecl.members[0].type, 'FieldDeclaration');
	t.is(classDecl.members[1].type, 'MethodDeclaration');
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

test('class with method body', async t => {
	const source = `public class Foo {
    public void test() {
        return;
    }
}`;
	const result = await runParser(
		javaCompilationUnitParser,
		source,
		stringParserInputCompanion,
	);

	t.is(result.types.length, 1);
	t.is(result.types[0].type, 'ClassOrInterfaceDeclaration');
	const classDecl = result.types[0] as { members: Array<{ type: string; body?: { statements: unknown[] } }> };
	t.is(classDecl.members.length, 1);
	t.is(classDecl.members[0].type, 'MethodDeclaration');
	t.truthy(classDecl.members[0].body);
	t.is(classDecl.members[0].body!.statements.length, 1);
});

test('class with field and line comment', async t => {
	const source = `public final class StaticJavaParser {

    // use ThreadLocal to resolve possible concurrency issues.
    private static final ThreadLocal<ParserConfiguration> localConfiguration =
            ThreadLocal.withInitial(ParserConfiguration::new);
}`;
	const result = await runParser(
		javaCompilationUnitParser,
		source,
		stringParserInputCompanion,
	);

	t.is(result.types.length, 1);
	t.is(result.types[0].type, 'ClassOrInterfaceDeclaration');
});

test('class with copyright header and imports', async t => {
	const source = `/*
 * Copyright (C) 2007-2010 Júlio Vilmar Gesser.
 */
package com.github.javaparser;

import java.io.*;

/**
 * A simpler, static API than {@link JavaParser}.
 */
public final class StaticJavaParser {

    // use ThreadLocal to resolve possible concurrency issues.
    private static final ThreadLocal<ParserConfiguration> localConfiguration =
            ThreadLocal.withInitial(ParserConfiguration::new);
}`;
	const result = await runParser(
		javaCompilationUnitParser,
		source,
		stringParserInputCompanion,
	);

	t.is(result.types.length, 1);
	t.is(result.types[0].type, 'ClassOrInterfaceDeclaration');
});

test('read file and parse', async t => {
	// Write a file with the same content and read it back
	const source = `/*
 * Copyright (C) 2007-2010 Júlio Vilmar Gesser.
 */
package com.github.javaparser;

import java.io.*;

/**
 * A simpler, static API than {@link JavaParser}.
 */
public final class StaticJavaParser {

    // use ThreadLocal to resolve possible concurrency issues.
    private static final ThreadLocal<ParserConfiguration> localConfiguration =
            ThreadLocal.withInitial(ParserConfiguration::new);
}`;
	const tmpDir = temporaryDirectory();
	const tmpFile = path.join(tmpDir, 'Test.java');
	try {
		await fs.writeFile(tmpFile, source, 'utf-8');
		const readSource = await fs.readFile(tmpFile, 'utf-8');
		const result = await runParser(
			javaCompilationUnitParser,
			readSource,
			stringParserInputCompanion,
		);

		t.is(result.types.length, 1);
		t.is(result.types[0].type, 'ClassOrInterfaceDeclaration');
	} finally {
		await fs.rm(tmpDir, { recursive: true, force: true });
	}
});

test('StaticJavaParser minimal', async t => {
	const source = `public class Foo {
    public void test() {
        throw new Exception();
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

test('class with constructor calling this', async t => {
	const source = `public class Foo {
    public Foo() {
        this(1);
    }
    public Foo(int x) {
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

test('class with try-catch', async t => {
	const source = `public class Foo {
    public void test() {
        try {
            throw new Exception();
        } catch (Exception e) {
        }
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

test('class with generic method', async t => {
	const source = `public class Foo {
    public <N extends Node> N parse(N start) {
        return start;
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

test('method with throws clause', async t => {
	const source = `public class Foo {
    public void test() throws Exception {
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

test('deprecated method', async t => {
	const source = `public class Foo {
    @Deprecated
    public void test() {
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

test('try-finally without catch', async t => {
	const source = `public class Foo {
    public void test() {
        try {
        } finally {
        }
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

test('nested class', async t => {
	const source = `public class Foo {
    class Inner {}
}`;
	const result = await runParser(
		javaCompilationUnitParser,
		source,
		stringParserInputCompanion,
	);

	t.is(result.types.length, 1);
	t.is(result.types[0].type, 'ClassOrInterfaceDeclaration');
});

test('class with final field and null initializer', async t => {
	const source = `public class Foo {
    private final ParserConfiguration configuration;
    private GeneratedJavaParser astParser = null;
}`;
	const result = await runParser(
		javaCompilationUnitParser,
		source,
		stringParserInputCompanion,
	);

	t.is(result.types.length, 1);
	t.is(result.types[0].type, 'ClassOrInterfaceDeclaration');
});

test('class with constructor and this assignment', async t => {
	const source = `public class Foo {
    private int configuration;
    public Foo(int configuration) {
        this.configuration = configuration;
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

test('class with if null check', async t => {
	const source = `public class Foo {
    private Object x;
    public void test() {
        if (x == null) {
            x = new Object();
        }
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

test('qualified type in local var', async t => {
	const source = `public class Foo {
    public void test() {
        ParserConfig.Level level = null;
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

test('method chaining with collect', async t => {
	const source = `public class Foo {
    public void test() {
        List<String> x = list.stream().map(Supplier::get).collect(toList());
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

test('reassignment in for loop', async t => {
	const source = `public class Foo {
    public void test() {
        Object x = null;
        for (Object o : list) {
            x = o.process(x);
        }
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

test('lambda passed to method', async t => {
	const source = `public class Foo {
    public void test() {
        result.ifPresent(cu -> cu.setStorage(path));
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

test('method with multiple throws', async t => {
	const source = `public class Foo {
    public void test() throws IOException, ParseException {
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

test('generic return type', async t => {
	const source = `public class Foo {
    public ParseResult<CompilationUnit> parse() {
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

test('JavaParser-like structure', async t => {
	const source = `public final class JavaParser {
    private final ParserConfiguration configuration;
    private GeneratedJavaParser astParser = null;

    public JavaParser() {
        this(new ParserConfiguration());
    }

    public JavaParser(ParserConfiguration configuration) {
        this.configuration = configuration;
    }

    public ParserConfiguration getParserConfiguration() {
        return this.configuration;
    }

    private GeneratedJavaParser getParserForProvider(Provider provider) {
        if (astParser == null) {
            astParser = new GeneratedJavaParser(provider);
        } else {
            astParser.reset(provider);
        }
        astParser.setTabSize(configuration.getTabSize());
        return astParser;
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

test('generic method with type variable in return type', async t => {
	const source = `public class Foo {
    public <N extends Node> ParseResult<N> parse(N start) {
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

test('generic method with two generic params', async t => {
	const source = `public class Foo {
    public <N extends Node> ParseResult<N> parse(ParseStart<N> start, Provider provider) {
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

test('ternary expression', async t => {
	const source = `public class Foo {
    public void test() {
        String x = y == null ? "a" : "b";
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

test('ternary with method calls', async t => {
	const source = `public class Foo {
    public void test(Exception e) {
        final String message = e.getMessage() == null ? "Unknown error" : e.getMessage();
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

test('method body with final local var', async t => {
	const source = `public class Foo {
    public void test() {
        final String x = getValue();
        try {
            doSomething(x);
        } catch (Exception e) {
            final String message = e.getMessage();
        }
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

test('method with for and processor', async t => {
	const source = `public class Foo {
    public void test() {
        List<Processor> processors = getProcessors();
        for (Processor processor : processors) {
            provider = processor.preProcess(provider);
        }
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

test('constructor new with type arg', async t => {
	const source = `public class Foo {
    public void test() {
        Result<N> result = new Result<>(x, y);
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

test('class with implements', async t => {
	const source = `package com.github.javaparser;

import static com.github.javaparser.utils.Utils.assertNotNull;

import java.util.Objects;

public class Position implements Comparable<Position> {

    public final int line;

    public final int column;
}`;
	const result = await runParser(
		javaCompilationUnitParser,
		source,
		stringParserInputCompanion,
	);

	t.is(result.types.length, 1);
	t.is(result.types[0].type, 'ClassOrInterfaceDeclaration');
});

test('class with static method returning method call', async t => {
	const source = `public final class Foo {
    public static Config getConfig() {
        return getParserConfiguration();
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

test('class with return method call', async t => {
	const source = `public class Foo {
    public Config getConfig() {
        return getConfiguration();
    }
}`;
	const result = await runParser(
		javaCompilationUnitParser,
		source,
		stringParserInputCompanion,
	);

	t.is(result.types.length, 1);
	t.is(result.types[0].type, 'ClassOrInterfaceDeclaration');
	const classDecl = result.types[0] as { members: Array<{ type: string; body?: { statements: unknown[] } }> };
	t.is(classDecl.members.length, 1);
	t.is(classDecl.members[0].type, 'MethodDeclaration');
	t.truthy(classDecl.members[0].body);
	t.is(classDecl.members[0].body!.statements.length, 1);
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
test(compareWithJavaparser, 'javaparser-core/src/main/java/com/github/javaparser/Position.java');
test(compareWithJavaparser, 'javaparser-core/src/main/java/com/github/javaparser/Range.java');
test(compareWithJavaparser, 'javaparser-core/src/main/java/com/github/javaparser/Problem.java');
test(compareWithJavaparser, 'javaparser-core/src/main/java/com/github/javaparser/ParseResult.java');
test(compareWithJavaparser, 'javaparser-core/src/main/java/com/github/javaparser/Providers.java');
