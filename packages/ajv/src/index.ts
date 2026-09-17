import { createRequire } from "node:module";
import { Ajv, type AnySchema, type Format, type KeywordDefinition, type Options } from "ajv";
import { RequestValidationError, type CompiledValidator, type RequestSource } from "@untrust/mandate-core";

export interface AjvValidatorOptions {
  ajv?: Ajv;
  options?: Options;
  formats?: Record<string, Format>;
  keywords?: readonly (string | KeywordDefinition)[];
  standardFormats?: boolean;
  source?: RequestSource;
}

export function createAjvValidator<T = unknown>(schema: AnySchema, config: AjvValidatorOptions = {}): CompiledValidator<T> {
  const ajv = config.ajv ?? new Ajv({ strict: true, allErrors: true, ...config.options });
  if (config.standardFormats !== false) {
    try {
      const imported = createRequire(import.meta.url)("ajv-formats") as { default?: (instance: Ajv) => unknown } | ((instance: Ajv) => unknown);
      const install = typeof imported === "function" ? imported : imported.default;
      if (install) install(ajv);
    } catch (error) {
      throw new Error("Standard formats requested but optional peer dependency ajv-formats is not installed", { cause: error });
    }
  }
  for (const [name, format] of Object.entries(config.formats ?? {})) ajv.addFormat(name, format);
  for (const keyword of config.keywords ?? []) ajv.addKeyword(keyword as any);
  const validate = ajv.compile<T>(schema);
  return {
    validate(value: unknown): T {
      if (!validate(value)) throw new RequestValidationError(config.source ?? "body", validate.errors ?? []);
      return value as T;
    }
  };
}
