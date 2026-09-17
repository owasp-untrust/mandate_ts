import express from "@untrust/mandate-express";
import { z } from "zod";
import { classifications, defineTypes, disclosures, noAdditionalValidation, object, regexString, type InferValue } from "@untrust/vv";

const mandateTypes = defineTypes({
  Username: {
    archetype: regexString({ normalize: value => value, bounds: { minimum: 3, maximum: 20 }, pattern: /^[a-z]+$/, validateAdditional: noAdditionalValidation }),
    classification: classifications.public(),
    disclosure: disclosures.public<string>()
  }
});
type Username = InferValue<typeof mandateTypes.Username>;

const app = express();
app.post("/users/:id", {
  params: z.object({ id: z.string().uuid() }),
  body: z.object({ email: z.string().email(), age: z.string().transform(Number) })
}, (req, res) => {
  const id: string = req.params.id;
  const email: string = req.body.email;
  const age: number = req.body.age;
  // @ts-expect-error undeclared properties cannot be read
  req.body.unknown;
  res.json({ id, email, age });
});

app.get("/", {}, (req, res) => {
  // @ts-expect-error body is unavailable without a body schema
  req.body.email;
  // @ts-expect-error params are an empty object when undeclared
  req.params.id;
  res.end();
});

app.post("/vv", { body: object({ username: mandateTypes.Username }) }, (req, res) => {
  const username: Username = req.body.username;
  // @ts-expect-error Mandate preserves VV's nominal output rather than exposing a primitive string.
  const primitive: string = req.body.username;
  res.json(username.toPublicValue());
  void primitive;
});

// @ts-expect-error schemas are mandatory
app.post("/unsafe", (_req, _res) => {});
