import express from "@untrust/mandate-express";
import { unsafeAllowAnyStandardSchema } from "@untrust/mandate-core";
import { z } from "zod";

const app = express({ policies: [unsafeAllowAnyStandardSchema] });
app.use(express.json());
app.post("/users/:id", {
  params: z.object({ id: z.string().uuid() }),
  body: z.object({ email: z.string().email() })
}, (req, res) => res.json({ id: req.params.id, email: req.body.email }));
