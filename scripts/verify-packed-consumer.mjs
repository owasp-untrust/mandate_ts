import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const artifacts = join(root, ".artifacts");
const vv = join(artifacts, "untrust-vv-0.1.0.tgz");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = execFile(command, args, { cwd }, error => error ? reject(error) : resolve());
    child.stdout?.pipe(process.stdout);
    child.stderr?.pipe(process.stderr);
  });
}

await access(vv);
await run(npm, ["pack", "--workspace", "@untrust/mandate-core", "--workspace", "@untrust/mandate-express", "--pack-destination", artifacts], root);

const fixture = await mkdtemp(join(tmpdir(), "mandate-packed-consumer-"));
try {
  const dependency = file => `file:${join(artifacts, file).replaceAll("\\", "/")}`;
  await writeFile(join(fixture, "package.json"), `${JSON.stringify({
    name: "mandate-packed-consumer",
    private: true,
    type: "module",
    dependencies: {
      "@untrust/vv": dependency("untrust-vv-0.1.0.tgz"),
      "@untrust/mandate-core": dependency("untrust-mandate-core-0.1.0.tgz"),
      "@untrust/mandate-express": dependency("untrust-mandate-express-0.1.0.tgz"),
      express: "^5.1.0"
    }
  }, null, 2)}\n`);
  await writeFile(join(fixture, "verify.mjs"), `
import { classifications, defineTypes, disclosures, noAdditionalValidation, object, regexString } from "@untrust/vv";
import { validateRequest } from "@untrust/mandate-core";
import mandateExpress from "@untrust/mandate-express";

const values = defineTypes({
  Username: {
    archetype: regexString({ normalize: value => value.trim().toLowerCase(), bounds: { minimum: 3, maximum: 20 }, pattern: /^[a-z]+$/, validateAdditional: noAdditionalValidation }),
    classification: classifications.public(),
    disclosure: disclosures.public()
  }
});
const result = await validateRequest({ body: object({ username: values.Username }) }, { body: { username: " Alice " } });
if (result.body.username.exposeUnchecked() !== "alice") throw new Error("Packed VV/Mandate integration failed");
if (typeof mandateExpress !== "function") throw new Error("Packed Express adapter did not resolve");
`);
  await run(npm, ["install", "--no-audit", "--no-fund"], fixture);
  await run(process.execPath, ["verify.mjs"], fixture);
  console.log("Packed consumer verification passed.");
} finally {
  await rm(fixture, { recursive: true, force: true });
}
