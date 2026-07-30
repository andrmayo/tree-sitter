import { Parser, Language, Query } from '../src';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const wasmDir = path.join(
  path.dirname(require.resolve('tree-sitter-wasms/package.json')),
  'out',
);

// Here, just use C++
const languages = ['tree-sitter-cpp.wasm'];

// For each language, a source snippet and a query
const cases: Record<string, { source: string; query: string }> = {
  'tree-sitter-cpp.wasm': {
    source: 'int foo(int x) { return x + 1; }\n',
    query: '(function_definition) @func',
  },
};

// overwrite source to be arbitrarily nested

function nestExpression(
  expression: string,
  leftDelim: string,
  rightDelim: string,
  operator: string,
  nestLevels: number,
): string {
  const components: string[] = [];
  for (let i = 0; i < nestLevels; i++) {
    components.push(leftDelim);
    components.push(expression);
    if (i != nestLevels - 1) {
      components.push(operator);
    }
  }
  for (let i = 0; i < nestLevels; i++) {
    components.push(rightDelim);
  }
  return components.join('');
}

// In principle, T(n) = O(n) where n is the number of nodes in the tree(s), regardless of
// whether we process a tree with n / c nodes c times or a tree with n nodes once

cases['tree-sitter-cpp.wasm'].source =
  nestExpression('2+2', '(', ')', '+', 500) + ';';

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
