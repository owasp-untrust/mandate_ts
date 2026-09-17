import expressNative, { type Application, type ErrorRequestHandler, type NextFunction, type Request, type RequestHandler, type Response, type Router } from "express";
import { compileRoute, UnsafeRouteError, validateCompiledRequest, type ChannelOutput, type RouteSchemas, type SchemaPolicy } from "@untrust/mandate-core";

const TRUSTED = Symbol("@untrust/mandate-express trusted middleware");
const WRAPPED = Symbol("@untrust/mandate-express wrapped router");
type Middleware = RequestHandler | ErrorRequestHandler;
type Trusted = Middleware & { [TRUSTED]: true };

export type ValidatedRequest<S extends RouteSchemas> = Omit<Request, "body" | "query" | "params"> & {
  readonly body: ChannelOutput<S, "body">;
  readonly query: ChannelOutput<S, "query">;
  readonly params: ChannelOutput<S, "params">;
};
export type ValidatedHandler<S extends RouteSchemas> = (req: ValidatedRequest<S>, res: Response, next: NextFunction) => unknown;

type RouteMethod = <S extends RouteSchemas>(path: string, schemas: S, handler: ValidatedHandler<S>) => WrappedRouter;
export interface WrappedRouter {
  get: RouteMethod; post: RouteMethod; put: RouteMethod; patch: RouteMethod; delete: RouteMethod;
  options: RouteMethod; head: RouteMethod; all: RouteMethod;
  use(...handlers: Array<Trusted | WrappedRouter>): WrappedRouter;
  use(path: string, ...handlers: Array<Trusted | WrappedRouter>): WrappedRouter;
  route(path: string): never;
  param(...args: unknown[]): never;
  readonly router: never;
  readonly [WRAPPED]: true;
}
export interface WrappedApplication extends WrappedRouter {
  listen: Application["listen"];
  set: Application["set"];
  disable: Application["disable"];
  enable: Application["enable"];
  engine: Application["engine"];
}

export interface ExpressOptions { policies?: readonly SchemaPolicy[] }

export function trustedMiddleware(handler: Middleware): Trusted {
  Object.defineProperty(handler, TRUSTED, { value: true });
  return handler as Trusted;
}

function isWrapped(value: unknown): value is WrappedRouter {
  return Boolean(value && (value as Partial<WrappedRouter>)[WRAPPED]);
}

function wrapRequest<S extends RouteSchemas>(raw: Request, values: Awaited<ReturnType<typeof validateCompiledRequest<S>>>, app: WrappedRouter): ValidatedRequest<S> {
  let responseProxy: Response | undefined;
  const socketProxy = wrapSocket(raw.socket);
  const requestProxy = new Proxy(raw, {
    get(target, property) {
      if (property === "body" || property === "query" || property === "params") return values[property];
      if (property === "app") return app;
      if (property === "res") return responseProxy;
      if (property === "socket" || property === "connection" || property === "client") return socketProxy;
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
    set(_target, property) {
      if (property === "body" || property === "query" || property === "params") throw new UnsafeRouteError(`Validated req.${String(property)} is read-only`);
      return false;
    }
  }) as ValidatedRequest<S>;
  if (raw.res) responseProxy = wrapResponse(raw.res, requestProxy, app);
  return requestProxy;
}

function wrapResponse(raw: Response, request: unknown, app: WrappedRouter): Response {
  const socketProxy = raw.socket ? wrapSocket(raw.socket) : undefined;
  return new Proxy(raw, {
    get(target, property) {
      if (property === "app") return app;
      if (property === "req") return request;
      if (property === "socket" || property === "connection") return socketProxy;
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
}

function wrapSocket<T extends object>(raw: T): T {
  return new Proxy(raw, {
    get(target, property) {
      // Node's parser.incoming and socket._httpMessage lead back to the native
      // request/response graph, bypassing req.res/res.req shadowing.
      if (property === "parser" || property === "_httpMessage") return undefined;
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
}

function createWrapped(raw: Application | Router, options: ExpressOptions): WrappedApplication {
  let wrapped!: WrappedApplication;
  const routeMethods = new Set(["get", "post", "put", "patch", "delete", "options", "head", "all"]);
  wrapped = new Proxy(raw, {
    get(target, property) {
      if (property === WRAPPED) return true;
      if (property === "router") throw new UnsafeRouteError("app.router exposes raw route registration");
      if (property === "route" || property === "param") return () => { throw new UnsafeRouteError(`${String(property)}() is not available on a validated router`); };
      if (property === "use") return (...args: unknown[]) => {
        const offset = typeof args[0] === "string" ? 1 : 0;
        if (args.length === offset) throw new UnsafeRouteError("use() requires explicitly trusted middleware or a wrapped router");
        const accepted = args.slice(offset).map(item => {
          if (isWrapped(item)) return item;
          if (typeof item === "function" && (item as Partial<Trusted>)[TRUSTED]) return item;
          throw new UnsafeRouteError("Raw middleware is rejected; wrap it with trustedMiddleware()");
        });
        (target.use as Function).call(target, ...(offset ? [args[0], ...accepted] : accepted));
        return wrapped;
      };
      if (typeof property === "string" && routeMethods.has(property)) return <S extends RouteSchemas>(path: string, schemas: S, handler: ValidatedHandler<S>) => {
        if (!schemas || typeof schemas !== "object" || typeof handler !== "function")
          throw new UnsafeRouteError(`${property}() requires path, schemas, and handler`);
        const compiled = compileRoute(schemas, { policies: options.policies, route: path, method: property.toUpperCase() });
        const boundary: RequestHandler = async (req, res, next) => {
          try {
            const values = await validateCompiledRequest(compiled, { body: req.body, query: req.query, params: req.params, headers: req.headers });
            const safeReq = wrapRequest(req, values, wrapped);
            const safeRes = wrapResponse(res, safeReq, wrapped);
            await handler(safeReq, safeRes, next);
          } catch (error) { next(error); }
        };
        (target as any)[property](path, boundary);
        return wrapped;
      };
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    }
  }) as unknown as WrappedApplication;
  return wrapped;
}

interface ExpressFactory {
  (options?: ExpressOptions): WrappedApplication;
  Router(options?: Parameters<typeof expressNative.Router>[0], mandateOptions?: ExpressOptions): WrappedRouter;
  trustedMiddleware: typeof trustedMiddleware;
  json: (...args: Parameters<typeof expressNative.json>) => Trusted;
  urlencoded: (...args: Parameters<typeof expressNative.urlencoded>) => Trusted;
  raw: (...args: Parameters<typeof expressNative.raw>) => Trusted;
  text: (...args: Parameters<typeof expressNative.text>) => Trusted;
  static: (...args: Parameters<typeof expressNative.static>) => Trusted;
}

const express = ((options?: ExpressOptions) => createWrapped(expressNative(), options ?? {})) as ExpressFactory;
express.Router = (options, mandateOptions) => createWrapped(expressNative.Router(options), mandateOptions ?? {});
express.trustedMiddleware = trustedMiddleware;
express.json = (...args) => trustedMiddleware(expressNative.json(...args));
express.urlencoded = (...args) => trustedMiddleware(expressNative.urlencoded(...args));
express.raw = (...args) => trustedMiddleware(expressNative.raw(...args));
express.text = (...args) => trustedMiddleware(expressNative.text(...args));
express.static = (...args) => trustedMiddleware(expressNative.static(...args));

export default express;
export { UnsafeRouteError } from "@untrust/mandate-core";
