"use client";

import {
  buildSilentSignInUrl,
  createDaenerysClient,
  daenerysApiUrl,
  DaenerysClient,
  DaenerysFailure,
  DaenerysResult,
  DaenerysUser,
  normalizeAccounts,
  normalizeUser,
  Organization,
  planSilentSignIn,
  profileReturnTo,
  readSsoMarker,
  stripSsoMarker,
} from "@/lib/daenerys";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type DaenerysStatus = "loading" | "ready" | "unauthorized" | "unavailable";

/** Why a block (or the session) is not there: shown next to "unavailable" and logged. */
export type DaenerysBlockFailure = "timeout" | "payload" | "network" | "error";

export type DaenerysState = {
  status: DaenerysStatus;
  reason: DaenerysFailure | null;
  failure: DaenerysBlockFailure | null;
  message?: string;
  user: DaenerysUser | null;
  orgs: Organization[];
  client: DaenerysClient;
  /** A manual sign-in into the platform (regular SSO through the ID), back to the profile. */
  signInUrl: string;
  reload: () => void;
};

/** A Daenerys answer that has not arrived by then counts as unavailable — no block stays a skeleton forever. */
export const DAENERYS_TIMEOUT_MS = 20_000;

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Runs one Daenerys call with a deadline: resolves to the answer, or to a
 * synthetic failure when it took longer than the deadline or threw. Never
 * rejects, so a caller's state machine always reaches an end state.
 */
export function withDeadline<T>(
  run: () => Promise<DaenerysResult<T>>,
  timeoutMs = DAENERYS_TIMEOUT_MS,
): Promise<DaenerysResult<T> | { ok: false; status: 0; reason: "error"; failure: DaenerysBlockFailure; message: string }> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({
        ok: false,
        status: 0,
        reason: "error",
        failure: "timeout",
        message: `no answer within ${Math.round(timeoutMs / 1000)} s`,
      });
    }, timeoutMs);
    Promise.resolve()
      .then(run)
      .then(
        (result) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(result);
        },
        (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve({ ok: false, status: 0, reason: "error", failure: "error", message: describeError(error) });
        },
      );
  });
}

function failureOf(result: { ok: false; reason: DaenerysFailure; failure?: DaenerysBlockFailure }): DaenerysBlockFailure {
  if (result.failure) return result.failure;
  return result.reason === "network" ? "network" : "error";
}

/**
 * The person's Daenerys session, once per page: GET /api/auth/me with the
 * .holycode.org cookie (renewed through the refresh cookie when expired). With
 * no cookie at all the page goes to Daenerys for one silent sign-in
 * (prompt=none) and comes back; if that did not yield a session either, the
 * Daenerys blocks show as unavailable and the rest of the profile works.
 */
export function useDaenerys(baseUrl: string): DaenerysState {
  const client = useMemo(() => createDaenerysClient({ baseUrl: daenerysApiUrl(baseUrl) }), [baseUrl]);
  const [status, setStatus] = useState<DaenerysStatus>("loading");
  const [reason, setReason] = useState<DaenerysFailure | null>(null);
  const [failure, setFailure] = useState<DaenerysBlockFailure | null>(null);
  const [message, setMessage] = useState<string | undefined>(undefined);
  const [user, setUser] = useState<DaenerysUser | null>(null);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [tick, setTick] = useState(0);
  const [signInUrl, setSignInUrl] = useState("");
  const leaving = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const marker = readSsoMarker(window.location.href);
    if (marker.sso || marker.error) {
      try {
        window.history.replaceState(window.history.state, "", stripSsoMarker(window.location.href));
      } catch {
        // the markers stay; nothing breaks
      }
    }
    const returnTo = profileReturnTo(window.location);
    const manual = new URL(`${daenerysApiUrl(baseUrl)}/api/auth/oidc/start`);
    manual.searchParams.set("return_to", returnTo);
    setSignInUrl(manual.toString());

    setStatus("loading");
    setFailure(null);
    setMessage(undefined);
    withDeadline(() => client.me()).then((result) => {
      if (cancelled || leaving.current) return;
      if (result.ok) {
        let nextUser: DaenerysUser | null;
        let nextOrgs: Organization[];
        try {
          nextUser = normalizeUser(result.data);
          nextOrgs = normalizeAccounts(result.data);
        } catch (error) {
          console.error("[profile] daenerys/me: could not read the answer", error);
          setFailure("payload");
          setMessage(describeError(error));
          setStatus("unavailable");
          return;
        }
        setUser(nextUser);
        setOrgs(nextOrgs);
        setReason(null);
        setStatus("ready");
        return;
      }
      setReason(result.reason);
      if (result.reason === "unauthorized") {
        let tabStorage: Storage | null;
        try {
          tabStorage = window.sessionStorage;
        } catch {
          tabStorage = null;
        }
        if (planSilentSignIn({ reason: result.reason, marker, tabStorage }) === "go") {
          leaving.current = true;
          window.location.assign(buildSilentSignInUrl(baseUrl, returnTo));
          return;
        }
        console.warn("[profile] daenerys/me: no session in the services (401)");
        setStatus("unauthorized");
        return;
      }
      const why = failureOf(result);
      console.warn(
        `[profile] daenerys/me: unavailable (${why}${result.message ? `: ${result.message}` : ""}, HTTP ${result.status})`,
      );
      setFailure(why);
      setMessage(result.message);
      setStatus("unavailable");
    });
    return () => {
      cancelled = true;
    };
  }, [client, baseUrl, tick]);

  const reload = useCallback(() => setTick((n) => n + 1), []);

  return { status, reason, failure, message, user, orgs, client, signInUrl, reload };
}

export type ResourceStatus = "idle" | "loading" | "ready" | "missing" | "unauthorized" | "unavailable";

export type Resource<T> = {
  status: ResourceStatus;
  data: T | null;
  failure: DaenerysBlockFailure | null;
  message?: string;
  reload: () => void;
};

/**
 * One Daenerys block (sessions, activity, keys): loaded when the session is
 * ready, with its own unavailable states — `missing` when the route does not
 * exist yet (404/405/501). Whatever goes wrong — an answer that never comes, a
 * rejected promise, an answer the normaliser cannot read — ends in
 * `unavailable` with the reason (and a console line), never in a skeleton.
 */
export function useDaenerysResource<T>(
  daenerys: DaenerysState,
  load: (client: DaenerysClient) => Promise<DaenerysResult<unknown>>,
  normalize: (data: unknown) => T,
  options: { enabled?: boolean; label?: string } = {},
): Resource<T> {
  const { enabled = true, label = "block" } = options;
  const [status, setStatus] = useState<ResourceStatus>("idle");
  const [data, setData] = useState<T | null>(null);
  const [failure, setFailure] = useState<DaenerysBlockFailure | null>(null);
  const [message, setMessage] = useState<string | undefined>(undefined);
  const [tick, setTick] = useState(0);
  const loadRef = useRef(load);
  const normalizeRef = useRef(normalize);
  loadRef.current = load;
  normalizeRef.current = normalize;

  useEffect(() => {
    if (!enabled) return;
    if (daenerys.status === "loading") {
      setStatus("loading");
      return;
    }
    if (daenerys.status === "unauthorized") {
      setStatus("unauthorized");
      return;
    }
    if (daenerys.status === "unavailable") {
      setFailure(daenerys.failure);
      setMessage(daenerys.message);
      setStatus("unavailable");
      return;
    }
    let cancelled = false;
    setStatus("loading");
    setFailure(null);
    setMessage(undefined);
    withDeadline(() => loadRef.current(daenerys.client)).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        let normalized: T;
        try {
          normalized = normalizeRef.current(result.data);
        } catch (error) {
          console.error(`[profile] daenerys/${label}: could not read the answer`, error);
          setFailure("payload");
          setMessage(describeError(error));
          setStatus("unavailable");
          return;
        }
        setData(normalized);
        setStatus("ready");
        return;
      }
      const next: ResourceStatus =
        result.reason === "missing" ? "missing" : result.reason === "unauthorized" ? "unauthorized" : "unavailable";
      const why = failureOf(result);
      console.warn(
        `[profile] daenerys/${label}: ${next} (${result.reason}${result.message ? `: ${result.message}` : ""}, HTTP ${result.status})`,
      );
      setFailure(next === "unavailable" ? why : null);
      setMessage(result.message);
      setStatus(next);
    });
    return () => {
      cancelled = true;
    };
  }, [daenerys.status, daenerys.client, daenerys.failure, daenerys.message, enabled, tick, label]);

  const reload = useCallback(() => setTick((n) => n + 1), []);

  return { status, data, failure, message, reload };
}
