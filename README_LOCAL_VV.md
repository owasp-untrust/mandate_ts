# Local `@untrust/vv` integration

Mandate declares the published dependency exactly as:

```json
"@untrust/vv": "0.1.0"
```

For pre-publication integration, use a packed npm artifact rather than a source-relative dependency.

```bash
# From ts/vv_ts after its build succeeds
npm pack --workspace @untrust/vv --pack-destination ../mandate/.artifacts

# From ts/mandate
npm run bootstrap:local-vv
npm test
```

`.artifacts/` is ignored. The bootstrap command temporarily adds the tarball only while npm resolves the workspace, then restores `package.json`; it uses `--no-save` and disables lockfile updates, so it never commits a local path into a package manifest or lockfile. The same packed artifact can be installed into an external temporary consumer to exercise the published package surface.
