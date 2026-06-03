import type { Session } from "next-auth";

type FetchInit = Omit<RequestInit, "headers"> & {
  headers?: HeadersInit;
};

export async function apiFetch(url: string, session: Session | null, init: FetchInit = {}) {
  const headers = new Headers(init.headers);
  if (session?.token) {
    headers.set("Authorization", `Bearer ${session.token}`);
  }

  return fetch(url, {
    ...init,
    headers,
    cache: init.cache ?? "no-store",
  });
}
