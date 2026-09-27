const BASE_DIRECTIVES: Record<string, string[]> = {
  "default-src": ["'self'"],
  "script-src": ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
  "connect-src": ["'self'"],
  "style-src": ["'self'", "'unsafe-inline'"],
  "font-src": ["'self'"],
  "img-src": ["'self'"],
  "frame-ancestors": ["'none'"],
  "object-src": ["'none'"],
};

export interface CSPOptions {
  serviceUrl?: string;
  iframeOrigins?: string[] | null;
  /** Extra origins the page may fetch (HolyCode: the profile talks to Daenerys from the browser). */
  connectOrigins?: string[];
}

/** The Daenerys API origin the profile page fetches, for connect-src. */
export function daenerysConnectOrigin(configured?: string | null): string {
  const value = (configured ?? "").trim() || "https://daenerys-api.holycode.org";
  try {
    return new URL(value).origin;
  } catch {
    return "https://daenerys-api.holycode.org";
  }
}

export function buildCSP(options: CSPOptions = {}): string {
  const directives: Record<string, string[]> = { ...BASE_DIRECTIVES };

  if (options.serviceUrl) {
    directives["img-src"] = [...directives["img-src"], options.serviceUrl];
    directives["font-src"] = [...directives["font-src"], options.serviceUrl];
  }

  if (options.connectOrigins?.length) {
    directives["connect-src"] = [...directives["connect-src"], ...options.connectOrigins];
  }

  if (options.iframeOrigins && options.iframeOrigins.length > 0) {
    directives["frame-ancestors"] = [...options.iframeOrigins];
  }

  return serializeCSP(directives);
}

function serializeCSP(directives: Record<string, string[]>): string {
  return Object.entries(directives)
    .map(([key, values]) => [key, ...values].join(" "))
    .join("; ");
}
