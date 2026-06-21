// Writes the per-directory package.json markers so that Node treats
// dist/esm as ES modules and dist/cjs as CommonJS, regardless of the
// root package.json "type" field. This is the standard dual-package
// publishing trick that needs no bundler.
import { writeFileSync, existsSync } from "node:fs";

const targets = [
  ["dist/esm/package.json", { type: "module" }],
  ["dist/cjs/package.json", { type: "commonjs" }],
];

for (const [path, content] of targets) {
  const dir = path.slice(0, path.lastIndexOf("/"));
  if (!existsSync(dir)) {
    throw new Error(`Expected build output directory "${dir}" to exist. Run the TypeScript build first.`);
  }
  writeFileSync(path, JSON.stringify(content, null, 2) + "\n");
  console.log(`wrote ${path}`);
}
