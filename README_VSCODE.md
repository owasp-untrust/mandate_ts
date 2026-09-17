# Visual Studio Code workflow

Open the `mandate` directory itself as the VS Code workspace. Then install dependencies in a VS Code terminal:

```bash
npm install
```

When VS Code asks whether to use the workspace TypeScript version, accept. The workspace setting points the TypeScript extension at `node_modules/typescript/lib` so editor diagnostics match command-line builds.

## Build with the Express import boundary

Press `Ctrl+Shift+B` (or run **Tasks: Run Build Task**) and select `mandate: build`. It is the default build task and executes:

```text
npm run check:imports
  → Dependency Cruiser rejects native Express imports outside packages/express
npm run build:typescript
  → TypeScript builds all project references
```

The application-facing import must therefore be:

```ts
import express from "@untrust/mandate-express";
```

This import is rejected outside the adapter implementation:

```ts
import express from "express";
```

The rule also rejects Express subpath imports. Its definition is in `dependency-cruiser.config.mjs`.

## Run tests

Use **Tasks: Run Test Task** and choose `mandate: test`, or execute:

```bash
npm test
```

The full test task runs the import boundary first, followed by the TypeScript build, runtime tests, and compile-time type tests. To run only the architectural check, select `mandate: check imports` from **Tasks: Run Task** or run:

```bash
npm run check:imports
```

No commit or push is required. These checks run locally whenever the corresponding VS Code task or npm script is executed. CI should invoke the same `npm test` command so the policy cannot be bypassed by skipping a local task.

This repository is a package workspace rather than an executable application, so no `.vscode/launch.json` is included. Consumer applications should make their launch configuration's `preLaunchTask` point to `mandate: build`, or to an equivalent build task in their own workspace that invokes `npm run check:imports`.
