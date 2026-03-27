import { Hono } from "hono";

export function createApp() {
  const app = new Hono();

  app.get("/health", (c) => {
    return c.json({
      status: "ok",
      timestamp: new Date().toISOString()
    });
  });

  return app;
}
