"use client";

import { clsx } from "clsx";
import { Loader2Icon } from "lucide-react";
import { ButtonHTMLAttributes, DetailedHTMLProps, forwardRef } from "react";
import { useFormStatus } from "react-dom";

export type SignInWithIdentityProviderProps = DetailedHTMLProps<
  ButtonHTMLAttributes<HTMLButtonElement>,
  HTMLButtonElement
> & {
  name?: string;
  e2e?: string;
  /**
   * "icon" — square 44px tile for the "or sign in with" row (default),
   * "list" — full-width button with the provider name.
   */
  layout?: "icon" | "list";
  /** Dark GitHub-style tile. */
  tone?: "default" | "dark";
};

export const BaseButton = forwardRef<HTMLButtonElement, SignInWithIdentityProviderProps>(function BaseButton(
  { layout = "icon", tone = "default", name, e2e: _e2e, className, children, ...props },
  ref,
) {
  const formStatus = useFormStatus();

  return (
    <button
      {...props}
      type="submit"
      ref={ref}
      disabled={formStatus.pending}
      title={layout === "icon" ? name : undefined}
      aria-label={layout === "icon" ? name : undefined}
      className={clsx(
        "flex h-11 cursor-pointer items-center rounded-xl border text-[15px] font-semibold transition-all duration-200 outline-none",
        "focus-visible:border-hc-p500 focus-visible:ring-hc-ring focus-visible:ring-[3px] disabled:cursor-default disabled:opacity-60",
        layout === "icon" ? "flex-1 justify-center px-2" : "w-full justify-start gap-3 px-3.5",
        tone === "dark"
          ? "border-[#24292f] bg-[#24292f] text-white hover:border-[#3a4048] hover:bg-[#2f353d]"
          : "border-hc-input-border bg-hc-input text-hc-text hover:border-hc-p500",
        className,
      )}
    >
      {formStatus.pending ? (
        <Loader2Icon className="h-5 w-5 animate-spin" aria-hidden="true" />
      ) : (
        <>
          {children}
          {layout === "list" && <span className="truncate">{name}</span>}
        </>
      )}
    </button>
  );
});
