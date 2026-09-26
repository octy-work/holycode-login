"use client";

import { setLanguageCookie } from "@/lib/cookies";
import { Lang } from "@/lib/i18n";
import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from "@headlessui/react";
import { CheckIcon, ChevronDownIcon, GlobeAltIcon } from "@heroicons/react/24/outline";
import clsx from "clsx";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/**
 * Up to three languages: an inline "🌐 RU · EN" toggle (the design).
 * More: a compact dropdown.
 */
export function LanguageSwitcher({ languages }: { languages: Lang[] }) {
  const currentLocale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [selected, setSelected] = useState(languages.find((l) => l.code === currentLocale) || languages[0]);

  const handleChange = async (language: Lang) => {
    if (!language || language.code === selected?.code) return;
    setSelected(language);
    await setLanguageCookie(language.code);
    startTransition(() => router.refresh());
  };

  if (!languages?.length) return null;

  if (languages.length <= 3) {
    return (
      <div
        className={clsx(
          "border-hc-border text-hc-muted inline-flex h-7 items-center gap-1 rounded-lg border px-2 text-xs",
          pending && "opacity-60",
        )}
        role="group"
        aria-label="Language"
        data-testid="language-switcher"
      >
        <GlobeAltIcon className="h-3.5 w-3.5" aria-hidden="true" />
        {languages.map((lang, i) => (
          <span key={lang.code} className="inline-flex items-center gap-1">
            {i > 0 && <span aria-hidden="true">·</span>}
            <button
              type="button"
              lang={lang.code}
              title={lang.name}
              aria-pressed={lang.code === selected?.code}
              onClick={() => handleChange(lang)}
              className={clsx(
                "rounded px-0.5 uppercase transition-colors",
                lang.code === selected?.code ? "text-hc-text font-semibold" : "hover:text-hc-text",
              )}
            >
              {lang.code}
            </button>
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="w-32" data-testid="language-switcher">
      <Listbox value={selected} onChange={handleChange}>
        <ListboxButton
          className={clsx(
            "border-hc-border text-hc-text relative block h-8 w-full rounded-lg border py-1 pr-7 pl-2.5 text-left text-xs",
            "data-[focus]:ring-hc-ring focus:outline-none data-[focus]:ring-[3px]",
          )}
        >
          {selected.name}
          <ChevronDownIcon className="pointer-events-none absolute top-2 right-2 size-4" aria-hidden="true" />
        </ListboxButton>
        <ListboxOptions
          anchor="bottom"
          transition
          className={clsx(
            "bg-hc-card border-hc-border z-50 w-[var(--button-width)] rounded-xl border p-1 shadow-lg [--anchor-gap:var(--spacing-1)] focus:outline-none",
            "transition duration-100 ease-in data-[leave]:data-[closed]:opacity-0",
          )}
        >
          {languages.map((lang) => (
            <ListboxOption
              key={lang.code}
              value={lang}
              className="group data-[focus]:bg-hc-soft flex cursor-default items-center gap-2 rounded-lg px-2.5 py-1.5 select-none"
            >
              <CheckIcon className="invisible size-4 group-data-[selected]:visible" />
              <div className="text-hc-text text-sm">{lang.name}</div>
            </ListboxOption>
          ))}
        </ListboxOptions>
      </Listbox>
    </div>
  );
}
