import express from "@untrust/mandate-express";
import { unsafeAllowAnyStandardSchema } from "@untrust/mandate-core";
import { createAjvValidator } from "@untrust/mandate-ajv";

const app = express({ policies: [unsafeAllowAnyStandardSchema] });
app.use(express.json());
app.post("/users", { body: createAjvValidator<{ email: string }>({
  type: "object", required: ["email"], additionalProperties: false,
  properties: { email: { type: "string", format: "email" } }
}) }, (req, res) => res.json(req.body));
