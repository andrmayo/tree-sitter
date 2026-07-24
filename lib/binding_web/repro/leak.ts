// Converted from reproduction script at
// https://github.com/tree-sitter/tree-sitter/issues/5547
// in TS rather than JS so code can be tested without rebuilding
// (using tsx), matching test format

import { Parser, Language, Query } from '../src';
import path from 'node:path';

// tree-sitter-wasms' prebuilt files use the legacy "dylink" custom section,
// incompatible with this build's "dylink.0"-only loader, so grammars are
// sourced from each language's own package instead (see repro.Dockerfile).
const wasmDir = path.join(import.meta.dirname, 'wasms');

async function main() {
  await Parser.init();

  const languages = [
    'tree-sitter-typescript.wasm',
    'tree-sitter-cpp.wasm',
    'tree-sitter-c_sharp.wasm',
    'tree-sitter-ruby.wasm',
    'tree-sitter-swift.wasm',
    'tree-sitter-kotlin.wasm',
  ];

  const grammars: Language[] = [];
  for (const wasm of languages) {
    const lang = await Language.load(path.join(wasmDir, wasm));
    grammars.push(lang);
  }

  // Simple 50-byte source
  const source = 'function foo(x) { return x + 1; }';

  for (let i = 0; i < grammars.length; i++) {
    const grammar = grammars[i];
    const parser = new Parser();
    parser.setLanguage(grammar);
    const tree = parser.parse(source);

    // Any query will trigger the leak. A wildcard node query is used since
    // node type names (e.g. "function_declaration") aren't consistent
    // across these languages' grammars.
    const query = new Query(grammar, '(_) @node');
    if (tree === null) {
      throw new Error('parser.parse(source) failed and returned null');
    }
    query.captures(tree.rootNode);

    const before = process.memoryUsage().rss;
    tree.delete();
    parser.delete();
    // Note: query.delete() does NOT free the scratch cursor state
    const after = process.memoryUsage().rss;

    console.log(
      `Language ${i}: delta = ${((after - before) / 1024 / 1024).toFixed(1)}MB`,
    );
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
