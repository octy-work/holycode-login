"use client";

import { Alert } from "@/components/alert";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button, ButtonVariants } from "./button";

/** The code travels in the fragment (#FQ6US6): browsers never send it to the server. */
export function codeFromHash(hash: string): string {
  let raw = hash.replace(/^#/, "");
  try {
    raw = decodeURIComponent(raw);
  } catch {
    // keep it as is
  }
  return raw
    .replace(/[^0-9A-Za-z]/g, "")
    .slice(0, 12)
    .toUpperCase();
}

async function writeClipboard(text: string, withFallback: boolean): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    if (!withFallback) return false;
    // No Clipboard API or no permission: the old way, allowed inside a click.
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

/**
 * "Copy code" from the e-mail: mail clients run no scripts, so the button in the letter
 * opens this page. The code is copied on open where the browser allows it (Chrome),
 * otherwise by the button.
 */
export function CopyCode() {
  const t = useTranslations("verify");
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const found = codeFromHash(window.location.hash);
    setCode(found);
    if (found) {
      writeClipboard(found, false).then(setCopied);
    }
  }, []);

  if (code === null) {
    return null;
  }

  if (!code) {
    return (
      <div data-testid="copy-code-missing">
        <Alert>{t("copy.missing")}</Alert>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex gap-2 select-all" data-testid="copy-code-value" aria-label={code}>
        {code.split("").map((ch, i) => (
          <div
            key={i}
            aria-hidden="true"
            className="bg-hc-input border-hc-input-border text-hc-text flex h-[52px] flex-1 items-center justify-center rounded-xl border font-mono text-[22px] font-bold"
          >
            {ch}
          </div>
        ))}
      </div>

      <Button
        type="button"
        variant={ButtonVariants.Primary}
        data-testid="copy-code-button"
        onClick={async () => setCopied(await writeClipboard(code, true))}
      >
        {copied ? `✓ ${t("copy.copiedButton")}` : t("copy.copy")}
      </Button>

      <p className="text-hc-text-2 min-h-[40px] text-center text-[13px]" data-testid="copy-code-status" aria-live="polite">
        {copied ? t("copy.copied") : ""}
      </p>
    </div>
  );
}
