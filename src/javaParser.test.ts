import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import test from 'ava';
import envPaths from 'env-paths';
import { execa } from 'execa';
import { temporaryDirectory } from 'tempy';
import { runParser } from './parser.js';
import { stringParserInputCompanion } from './parserInputCompanion.js';
import { javaCompilationUnitParser } from './javaParser.js';

const paths = envPaths('parser.futpib.github.io');

const javaparserCommit = '6232a2103ebdbb0dd5b32d11e2c36ab62777b8f6';

async function ensureJavaparserGitCache() {
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
}

async function cloneJavaparserRepo() {
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

	return worktree;
}

async function ensureJbangInstalled() {
	const jbangDir = path.join(paths.cache, 'jbang');
	const jbangBin = path.join(jbangDir, '.jbang', 'jbang', 'bin', 'jbang');

	try {
		await fs.access(jbangBin);
		return jbangBin;
	} catch {
		// Use maven plugin to bootstrap jbang installation
	}

	const dir = temporaryDirectory();
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
}

async function runJavaSnippet(code: string, args: string[] = []) {
	const jbangBin = await ensureJbangInstalled();

	const dir = temporaryDirectory();
	const file = path.join(dir, 'Main.java');
	await fs.writeFile(file, code);

	const result = await execa(jbangBin, ['--quiet', 'run', file, ...args], { cwd: dir });
	return result.stdout.trim();
}

test('empty file', async t => {
	const result = await runParser(
		javaCompilationUnitParser,
		'',
		stringParserInputCompanion,
	);

	t.deepEqual(result, {
		package: undefined,
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
		package: {
			annotations: [],
			name: { parts: ['com', 'example'] },
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
		package: undefined,
		imports: [{
			isStatic: false,
			name: { parts: ['java', 'util', 'List'] },
			isWildcard: false,
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
		package: undefined,
		imports: [{
			isStatic: false,
			name: { parts: ['java', 'util'] },
			isWildcard: true,
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
		package: undefined,
		imports: [{
			isStatic: true,
			name: { parts: ['java', 'lang', 'Math', 'PI'] },
			isWildcard: false,
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
		package: undefined,
		imports: [],
		types: [{
			type: 'class',
			annotations: [],
			modifiers: ['public'],
			name: 'Foo',
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
		package: undefined,
		imports: [],
		types: [{
			type: 'interface',
			annotations: [],
			modifiers: ['public'],
			name: 'Bar',
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
		package: undefined,
		imports: [],
		types: [{
			type: 'enum',
			annotations: [],
			modifiers: ['public'],
			name: 'Status',
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
		package: undefined,
		imports: [],
		types: [{
			type: 'class',
			annotations: [{ name: { parts: ['Deprecated'] } }],
			modifiers: ['public'],
			name: 'OldClass',
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
		package: {
			annotations: [],
			name: { parts: ['com', 'example'] },
		},
		imports: [
			{ isStatic: false, name: { parts: ['java', 'util', 'List'] }, isWildcard: false },
			{ isStatic: false, name: { parts: ['java', 'util', 'Map'] }, isWildcard: false },
		],
		types: [{
			type: 'class',
			annotations: [],
			modifiers: ['public'],
			name: 'MyClass',
		}],
	});
});

test('clone javaparser repo and list files', async t => {
	const dir = await cloneJavaparserRepo();
	const { stdout } = await execa('find', [dir, '-name', '*.java', '-type', 'f'], { cwd: dir });
	const files = stdout.split('\n').filter(Boolean);

	t.true(files.length > 0, 'should find java files');
	t.log(`Found ${files.length} Java files`);
	t.log('Sample files:', files.slice(0, 5));
});

test('run java snippet', async t => {
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

test('parse javaparser source file using javaparser', async t => {
	const repoDir = await cloneJavaparserRepo();
	const targetFile = path.join(
		repoDir,
		'javaparser-core/src/main/java/com/github/javaparser/StaticJavaParser.java',
	);

	const code = `
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
			} else {
				sb.append("\\"").append(value.toString().replace("\\"", "\\\\\\"").replace("\\n", "\\\\n")).append("\\"");
			}
		});

		sb.append("}");
		return sb.toString();
	}
}
`;

	const output = await runJavaSnippet(code, [targetFile]);
	const ast = JSON.parse(output);

	console.dir(ast, { depth: 10 });

	t.is(ast.type, 'CompilationUnit');
	t.truthy(ast.packageDeclaration);
	t.is(ast.packageDeclaration.type, 'PackageDeclaration');
});
