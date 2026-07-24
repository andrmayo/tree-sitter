import { Parser, Language, Query } from '../src';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const wasmDir = path.join(
  path.dirname(require.resolve('tree-sitter-wasms/package.json')),
  'out',
);

// Swift, C++, and C# per the issue
const languages = [
  'tree-sitter-typescript.wasm',
  'tree-sitter-cpp.wasm',
  'tree-sitter-c_sharp.wasm',
  'tree-sitter-ruby.wasm',
  'tree-sitter-swift.wasm',
  'tree-sitter-kotlin.wasm',
];

// For each language, a source snippet and a query
const cases: Record<string, { source: string; query: string }> = {
  'tree-sitter-typescript.wasm': {
    source: 'function foo(x: number) { return x + 1; }\n',
    query: '(function_declaration) @func',
  },
  'tree-sitter-cpp.wasm': {
    source: 'int foo(int x) { return x + 1; }\n',
    query: '(function_definition) @func',
  },
  'tree-sitter-c_sharp.wasm': {
    source: 'class C { int Foo(int x) { return x + 1; } }\n',
    query: '(method_declaration) @func',
  },
  'tree-sitter-ruby.wasm': {
    source: 'def foo(x)\n  x + 1\nend\n',
    query: '(method) @func',
  },
  'tree-sitter-swift.wasm': {
    source: 'func foo(x: Int) -> Int { return x + 1 }\n',
    query: '(function_declaration) @func',
  },
  'tree-sitter-kotlin.wasm': {
    source: 'fun foo(x: Int): Int { return x + 1 }\n',
    query: '(function_declaration) @func',
  },
};

const mb = (n: number) => (n / 1048576).toFixed(1);

await Parser.init();
const baseline = process.memoryUsage().rss;
console.log(`baseline rss: ${mb(baseline)}MB`);

for (const wasm of languages) {
  const { source, query: querySrc } = cases[wasm];

  const lang = await Language.load(path.join(wasmDir, wasm));
  const afterLoad = process.memoryUsage().rss;

  const parser = new Parser();
  parser.setLanguage(lang);
  // Repeat the source so query does more work
  const tree = parser.parse(source.repeat(500));
  if (!tree) throw new Error(`parse failed for ${wasm}`);

  const query = new Query(lang, querySrc);
  const captures = query.captures(tree.rootNode);

  const beforeDelete = process.memoryUsage().rss;
  tree.delete();
  parser.delete();
  query.delete();
  const afterDelete = process.memoryUsage().rss;

  console.log(
    `${wasm}: captures=${captures.length}, ` +
      `load=+${mb(afterLoad - baseline)}MB, ` +
      `query=+${mb(beforeDelete - afterLoad)}MB, ` +
      `retained after delete=${mb(afterDelete - baseline)}MB`,
  );
}

console.log(`final rss: ${mb(process.memoryUsage().rss)}`);
