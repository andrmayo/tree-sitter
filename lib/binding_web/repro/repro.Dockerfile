# build web-tree-sitter from local fork of tree-sitter
# should be run from tree-sitter repo root with
# docker build -f lib/binding_web/repro/repro.Dockerfile -t ts-leak .

FROM emscripten/emsdk:4.0.15 AS builder

RUN apt-get update && apt-get install -y --no-install-recommends libclang-dev && rm -rf /var/lib/apt/lists/*

# Build tree-sitter-swift's wasm here, where emcc is natively available:
# tree-sitter-cli's build --wasm predates the wasi-sdk-based toolchain
# before v0.26.1 and needs emcc directly. Pinned to 0.25.9 since newer
# releases' native binary needs a glibc version neither this image nor the
# runtime stage's base image has. Placed before the repo COPY below since
# it depends only on external npm packages, so it caches independently of
# any source changes.
WORKDIR /usr/src/swift-wasm
# this tree-sitter-cli is used solely to compile the swift grammar from its source
RUN npm init -y && npm install --legacy-peer-deps --save-dev tree-sitter-cli@0.25.9 tree-sitter-swift
RUN npx tree-sitter build --wasm node_modules/tree-sitter-swift -o tree-sitter-swift.wasm

RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

WORKDIR /usr/src/tree-sitter
COPY crates ./crates
COPY test ./test
COPY .cargo ./.cargo
COPY CMakeLists.txt Cargo.lock Cargo.toml Makefile .


WORKDIR /usr/src/tree-sitter/lib
COPY lib/binding_rust ./binding_rust
COPY lib/include ./include
COPY lib/lldb_pretty_printers ./lldb_pretty_printers
COPY lib/Cargo.toml lib/tree-sitter.pc.in .
COPY lib/src ./src
COPY lib/binding_web ./binding_web

WORKDIR /usr/src/tree-sitter/lib/binding_web
RUN npm install && npm run build

# build runtime

FROM node:22-slim

# Grammars sourced from each language's own package rather than
# tree-sitter-wasms. Placed before the builder
# COPY below since it depends only on external npm packages, so it caches
# independently of the built package.
WORKDIR /usr/src/grammars
RUN npm init -y && npm install --legacy-peer-deps --save-dev \
  tree-sitter-typescript \
  tree-sitter-cpp \
  tree-sitter-c-sharp \
  tree-sitter-ruby \
  @tree-sitter-grammars/tree-sitter-kotlin

WORKDIR /usr/src/app
COPY --from=builder /usr/src/tree-sitter/lib/binding_web /opt/web-tree-sitter

# compiles TS to plain JS at image build time so that
# building can be separated from the process we want to measure
WORKDIR /opt/web-tree-sitter
RUN mkdir -p repro/wasms \
  && cp /usr/src/grammars/node_modules/tree-sitter-typescript/tree-sitter-typescript.wasm repro/wasms/ \
  && cp /usr/src/grammars/node_modules/tree-sitter-cpp/tree-sitter-cpp.wasm repro/wasms/ \
  && cp /usr/src/grammars/node_modules/tree-sitter-c-sharp/tree-sitter-c_sharp.wasm repro/wasms/ \
  && cp /usr/src/grammars/node_modules/tree-sitter-ruby/tree-sitter-ruby.wasm repro/wasms/ \
  && cp /usr/src/grammars/node_modules/@tree-sitter-grammars/tree-sitter-kotlin/tree-sitter-kotlin.wasm repro/wasms/
COPY --from=builder /usr/src/swift-wasm/tree-sitter-swift.wasm repro/wasms/tree-sitter-swift.wasm
WORKDIR /opt/web-tree-sitter/repro
RUN npx esbuild leak.ts multi-lang.ts --bundle \
  --platform=node --format=esm \
  --resolve-extensions=.ts,.mjs,.js \
  --outdir=. --out-extension:.js=.mjs
RUN cp ../lib/web-tree-sitter.wasm .

CMD ["node", "leak.mjs"]
