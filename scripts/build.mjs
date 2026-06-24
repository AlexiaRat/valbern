// Bundles each Lambda handler in src/handlers/*.ts into dist/<name>/index.js.
// Terraform (infra/lambda.tf) zips each dist/<name> dir via archive_file.
// One bundle per handler keeps cold-start small and IAM/packaging per-function.
import { build } from "esbuild";
import { readdirSync, mkdirSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const handlersDir = join(root, "src", "handlers");
const outRoot = join(root, "dist");

const handlers = readdirSync(handlersDir)
  .filter((f) => f.endsWith(".ts"))
  .map((f) => basename(f, ".ts"));

mkdirSync(outRoot, { recursive: true });

await Promise.all(
  handlers.map((name) =>
    build({
      entryPoints: [join(handlersDir, `${name}.ts`)],
      outfile: join(outRoot, name, "index.js"),
      bundle: true,
      platform: "node",
      target: "node20",
      format: "esm",
      sourcemap: true,
      // AWS SDK v3 is provided by the Lambda Node 20 runtime — don't bundle it.
      external: ["@aws-sdk/*"],
      banner: {
        js: "import{createRequire as __cr}from'module';const require=__cr(import.meta.url);",
      },
    }),
  ),
);

console.log(`built ${handlers.length} handler(s): ${handlers.join(", ")}`);
