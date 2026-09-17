import { describe, expect, it } from "vitest";
import { z } from "zod";
import { classifications, defineTypes, disclosures, noAdditionalValidation, object, regexString } from "@untrust/vv";
import { RequestValidationError, SchemaPolicyError, unsafeAllowAnyStandardSchema, validateRequest } from "../src/index.js";

const values = defineTypes({
  Email: {
    archetype: regexString({ normalize: value => value.trim().toLowerCase(), bounds: { minimum: 3, maximum: 254 }, pattern: /^[^@\s]+@[^@\s]+\.[^@\s]+$/, validateAdditional: noAdditionalValidation }),
    classification: classifications.pii(),
    disclosure: disclosures.redacted<string>()
  }
});

describe("mandate core", () => {
  it("requires VV schemas by default and preserves centrally missing channels", async () => {
    await expect(validateRequest({ body: z.object({ email: z.string().email() }) }, { body: { email: "a@b.com" } }))
      .rejects.toMatchObject({ name: "SchemaPolicyError", source: "body" });
    const result = await validateRequest({ body: object({ email: values.Email }) }, { body: { email: " A@B.COM " }, query: { leaked: true }, params: { leaked: true } });
    expect(result.body.email.exposeUnchecked()).toBe("a@b.com");
    expect(result.query).toEqual({});
    expect(result.params).toEqual({});
  });
  it("allows a non-VV Standard Schema only through the explicit unsafe policy", async () => {
    const result = await validateRequest({ body: z.object({ email: z.string().email(), age: z.number().int() }) },
      { body: { email: "a@b.com", age: 3, admin: true }, query: { leaked: true }, params: { leaked: true } }, { policies: [unsafeAllowAnyStandardSchema] });
    expect(result).toEqual({ body: { email: "a@b.com", age: 3 }, query: {}, params: {}, headers: {} });
  });
  it("uses transformed output and async validators", async () => {
    const result = await validateRequest({ body: z.string().transform(async value => Number(value)) }, { body: "42" }, { policies: [unsafeAllowAnyStandardSchema] });
    expect(result.body).toBe(42);
  });
  it("fails closed", async () => {
    await expect(validateRequest({ body: z.object({ age: z.number() }) }, { body: { age: "3" } }, { policies: [unsafeAllowAnyStandardSchema] }))
      .rejects.toBeInstanceOf(RequestValidationError);
  });
  it("normalizes unexpected validator exceptions without exposing them as the public error", async () => {
    const cause = new Error("database password should not become the public error");
    await expect(validateRequest({ body: { validate() { throw cause; } } }, { body: {} }, { policies: [unsafeAllowAnyStandardSchema] }))
      .rejects.toMatchObject({ name: "RequestValidationError", source: "body", issues: [{ message: "Validator threw unexpectedly" }], cause });
  });
  it("runs installable schema policies at compilation", async () => {
    await expect(validateRequest({ body: z.string() }, { body: "x" }, {
      policies: [unsafeAllowAnyStandardSchema, { check(_schema, context) { throw new SchemaPolicyError(context.source, ["blocked by test policy"]); } }]
    })).rejects.toMatchObject({ name: "SchemaPolicyError", source: "body" });
  });
});
