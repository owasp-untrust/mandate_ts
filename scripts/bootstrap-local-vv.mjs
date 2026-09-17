import { readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";

const packagePath = new URL("../package.json", import.meta.url);
const original = await readFile(packagePath, "utf8");
const manifest = JSON.parse(original);
manifest.devDependencies = {
  ...manifest.devDependencies,
  "@untrust/vv": "file:.artifacts/untrust-vv-0.1.0.tgz"
};

await writeFile(packagePath, `${JSON.stringify(manifest, null, 2)}\n`);
try {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const child = spawn(npm, ["install", "--no-save", "--package-lock=false"], { stdio: "inherit" });
  const exitCode = await new Promise(resolve => child.once("exit", resolve));
  if (exitCode !== 0) process.exitCode = typeof exitCode === "number" ? exitCode : 1;
} finally {
  await writeFile(packagePath, original);
}
