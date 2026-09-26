import { IdentityProviderType } from "@zitadel/proto/zitadel/settings/v2/login_settings_pb";

export type IdpBrand =
  "github" | "google" | "apple" | "microsoft" | "gitlab" | "yandex" | "telegram" | "vk" | "zitadel" | "generic";

/**
 * Built-in providers are recognised by type; generic OAuth/OIDC/JWT providers
 * (Yandex ID, Telegram through the HolyCode bridge, VK ID) by their configured name.
 */
export function detectIdpBrand(type: IdentityProviderType, name?: string): IdpBrand {
  switch (type) {
    case IdentityProviderType.GITHUB:
    case IdentityProviderType.GITHUB_ES:
      return "github";
    case IdentityProviderType.GOOGLE:
      return "google";
    case IdentityProviderType.APPLE:
      return "apple";
    case IdentityProviderType.AZURE_AD:
      return "microsoft";
    case IdentityProviderType.GITLAB:
    case IdentityProviderType.GITLAB_SELF_HOSTED:
      return "gitlab";
    case IdentityProviderType.ZITADEL:
      return "zitadel";
    default:
      break;
  }
  const n = (name ?? "").toLowerCase();
  if (n.includes("yandex") || n.includes("яндекс")) return "yandex";
  if (n.includes("telegram") || n.includes("телеграм")) return "telegram";
  if (n === "vk" || n.includes("vk id") || n.includes("vkontakte") || n.includes("вконтакте")) return "vk";
  if (n.includes("github")) return "github";
  if (n.includes("google")) return "google";
  if (n.includes("apple")) return "apple";
  if (n.includes("microsoft") || n.includes("entra") || n.includes("azure")) return "microsoft";
  return "generic";
}

export function GitHubIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" className={className} aria-hidden="true">
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M512 0C229.12 0 0 229.12 0 512c0 226.56 146.56 417.92 350.08 485.76 25.6 4.48 35.2-10.88 35.2-24.32 0-12.16-.64-52.48-.64-95.36-128.64 23.68-161.92-31.36-172.16-60.16-5.76-14.72-30.72-60.16-52.48-72.32-17.92-9.6-43.52-33.28-.64-33.92 40.32-.64 69.12 37.12 78.72 52.48 46.08 77.44 119.68 55.68 149.12 42.24 4.48-33.28 17.92-55.68 32.64-68.48-113.92-12.8-232.96-56.96-232.96-252.8 0-55.68 19.84-101.76 52.48-137.6-5.12-12.8-23.04-65.28 5.12-135.68 0 0 42.88-13.44 140.8 52.48 40.96-11.52 84.48-17.28 128-17.28 43.52 0 87.04 5.76 128 17.28 97.92-66.56 140.8-52.48 140.8-52.48 28.16 70.4 10.24 122.88 5.12 135.68 32.64 35.84 52.48 81.28 52.48 137.6 0 196.48-119.68 240-233.6 252.8 18.56 16 34.56 46.72 34.56 94.72 0 68.48-.64 123.52-.64 140.8 0 13.44 9.6 29.44 35.2 24.32C877.44 929.92 1024 737.92 1024 512 1024 229.12 794.88 0 512 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function GoogleIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="30 26 92 96" className={className} aria-hidden="true">
      <path
        d="M120 76.1c0-3.1-.3-6.3-.8-9.3H75.9v17.7h24.8c-1 5.7-4.3 10.7-9.2 13.9l14.8 11.5C115 101.8 120 90 120 76.1z"
        fill="#4280ef"
      />
      <path
        d="M75.9 120.9c12.4 0 22.8-4.1 30.4-11.1L91.5 98.4c-4.1 2.8-9.4 4.4-15.6 4.4-12 0-22.1-8.1-25.8-18.9L34.9 95.6c7.8 15.5 23.6 25.3 41 25.3z"
        fill="#34a353"
      />
      <path d="M50.1 83.8c-1.9-5.7-1.9-11.9 0-17.6L34.9 54.4c-6.5 13-6.5 28.3 0 41.2l15.2-11.8z" fill="#f6b704" />
      <path
        d="M75.9 47.3c6.5-.1 12.9 2.4 17.6 6.9L106.6 41c-8.3-7.8-19.3-12-30.7-11.9-17.4 0-33.2 9.8-41 25.3l15.2 11.8c3.7-10.9 13.8-18.9 25.8-18.9z"
        fill="#e54335"
      />
    </svg>
  );
}

export function AppleIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 170 170" fill="currentColor" className={className} aria-hidden="true">
      <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.197-2.12-9.973-3.17-14.34-3.17-4.58 0-9.492 1.05-14.746 3.17-5.262 2.13-9.501 3.24-12.742 3.35-4.929.21-9.842-1.96-14.746-6.52-3.13-2.73-7.045-7.41-11.735-14.04-5.032-7.08-9.169-15.29-12.41-24.65-3.471-10.11-5.211-19.9-5.211-29.378 0-10.857 2.346-20.221 7.045-28.068 3.693-6.303 8.606-11.275 14.755-14.925s12.793-5.51 19.948-5.629c3.915 0 9.049 1.211 15.429 3.591 6.362 2.388 10.447 3.599 12.238 3.599 1.339 0 5.877-1.416 13.57-4.239 7.275-2.618 13.415-3.702 18.445-3.275 13.63 1.1 23.87 6.473 30.68 16.153-12.19 7.386-18.22 17.731-18.1 31.002.11 10.337 3.86 18.939 11.23 25.769 3.34 3.17 7.07 5.62 11.22 7.36-.9 2.61-1.85 5.11-2.86 7.51zM119.11 7.24c0 8.102-2.96 15.667-8.86 22.669-7.12 8.324-15.732 13.134-25.071 12.375a25.222 25.222 0 0 1-.188-3.07c0-7.778 3.386-16.102 9.399-22.908 3.002-3.446 6.82-6.311 11.45-8.597 4.62-2.252 8.99-3.497 13.1-3.71.12 1.083.17 2.166.17 3.24z" />
    </svg>
  );
}

export function MicrosoftIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 21 21" className={className} aria-hidden="true">
      <path fill="#f25022" d="M1 1H10V10H1z" />
      <path fill="#00a4ef" d="M1 11H10V20H1z" />
      <path fill="#7fba00" d="M11 1H20V10H11z" />
      <path fill="#ffb900" d="M11 11H20V20H11z" />
    </svg>
  );
}

export function GitlabIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25 24" fill="none" className={className} aria-hidden="true">
      <path
        fill="#e24329"
        d="m24.507 9.5-.034-.09L21.082.562a.896.896 0 0 0-1.694.091l-2.29 7.01H7.825L5.535.653a.898.898 0 0 0-1.694-.09L.451 9.411.416 9.5a6.297 6.297 0 0 0 2.09 7.278l.012.01.03.022 5.16 3.867 2.56 1.935 1.554 1.176a1.051 1.051 0 0 0 1.268 0l1.555-1.176 2.56-1.935 5.197-3.89.014-.01A6.297 6.297 0 0 0 24.507 9.5z"
      />
      <path
        fill="#fc6d26"
        d="m24.507 9.5-.034-.09a11.44 11.44 0 0 0-4.56 2.051l-7.447 5.632 4.742 3.584 5.197-3.89.014-.01A6.297 6.297 0 0 0 24.507 9.5z"
      />
      <path
        fill="#fca326"
        d="m7.707 20.677 2.56 1.935 1.555 1.176a1.051 1.051 0 0 0 1.268 0l1.555-1.176 2.56-1.935-4.743-3.584-4.755 3.584z"
      />
      <path
        fill="#fc6d26"
        d="M5.01 11.461a11.43 11.43 0 0 0-4.56-2.05L.416 9.5a6.297 6.297 0 0 0 2.09 7.278l.012.01.03.022 5.16 3.867 4.745-3.584-7.444-5.632z"
      />
    </svg>
  );
}

/** Yandex ID: red disc with a white "Я". */
export function YandexIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="12" fill="#fc3f1d" />
      <path
        fill="#fff"
        d="M13.32 18.5V6.75h-1.2c-2.34 0-3.64 1.2-3.64 2.98 0 2 .85 2.94 2.6 4.12l1.45.97-4.16 3.68H6.5l3.74-3.33C8.09 13.66 6.9 12.3 6.9 9.86c0-3.05 2.12-5.11 5.2-5.11h3.43V18.5z"
      />
    </svg>
  );
}

/** Telegram paper plane. */
export function TelegramIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="12" fill="#2AABEE" />
      <path
        fill="#fff"
        d="M5.4 11.7c3.6-1.6 6-2.6 7.2-3.1 3.4-1.4 4.1-1.7 4.6-1.7.1 0 .3 0 .5.2.1.1.2.3.2.4v.6c-.2 2-1 6.7-1.4 8.9-.2.9-.5 1.2-.9 1.3-.7.1-1.3-.5-2-.9-1.1-.7-1.7-1.2-2.8-1.9-1.2-.8-.4-1.3.3-2 .2-.2 3.3-3 3.4-3.3 0 0 0-.2-.1-.2-.1-.1-.2 0-.3 0-.1 0-2 1.3-5.7 3.8-.5.4-1 .6-1.5.5-.5 0-1.4-.3-2.1-.5-.9-.3-1.5-.4-1.5-.9.1-.3.4-.5 1.1-.8z"
      />
    </svg>
  );
}

export function VkIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect width="24" height="24" rx="6" fill="#0077ff" />
      <path
        fill="#fff"
        d="M13 17.2c-5.6 0-8.8-3.8-8.9-10.2h2.8c.1 4.7 2.2 6.7 3.8 7.1V7h2.6v4.1c1.6-.2 3.3-2 3.9-4.1H20c-.4 2.5-2.3 4.3-3.6 5.1 1.3.6 3.4 2.2 4.2 5.1h-2.9c-.6-1.9-2.2-3.4-4.3-3.6v3.6z"
      />
    </svg>
  );
}

export function IdpIcon({ brand, name, className = "h-5 w-5" }: { brand: IdpBrand; name?: string; className?: string }) {
  switch (brand) {
    case "github":
      return <GitHubIcon className={className} />;
    case "google":
      return <GoogleIcon className={className} />;
    case "apple":
      return <AppleIcon className={className} />;
    case "microsoft":
      return <MicrosoftIcon className={className} />;
    case "gitlab":
      return <GitlabIcon className={className} />;
    case "yandex":
      return <YandexIcon className={className} />;
    case "telegram":
      return <TelegramIcon className={className} />;
    case "vk":
      return <VkIcon className={className} />;
    default:
      return (
        <span className="bg-hc-soft text-hc-p400 flex h-6 w-6 items-center justify-center rounded-full text-[13px] font-bold uppercase">
          {(name ?? "?").trim().charAt(0) || "?"}
        </span>
      );
  }
}
