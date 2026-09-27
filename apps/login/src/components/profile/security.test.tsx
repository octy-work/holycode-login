import { createDaenerysClient, DaenerysClient, DaenerysResult, normalizeActivity, normalizeSessions } from "@/lib/daenerys";
import { summarizeAuthMethods } from "@/lib/profile";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { SecuritySection } from "./security";
import { ProfileView } from "./types";
import { DAENERYS_TIMEOUT_MS, DaenerysState, useDaenerysResource, withDeadline } from "./use-daenerys";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${Object.values(values).join(",")}` : key,
  useLocale: () => "ru",
}));

vi.mock("@/lib/server/profile", () => ({
  beginFlow: vi.fn(),
  beginProviderLink: vi.fn(),
  deletePasskey: vi.fn(),
  disableTotp: vi.fn(),
  sendPasswordResetToMe: vi.fn(),
  signOutEverywhere: vi.fn(),
}));

/**
 * The exact shape of what production Daenerys answered on 27.09.2026 (shortened):
 * sessions before the user agent was recorded come with device
 * {browser:"",os:"",kind:"unknown"} and an empty ip, an access key is in the same
 * list with api_key set, and the list carries total/scope.
 */
const PROD_PAYLOAD = {
  sessions: {
    ok: true,
    sessions: [
      {
        session_id: "sess_b4982710811b99ad94d83db8",
        current: false,
        source: "auth.oidc",
        issued_at: "2026-09-27T18:47:55.785Z",
        last_seen_at: "2026-09-27T19:12:53.245Z",
        expires_at: "2026-10-27T18:47:56.000Z",
        device: { browser: "", os: "", kind: "unknown" },
        ip: "172.20.0.19",
        city: "",
        api_key: null,
      },
      {
        session_id: "sess_9a1bdde8a3512d86730919de",
        current: true,
        source: "auth.oidc",
        issued_at: "2026-09-27T18:47:56.756Z",
        last_seen_at: "2026-09-27T19:11:22.031Z",
        expires_at: "2026-10-27T18:47:56.000Z",
        device: { browser: "Chrome 152", os: "macOS", kind: "desktop" },
        ip: "212.58.102.61",
        city: "",
        api_key: null,
      },
      {
        session_id: "sess_c25ef2b1e5db18d436476e35",
        current: false,
        source: "auth.oidc",
        issued_at: "2026-09-27T16:58:07.241Z",
        last_seen_at: "2026-09-27T17:17:03.405Z",
        expires_at: "2026-10-27T16:58:07.000Z",
        device: { browser: "", os: "", kind: "unknown" },
        ip: "",
        city: "",
        api_key: null,
      },
      {
        session_id: "sess_2cd928cc19a36bf58b917fb6",
        current: false,
        source: "api.login",
        issued_at: "2026-09-27T15:43:11.596Z",
        last_seen_at: "2026-09-27T16:43:02.298Z",
        expires_at: "2026-10-27T15:43:11.000Z",
        device: { browser: "", os: "", kind: "unknown" },
        ip: "",
        city: "",
        api_key: null,
      },
      {
        session_id: "pat_d04c19b462aec0ed",
        current: false,
        source: "auth.api_key",
        issued_at: "2026-09-25T00:38:47.686Z",
        last_seen_at: "2026-09-27T19:12:01.969Z",
        expires_at: "2026-12-24T00:38:47.686Z",
        device: { browser: "curl", os: "", kind: "cli" },
        ip: "212.58.102.61",
        city: "",
        api_key: {
          key_id: "pat_d04c19b462aec0ed",
          name: "claude-code automation",
          token_preview: "dny_pat_57vU…e47b",
          scopes: ["read", "write"],
        },
      },
    ],
    total: 25,
    scope: "owner",
  },
  activity: {
    ok: true,
    entries: [
      {
        at: "2026-09-27T18:53:11.702Z",
        action: "login",
        detail: "HolyCode ID",
        device: { browser: "Safari 18", os: "macOS", kind: "desktop" },
        ip: "212.58.102.61",
        city: "",
        self: false,
      },
      {
        at: "2026-09-27T18:47:56.761Z",
        action: "login",
        detail: "HolyCode ID",
        device: { browser: "Chrome 152", os: "macOS", kind: "desktop" },
        ip: "212.58.102.61",
        city: "",
        self: true,
      },
    ],
    next_before: "2026-09-27T18:47:55.794Z",
  },
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function prodFetch() {
  const urls: string[] = [];
  const impl = vi.fn(async (url: string) => {
    urls.push(url);
    if (url.includes("/api/auth/sessions")) return json(200, PROD_PAYLOAD.sessions);
    if (url.includes("/api/auth/activity")) return json(200, PROD_PAYLOAD.activity);
    return json(404, { error: "not_found" });
  });
  return { impl, urls };
}

function daenerysReady(fetchImpl: (url: string, init?: RequestInit) => Promise<Response>): DaenerysState {
  return {
    status: "ready",
    reason: null,
    failure: null,
    user: { userId: "u1", name: "Owner", email: "owner@example.test", username: "owner", pendingDeletion: null },
    orgs: [],
    client: createDaenerysClient({ baseUrl: "https://daenerys.test", fetchImpl }),
    signInUrl: "",
    reload: vi.fn(),
  };
}

const view: ProfileView = {
  section: "security",
  prefix: "/me",
  basePath: "/ui/v2/login",
  publicHost: "id.holycode.org",
  user: {
    id: "u1",
    loginName: "owner@example.test",
    username: "owner@example.test",
    handle: "@owner",
    givenName: "Родион",
    familyName: "Отлетов",
    displayName: "Родион",
    fullName: "Родион Отлетов",
    salutation: "Родион",
    email: "owner@example.test",
    emailVerified: true,
    avatarUrl: "",
    preferredLanguage: "",
    organizationId: "org",
  },
  methods: summarizeAuthMethods([1, 3] as never),
  passkeys: [],
  linkedIdps: [],
  availableIdps: [],
  factors: { totp: false, u2f: 0, otpEmail: false, otpSms: false },
  settings: {
    passkeysAllowed: true,
    secondFactors: ["totp"],
    allowExternalIdp: true,
    hidePasswordReset: false,
    allowLocalAuthentication: true,
  },
  recommendations: ["passkey", "secondFactor"],
  theme: null,
  sessionId: "s1",
  daenerysUrl: "",
  links: {
    services: [],
    adminUrl: "https://chat.test/admin",
    mailAdminUrl: "https://chat.test/admin/mail",
    keysUrl: "https://chat.test/keys",
  },
};

describe("Security section with what production Daenerys answers", () => {
  afterEach(cleanup);

  test("normalises the production payload: old sessions without a device, the key entry, the activity page", () => {
    const sessions = normalizeSessions(PROD_PAYLOAD.sessions);
    expect(sessions).toHaveLength(5);
    expect(sessions[0].id).toBe("sess_9a1bdde8a3512d86730919de"); // the current one first
    expect(sessions[0].device).toEqual({ browser: "Chrome 152", os: "macOS", kind: "desktop" });
    expect(sessions.find((s) => s.id === "sess_b4982710811b99ad94d83db8")?.device).toBeNull();
    expect(sessions.find((s) => s.id === "pat_d04c19b462aec0ed")?.apiKey).toEqual({
      keyId: "pat_d04c19b462aec0ed",
      name: "claude-code automation",
      tokenPreview: "dny_pat_57vU…e47b",
      scopes: ["read", "write"],
    });

    const activity = normalizeActivity(PROD_PAYLOAD.activity);
    expect(activity.entries).toHaveLength(2);
    expect(activity.nextBefore).toBe("2026-09-27T18:47:55.794Z");
  });

  test("renders the sessions and the activity from the production payload — no skeleton left behind", async () => {
    const { impl, urls } = prodFetch();
    const { findByTestId, getAllByTestId, queryByText, container } = render(
      <SecuritySection view={view} prefix="/me" daenerys={daenerysReady(impl)} />,
    );

    // The current session, an old one without a device, the access key.
    const current = await findByTestId("session-sess_9a1bdde8a3512d86730919de");
    expect(current).toHaveTextContent("macOS · Chrome 152");
    expect(current).toHaveTextContent("security.session.current");
    const old = await findByTestId("session-sess_b4982710811b99ad94d83db8");
    expect(old).toHaveTextContent("security.session.unknownDevice");
    expect(old).not.toHaveTextContent("unknown ·");
    const key = await findByTestId("session-pat_d04c19b462aec0ed");
    expect(key).toHaveTextContent("security.session.key:claude-code automation");
    expect(key).toHaveTextContent("read, write");

    await waitFor(() => expect(getAllByTestId("activity-entry")).toHaveLength(2));
    expect(getAllByTestId("activity-entry")[0]).toHaveTextContent("security.activity.action.login · HolyCode ID");
    expect(getAllByTestId("activity-entry")[0]).toHaveTextContent("macOS · Safari 18");

    expect(queryByText("security.sessions.note")).not.toBeNull();
    expect(container.querySelectorAll("[aria-busy='true']")).toHaveLength(0);
    expect(urls.filter((u) => u.includes("/api/auth/sessions"))).toHaveLength(1);
    expect(urls.filter((u) => u.includes("/api/auth/activity?limit=50"))).toHaveLength(1);
  });
});

/** A bare consumer of useDaenerysResource: what the hook reports, and nothing else. */
function Probe<T>({
  daenerys,
  load,
  normalize,
}: {
  daenerys: DaenerysState;
  load: (client: DaenerysClient) => Promise<DaenerysResult<unknown>>;
  normalize: (data: unknown) => T;
}) {
  const r = useDaenerysResource(daenerys, load, normalize, { label: "probe" });
  return <output data-testid="probe">{`${r.status}/${r.failure ?? "-"}/${r.message ?? "-"}`}</output>;
}

describe("useDaenerysResource never leaves a block as a skeleton", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test("a normaliser that throws on the answer → unavailable/payload with the error, logged", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { impl } = prodFetch();
    const { getByTestId } = render(
      <Probe
        daenerys={daenerysReady(impl)}
        load={(c) => c.sessions()}
        normalize={() => {
          throw new TypeError("Cannot read properties of null (reading 'toLowerCase')");
        }}
      />,
    );
    await waitFor(() =>
      expect(getByTestId("probe")).toHaveTextContent(
        "unavailable/payload/Cannot read properties of null (reading 'toLowerCase')",
      ),
    );
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("daenerys/probe: could not read the answer"),
      expect.any(TypeError),
    );
  });

  test("a load that rejects → unavailable/error with the message", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { impl } = prodFetch();
    const { getByTestId } = render(
      <Probe daenerys={daenerysReady(impl)} load={() => Promise.reject(new Error("kaput"))} normalize={(d) => d} />,
    );
    await waitFor(() => expect(getByTestId("probe")).toHaveTextContent("unavailable/error/kaput"));
  });

  test("an answer that never comes → unavailable/timeout after the deadline, logged", async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { impl } = prodFetch();
    const { getByTestId } = render(
      <Probe daenerys={daenerysReady(impl)} load={() => new Promise(() => undefined)} normalize={(d) => d} />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(getByTestId("probe")).toHaveTextContent("loading/-/-");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DAENERYS_TIMEOUT_MS + 100);
    });
    expect(getByTestId("probe")).toHaveTextContent("unavailable/timeout/no answer within 20 s");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("daenerys/probe: unavailable (error: no answer within 20 s"));
  });

  test("the section shows the reason and a retry instead of the skeleton", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes("/api/auth/sessions")) throw new TypeError("Failed to fetch");
      if (url.includes("/api/auth/activity")) return json(200, PROD_PAYLOAD.activity);
      return json(404, {});
    });
    const { findByTestId, findAllByTestId, container } = render(
      <SecuritySection view={view} prefix="/me" daenerys={daenerysReady(fetchImpl)} />,
    );
    const notice = await findByTestId("daenerys-unavailable");
    expect(notice.getAttribute("data-failure")).toBe("network");
    expect(await findAllByTestId("activity-entry")).toHaveLength(2);
    expect(container.querySelectorAll("[aria-busy='true']")).toHaveLength(0);
  });
});

describe("withDeadline", () => {
  afterEach(() => vi.useRealTimers());

  test("passes an answer through and turns a rejection into a failure", async () => {
    expect(await withDeadline(async () => ({ ok: true, status: 200, data: 1 }), 50)).toEqual({
      ok: true,
      status: 200,
      data: 1,
    });
    expect(
      await withDeadline(async () => {
        throw new Error("kaput");
      }, 50),
    ).toMatchObject({ ok: false, failure: "error", message: "kaput" });
  });

  test("gives up after the deadline", async () => {
    vi.useFakeTimers();
    const pending = withDeadline(() => new Promise(() => undefined), 20);
    await vi.advanceTimersByTimeAsync(30);
    expect(await pending).toMatchObject({ ok: false, failure: "timeout" });
  });
});
