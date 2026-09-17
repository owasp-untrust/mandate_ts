import express from "@untrust/mandate-express";
import { unsafeAllowAnyStandardSchema } from "@untrust/mandate-core";
import * as v from "valibot";

const app = express({ policies: [unsafeAllowAnyStandardSchema] });
app.get("/search", {
  query: v.strictObject({ term: v.string(), page: v.pipe(v.string(), v.transform(Number)) })
}, (req, res) => res.json(req.query));
