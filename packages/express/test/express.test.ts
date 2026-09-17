import { describe, expect, it } from "vitest";
import request from "supertest";
import { z } from "zod";
import express, { UnsafeRouteError } from "../src/index.js";
import { unsafeAllowAnyStandardSchema } from "@untrust/mandate-core";

describe("validated express", () => {
  it("rejects non-VV schemas unless the explicit unsafe policy is installed", () => {
    const app = express();
    expect(() => app.post("/", { body: z.object({ email: z.string().email() }) }, () => {})).toThrow("Schema policy rejected");
  });

  it("validates, transforms, strips mass-assignment fields, and hides undeclared channels", async () => {
    const app = express({ policies: [unsafeAllowAnyStandardSchema] }); app.use(express.json());
    app.post("/users/:raw", { body: z.object({ email: z.string().email(), age: z.string().transform(Number) }) }, (req, res) => {
      res.json({ body: req.body, params: req.params, query: req.query });
    });
    const response = await request(app as any).post("/users/x?admin=true").send({ email: "a@b.com", age: "4", admin: true });
    expect(response.body).toEqual({ body: { email: "a@b.com", age: 4 }, params: {}, query: {} });
  });
  it("does not execute the handler for invalid input", async () => {
    const app = express({ policies: [unsafeAllowAnyStandardSchema] }); app.use(express.json()); let executed = false;
    app.post("/", { body: z.object({ n: z.number() }) }, () => { executed = true; });
    app.use(express.trustedMiddleware((error, _req, res, _next) => res.status(400).json({ name: error.name })) as any);
    const response = await request(app as any).post("/").send({ n: "x" });
    expect(response.status).toBe(400); expect(response.body.name).toBe("RequestValidationError"); expect(executed).toBe(false);
  });
  it("rejects raw registration and middleware paths", () => {
    const app = express();
    expect(() => (app.post as any)("/", (_req: unknown, _res: unknown) => {})).toThrow(UnsafeRouteError);
    expect(() => (app as any).route("/")).toThrow(UnsafeRouteError);
    expect(() => (app as any).param("id", () => {})).toThrow(UnsafeRouteError);
    expect(() => app.use((() => {}) as any)).toThrow(UnsafeRouteError);
    expect(() => (app as any).router).toThrow(UnsafeRouteError);
  });
  it("mounts wrapped routers while keeping req/res app references wrapped", async () => {
    const app = express(); const router = express.Router();
    router.get("/", {}, (req, res) => res.json({
      same: req.app === res.app,
      request: req.res?.req === req,
      parserHidden: (req.socket as any).parser === undefined,
      messageHidden: (res.socket as any)?._httpMessage === undefined
    }));
    app.use("/nested", router);
    expect((await request(app as any).get("/nested")).body).toEqual({ same: true, request: true, parserHidden: true, messageHidden: true });
  });
  it("rejects malformed nested objects before execution", async () => {
    const app = express({ policies: [unsafeAllowAnyStandardSchema] }); app.use(express.json()); let executed = false;
    app.post("/", { body: z.object({ profile: z.object({ name: z.string() }) }) }, () => { executed = true; });
    const response = await request(app as any).post("/").send({ profile: { name: 12 } });
    expect(response.status).toBe(500); expect(executed).toBe(false);
  });
  it("does not expose prototype-shaped or mass-assignment properties", async () => {
    const app = express({ policies: [unsafeAllowAnyStandardSchema] }); app.use(express.json());
    app.post("/", { body: z.object({ name: z.string() }) }, (req, res) => {
      res.json({ keys: Object.keys(req.body), admin: (req.body as any).admin, ownProto: Object.hasOwn(req.body, "__proto__") });
    });
    const response = await request(app as any).post("/").type("json").send('{"name":"n","admin":true,"__proto__":{"admin":true}}');
    expect(response.body).toEqual({ keys: ["name"], ownProto: false });
  });
  it("fails closed on ambiguous duplicate query values", async () => {
    const app = express({ policies: [unsafeAllowAnyStandardSchema] }); let executed = false;
    app.get("/", { query: z.object({ role: z.string() }) }, () => { executed = true; });
    const response = await request(app as any).get("/?role=user&role=admin");
    expect(response.status).toBe(500); expect(executed).toBe(false);
  });
  it("prevents handler mutation of validated channels, including Express 5 req.query", async () => {
    const app = express({ policies: [unsafeAllowAnyStandardSchema] }); app.use(express.json());
    app.post("/", { body: z.object({ n: z.string().transform(Number) }), query: z.object({ q: z.string() }) }, (req, res) => {
      let bodyBlocked = false; let queryBlocked = false;
      try { (req as any).body = { n: 999 }; } catch { bodyBlocked = true; }
      try { (req as any).query = { q: "changed" }; } catch { queryBlocked = true; }
      res.json({ n: req.body.n, q: req.query.q, bodyBlocked, queryBlocked });
    });
    const response = await request(app as any).post("/?q=original").send({ n: "7" });
    expect(response.body).toEqual({ n: 7, q: "original", bodyBlocked: true, queryBlocked: true });
  });
});
