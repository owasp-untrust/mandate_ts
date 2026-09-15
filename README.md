# Mandate

> A handler receives only request input that its route explicitly declares and that successfully crosses the configured validation boundary.

This workspace currently contains the first milestone: `@untrust/mandate-core`, `@untrust/mandate-express`, and `@untrust/mandate-ajv`. It deliberately does not claim to make an application safe or secure; it establishes a narrow request-input boundary.

## Express + Zod (explicit unsafe compatibility mode)

```ts
import express from "@untrust/mandate-express";
import { unsafeAllowAnyStandardSchema } from "@untrust/mandate-core";
import { z } from "zod";

const app = express({ policies: [unsafeAllowAnyStandardSchema] });
app.use(express.json());
app.post("/users/:id", {
  params: z.object({ id: z.string().uuid() }),
  body: z.object({ email: z.string().email() })
}, (req, res) => res.json({ id: req.params.id, email: req.body.email }));
```

Mandate requires schemas minted by `@untrust/vv` by default. A reviewed route can install the explicitly unsafe Standard Schema policy when it must use another implementation.

## Express + Valibot (explicit unsafe compatibility mode)

```ts
import express from "@untrust/mandate-express";
import { unsafeAllowAnyStandardSchema } from "@untrust/mandate-core";
import * as v from "valibot";

const app = express({ policies: [unsafeAllowAnyStandardSchema] });
app.get("/search", {
  query: v.strictObject({ term: v.string(), page: v.pipe(v.string(), v.transform(Number)) })
}, (req, res) => res.json({ term: req.query.term, page: req.query.page }));
```

## Express + Ajv (explicit unsafe compatibility mode)

```ts
import express from "@untrust/mandate-express";
import { unsafeAllowAnyStandardSchema } from "@untrust/mandate-core";
import { createAjvValidator } from "@untrust/mandate-ajv";

const body = createAjvValidator<{ email: string }>({
  type: "object",
  required: ["email"],
  additionalProperties: false,
  properties: { email: { type: "string", format: "email" } }
});

const app = express({ policies: [unsafeAllowAnyStandardSchema] });
app.use(express.json());
app.post("/users", { body }, (req, res) => res.json(req.body));
```

## Escape hatches

`route()`, `param()`, `router`, raw route handlers, and unmarked middleware are rejected. `Router()` is wrapped, and only wrapped routers may be mounted directly. Middleware needing the native Express request must be deliberately marked:

```ts
app.use(express.trustedMiddleware(thirdPartyMiddleware));
```

Trusted middleware is outside the validated-handler boundary and can access or mutate raw request input. Built-in body parsers are pre-marked. Wrapped handler request/response links (`req.app`, `res.app`, `req.res`, and `res.req`) lead back to wrapped objects.

Unknown object-property behavior is selected by the VV schema: `vv.object()` rejects unknown keys by default, while stripping requires an explicit option. Mandate never overlays raw values onto validator output.
"# mandate_ts" 
