import { describe, expect, it } from "vitest";
import { createAjvValidator } from "../src/index.js";
import { unsafeAllowAnyStandardSchema, validateRequest } from "@untrust/mandate-core";

describe("Ajv adapter", () => {
  const schema = { type: "object", required: ["email", "score"], additionalProperties: false, properties: {
    email: { type: "string", format: "email", pattern: "@" }, score: { type: "number", minimum: 1, maximum: 10 }
  } } as const;
  it("supports required, closed objects, formats, patterns and ranges", () => {
    const validator = createAjvValidator(schema);
    expect(validator.validate({ email: "a@b.com", score: 5 })).toEqual({ email: "a@b.com", score: 5 });
    expect(() => validator.validate({ email: "bad", score: 99, admin: true })).toThrow("validation failed");
  });
  it("supports custom formats and keywords", () => {
    const validator = createAjvValidator({ type: "string", format: "internal-ip", startsWith: "10." }, {
      formats: { "internal-ip": (value: string) => value.startsWith("10.") },
      keywords: [{ keyword: "startsWith", type: "string", schemaType: "string", validate: (prefix: string, value: string) => value.startsWith(prefix) }]
    });
    expect(validator.validate("10.0.0.1")).toBe("10.0.0.1");
    expect(() => validator.validate("8.8.8.8")).toThrow();
  });
  it("fails during creation for invalid schemas", () => {
    expect(() => createAjvValidator({ type: "definitely-not-a-type" } as any)).toThrow();
  });
  it("reports the route channel rather than an adapter default", async () => {
    await expect(validateRequest({ query: createAjvValidator({ type: "string" }) }, { query: 1 }, { policies: [unsafeAllowAnyStandardSchema] }))
      .rejects.toMatchObject({ name: "RequestValidationError", source: "query" });
  });
});
