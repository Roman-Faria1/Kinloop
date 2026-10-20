import type { CookieMethodsServer } from "@supabase/ssr";
import { beforeEach, vi } from "vitest";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const mocks = vi.hoisted(() => ({
  getAll: vi.fn(),
  set: vi.fn(),
  createServerClient: vi.fn(),
  config: {
    env: { NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-key" },
    isSupabaseConfigured: true,
  },
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: mocks.getAll, set: mocks.set }) }));
vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.createServerClient }));
vi.mock("@/lib/env", () => mocks.config);

let cookieMethods: CookieMethodsServer;
const cookie = { name: "test-session", value: "test-value", options: { path: "/", httpOnly: true } };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.config.isSupabaseConfigured = true;
  mocks.getAll.mockReturnValue([]);
  mocks.set.mockReset();
  mocks.createServerClient.mockImplementation((_url, _key, options) => {
    cookieMethods = options.cookies;
    return { auth: { getUser: async () => {
      await cookieMethods.setAll?.([cookie], {});
      return { data: { user: null }, error: null };
    } } };
  });
});

describe("Supabase server cookies", () => {
  it("renders through read-only Server Component cookies during an auth refresh", async () => {
    mocks.set.mockImplementation(() => {
      throw new Error("Cookies can only be modified in a Server Action or Route Handler. Read more: https://nextjs.org/docs");
    });
    const client = await createSupabaseServerClient();
    await expect(client?.auth.getUser()).resolves.toMatchObject({ data: { user: null } });
  });

  it("still persists cookies from writable Route Handlers", async () => {
    const client = await createSupabaseServerClient();
    await client?.auth.getUser();
    expect(mocks.set).toHaveBeenCalledWith(cookie.name, cookie.value, cookie.options);
  });

  it("does not hide unexpected cookie persistence failures", async () => {
    mocks.set.mockImplementation(() => { throw new Error("Unexpected storage failure"); });
    const client = await createSupabaseServerClient();
    await expect(client?.auth.getUser()).rejects.toThrow("Unexpected storage failure");
  });

  it("does not initialize a client when Supabase is unconfigured", async () => {
    mocks.config.isSupabaseConfigured = false;
    await expect(createSupabaseServerClient()).resolves.toBeNull();
    expect(mocks.createServerClient).not.toHaveBeenCalled();
  });
});
