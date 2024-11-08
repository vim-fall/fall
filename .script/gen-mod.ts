import {
  dirname,
  fromFileUrl,
  globToRegExp,
  join,
  relative,
} from "jsr:@std/path@^1.0.8";
import { exists, walk } from "jsr:@std/fs@^1.0.5";

const excludes = [
  "mod.ts",
  "*_test.ts",
  "*_bench.ts",
  "_*.ts",
];

async function* iterModules(path: string): AsyncIterable<string> {
  const patterns = excludes.map((p) => globToRegExp(p));
  for await (const entry of Deno.readDir(path)) {
    if (entry.isFile) {
      if (!entry.name.endsWith(".ts")) continue;
      if (patterns.some((p) => p.test(entry.name))) continue;
      yield entry.name;
    } else if (entry.isDirectory) {
      const modPath = join(path, entry.name, "mod.ts");
      if (await exists(modPath)) {
        yield relative(path, modPath);
      }
    }
  }
}

async function generateModTs(
  path: string,
): Promise<void> {
  const it = walk(path, {
    includeFiles: false,
    includeDirs: true,
    includeSymlinks: false,
  });
  for await (const entry of it) {
    const filenames = await Array.fromAsync(iterModules(entry.path));
    if (filenames.length === 0) continue;
    filenames.sort();
    const lines = [
      "// This file is generated by gen-mod.ts",
      ...filenames.map((name) => {
        if (name.endsWith("/mod.ts")) {
          return `export * as ${dirname(name)} from "./${name}";`;
        } else {
          return `export * from "./${name}";`;
        }
      }),
    ];
    await Deno.writeTextFile(
      join(entry.path, "mod.ts"),
      lines.join("\n"),
    );
  }
}

if (import.meta.main) {
  generateModTs(
    fromFileUrl(new URL("../denops/@fall/builtin", import.meta.url)),
  );
}
