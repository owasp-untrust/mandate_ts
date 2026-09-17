export type RequestSource = "body" | "query" | "params" | "headers";

export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly "~standard": {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (value: unknown) =>
      | StandardSchemaV1.Result<Output>
      | Promise<StandardSchemaV1.Result<Output>>;
    readonly types?: { readonly input: Input; readonly output: Output } | undefined;
  };
}

export namespace StandardSchemaV1 {
  export type Issue = { readonly message: string; readonly path?: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }> | undefined };
  export type Result<T> = { readonly value: T; readonly issues?: undefined } | { readonly issues: ReadonlyArray<Issue> };
}

export interface CompiledValidator<T = unknown> {
  validate(value: unknown): T | Promise<T>;
}

export type SchemaLike<T = unknown> = StandardSchemaV1<unknown, T> | CompiledValidator<T>;
export interface RouteSchemas {
  params?: SchemaLike;
  query?: SchemaLike;
  body?: SchemaLike;
  headers?: SchemaLike;
}

export type InferOutput<S> = S extends StandardSchemaV1<any, infer O>
  ? O
  : S extends CompiledValidator<infer O>
    ? O
    : never;
export type ChannelOutput<S extends RouteSchemas, K extends keyof RouteSchemas> =
  K extends keyof S ? InferOutput<NonNullable<S[K]>> : K extends "body" ? undefined : {};

export interface SchemaContext { source: RequestSource; route?: string | undefined; method?: string | undefined }
export interface SchemaPolicy {
  check(schema: unknown, context: SchemaContext): void;
  /** Only the exported unsafe policy may replace Mandate's default VV requirement. */
  readonly unsafeReplaceVvRequirement?: true | undefined;
}

export class RequestValidationError extends Error {
  readonly name = "RequestValidationError";
  constructor(public readonly source: RequestSource, public readonly issues: readonly unknown[], options?: ErrorOptions) {
    super(`Request ${source} validation failed`, options);
  }
}
export class UnsupportedSchemaError extends Error {
  readonly name = "UnsupportedSchemaError";
  constructor(public readonly source: RequestSource, public readonly issues: readonly unknown[] = []) {
    super(`Unsupported schema for request ${source}`);
  }
}
export class SchemaPolicyError extends Error {
  readonly name = "SchemaPolicyError";
  constructor(public readonly source: RequestSource, public readonly issues: readonly unknown[] = []) {
    super(`Schema policy rejected request ${source}`);
  }
}
export class UnsafeRouteError extends Error {
  readonly name = "UnsafeRouteError";
  constructor(message: string, public readonly issues: readonly unknown[] = []) { super(message); }
}

/**
 * Mandate's default policy. Every schema crossing a request boundary must be
 * minted by @untrust/vv, including VV composite schemas such as vv.object().
 */
export const requireVvSchema: SchemaPolicy = Object.freeze({
  check(schema: unknown, context: SchemaContext): void {
    if (!isVvSchema(schema)) {
      throw new SchemaPolicyError(context.source, [{
        code: "mandate.vv_required",
        message: "Request schemas must be created by @untrust/vv."
      }]);
    }
  }
});

/**
 * Explicit escape hatch for a reviewed route/application that must accept a
 * non-VV Standard Schema implementation. Its name is intentionally unsafe.
 */
export const unsafeAllowAnyStandardSchema: SchemaPolicy = Object.freeze({
  unsafeReplaceVvRequirement: true as const,
  check(): void {}
});

function effectivePolicies(policies: readonly SchemaPolicy[]): readonly SchemaPolicy[] {
  return policies.some(policy => policy.unsafeReplaceVvRequirement)
    ? policies
    : [requireVvSchema, ...policies];
}

export function compileValidator<T>(schema: SchemaLike<T>, context: SchemaContext, policies: readonly SchemaPolicy[] = []): CompiledValidator<T> {
  for (const policy of effectivePolicies(policies)) {
    try { policy.check(schema, context); }
    catch (error) {
      if (error instanceof SchemaPolicyError) throw error;
      throw new SchemaPolicyError(context.source, [error]);
    }
  }
  const standard = (schema as Partial<StandardSchemaV1<T, T>>)["~standard"];
  if (standard?.version === 1 && typeof standard.validate === "function") {
    return {
      async validate(value: unknown): Promise<T> {
        let result: StandardSchemaV1.Result<T>;
        try { result = await standard.validate(value); }
        catch (error) { throw new RequestValidationError(context.source, [{ message: "Validator threw unexpectedly" }], { cause: error }); }
        if (result.issues) throw new RequestValidationError(context.source, result.issues);
        return result.value;
      }
    };
  }
  if (schema && typeof (schema as CompiledValidator<T>).validate === "function") return schema as CompiledValidator<T>;
  throw new UnsupportedSchemaError(context.source);
}

export interface RawRequestValues { params?: unknown; query?: unknown; body?: unknown; headers?: unknown }
export interface ValidatedRequestValues<S extends RouteSchemas> {
  params: ChannelOutput<S, "params">;
  query: ChannelOutput<S, "query">;
  body: ChannelOutput<S, "body">;
  headers: ChannelOutput<S, "headers">;
}
export type CompiledRoute<S extends RouteSchemas> = { [K in keyof S]-?: CompiledValidator<InferOutput<NonNullable<S[K]>>> };

export function compileRoute<S extends RouteSchemas>(schemas: S, options: { policies?: readonly SchemaPolicy[] | undefined; route?: string | undefined; method?: string | undefined } = {}): CompiledRoute<S> {
  const compiled: Partial<Record<RequestSource, CompiledValidator>> = {};
  for (const source of ["params", "query", "body", "headers"] as const) {
    const schema = schemas[source];
    if (schema !== undefined) compiled[source] = compileValidator(schema, { source, route: options.route, method: options.method }, options.policies);
  }
  return compiled as CompiledRoute<S>;
}

export async function validateCompiledRequest<S extends RouteSchemas>(compiled: CompiledRoute<S>, raw: RawRequestValues): Promise<ValidatedRequestValues<S>> {
  const output: Record<RequestSource, unknown> = { params: {}, query: {}, body: undefined, headers: {} };
  for (const source of ["params", "query", "body", "headers"] as const) {
    const validator = (compiled as Partial<Record<RequestSource, CompiledValidator>>)[source];
    if (!validator) continue;
    try { output[source] = await validator.validate(raw[source]); }
    catch (error) {
      if (error instanceof RequestValidationError) {
        if (error.source === source) throw error;
        throw new RequestValidationError(source, error.issues, { cause: error });
      }
      throw new RequestValidationError(source, [{ message: "Validator threw unexpectedly" }], { cause: error });
    }
  }
  return output as unknown as ValidatedRequestValues<S>;
}

export async function validateRequest<S extends RouteSchemas>(schemas: S, raw: RawRequestValues, options: { policies?: readonly SchemaPolicy[] | undefined; route?: string | undefined; method?: string | undefined } = {}): Promise<ValidatedRequestValues<S>> {
  return validateCompiledRequest(compileRoute(schemas, options), raw);
}
import { isVvSchema } from "@untrust/vv";
