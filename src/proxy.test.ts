import type { CookieMethodsServer } from "@supabase/ssr";
import { NextRequest } from "next/server";
import { beforeEach, vi } from "vitest";
import { proxy } from "@/proxy";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  createServerClient: vi.fn(),
  config: {
    env: { NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-key" },
    isSupabaseConfigured: true,
  },
}));

vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.createServerClient }));
vi.mock("@/lib/env", () => mocks.config);

let cookieMethods: CookieMethodsServer;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.config.isSupabaseConfigured = true;
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
  mocks.createServerClient.mockImplementation((_url, _key, options) => {
    cookieMethods = options.cookies;
    return { auth: { getUser: mocks.getUser } };
  });
});

describe("session refresh proxy", () => {
  it("passes refreshed cookies to rendering and to the browser, preserving cache and security headers", async () => {
    mocks.getUser.mockImplementation(async () => {
      await cookieMethods.setAll?.([
        { name: "test-session", value: "refreshed-value", options: { path: "/", httpOnly: true } },
      ], { "cache-control": "private, no-store", pragma: "no-cache", expires: "0" });
      return { data: { user: null }, error: null };
    });
    const request = new NextRequest("https://app.kinloop.dev/");
    const response = await proxy(request);
    expect(request.cookies.get("test-session")?.value).toBe("refreshed-value");
    expect(response.cookies.get("test-session")).toMatchObject({ value: "refreshed-value", httpOnly: true });
    expect(response.headers.get("x-middleware-request-cookie")).toContain("test-session=refreshed-value");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("pragma")).toBe("no-cache");
    expect(response.headers.get("expires")).toBe("0");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow, noarchive");
  });

  it("clears a rejected session in both request and response", async () => {
    mocks.getUser.mockImplementation(async () => {
      await cookieMethods.setAll?.([
        { name: "test-session", value: "", options: { path: "/", maxAge: 0 } },
      ], { "cache-control": "private, no-store" });
      return { data: { user: null }, error: { message: "Invalid refresh token" } };
    });
    const request = new NextRequest("https://app.kinloop.dev/", { headers: { cookie: "test-session=old-value" } });
    const response = await proxy(request);
    expect(request.cookies.get("test-session")?.value).toBe("");
    expect(response.cookies.get("test-session")).toMatchObject({ value: "", maxAge: 0 });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("applies security headers in demo mode without contacting Supabase", async () => {
    mocks.config.isSupabaseConfigured = false;
    const response = await proxy(new NextRequest("https://app.kinloop.dev/"));
    expect(mocks.createServerClient).not.toHaveBeenCalled();
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });
});
