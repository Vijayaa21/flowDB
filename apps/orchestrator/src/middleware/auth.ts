import { createHmac, timingSafeEqual } from "node:crypto";

import type { MiddlewareHandler } from "hono";

type JwtPayload = {
  githubId?: string;
  exp?: number;
};

function readApiKeys(): Set<string> {
  const values = [process.env.FLOWDB_API_KEY, process.env.FLOWDB_API_KEYS]
    .filter((value): value is string => Boolean(value))
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);

  return new Set(values);
}

function readApiKey(header: string | undefined, explicitHeader: string | undefined): string | null {
  if (explicitHeader?.trim()) {
    return explicitHeader.trim();
  }
  if (!header?.startsWith("Api-Key ")) {
    return null;
  }
  return header.slice("Api-Key ".length).trim();
}

function base64UrlDecode(input: string): string {
  const padded = input
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(input.length / 4) * 4, "=");
  return Buffer.from(padded, "base64").toString("utf8");
}

function base64UrlEncode(input: Buffer): string {
  return input.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function verifyJwt(token: string, secret: string): JwtPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  if (!encodedHeader || !encodedPayload || !encodedSignature) {
    return null;
  }
  const data = `${encodedHeader}.${encodedPayload}`;
  const expected = base64UrlEncode(createHmac("sha256", secret).update(data).digest());

  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(encodedSignature);
  if (expectedBuffer.length !== providedBuffer.length) {
    return null;
  }
  if (!timingSafeEqual(expectedBuffer, providedBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as JwtPayload;
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export const authMiddleware: MiddlewareHandler<{
  Variables: { githubId: string; requestId: string };
}> = async (c, next) => {
  const header = c.req.header("authorization");
  const secret = process.env.AUTH_SECRET;
  const apiKey = readApiKey(header, c.req.header("x-api-key"));
  const allowedApiKeys = readApiKeys();

  if (apiKey && allowedApiKeys.has(apiKey)) {
    const apiPrincipal =
      c.req.header("x-flowdb-github-id") ??
      c.req.header("x-org-slug") ??
      process.env.FLOWDB_API_KEY_OWNER ??
      "api";
    c.set("githubId", apiPrincipal);
    await next();
    return;
  }

  if (!header?.startsWith("Bearer ") || !secret) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = header.slice("Bearer ".length).trim();
  const payload = verifyJwt(token, secret);
  const githubId = payload?.githubId;

  if (!githubId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  c.set("githubId", githubId);
  await next();
};
