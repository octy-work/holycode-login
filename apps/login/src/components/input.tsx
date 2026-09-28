"use client";

import { CheckCircleIcon, EyeIcon, EyeSlashIcon } from "@heroicons/react/24/solid";
import { clsx } from "clsx";
import { ChangeEvent, DetailedHTMLProps, forwardRef, InputHTMLAttributes, ReactNode, useState } from "react";

export type TextInputProps = DetailedHTMLProps<InputHTMLAttributes<HTMLInputElement>, HTMLInputElement> & {
  label: string;
  suffix?: string;
  placeholder?: string;
  defaultValue?: string;
  error?: string | ReactNode;
  success?: string | ReactNode;
  disabled?: boolean;
  onChange?: (value: ChangeEvent<HTMLInputElement>) => void;
  onBlur?: (value: ChangeEvent<HTMLInputElement>) => void;
  roundness?: string; // kept for API compatibility
  /** Extra classes for the <input> itself (e.g. mono/centered device codes). */
  inputClassName?: string;
  /** Hide the reserved error line below the field. */
  hideErrorLine?: boolean;
  /** Keep the label for screen readers only (the form draws its own label row, e.g. "Password · Forgot?"). */
  hideLabel?: boolean;
};

const styles = (error: boolean, disabled: boolean, hasTrailing: boolean, roundnessClasses: string = "rounded-xl") =>
  clsx(
    "h-11 w-full bg-hc-input text-hc-text text-[15px] px-3.5 border transition-all duration-200 outline-none",
    "placeholder:text-hc-muted/70 focus:ring-[3px] focus:ring-hc-ring",
    hasTrailing && "pr-11",
    error
      ? "border-hc-err hover:border-hc-err focus:border-hc-err focus:ring-hc-err/15"
      : "border-hc-input-border hover:border-hc-p400/60 focus:border-hc-p500",
    disabled && "pointer-events-none cursor-default opacity-60",
    roundnessClasses,
  );

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(
  (
    {
      label,
      placeholder,
      defaultValue,
      suffix,
      required = false,
      error,
      disabled,
      success,
      onChange,
      onBlur,
      roundness,
      inputClassName,
      hideErrorLine,
      hideLabel,
      type,
      className,
      ...props
    },
    ref,
  ) => {
    const [reveal, setReveal] = useState(false);
    const isPassword = type === "password";
    const effectiveType = isPassword && reveal ? "text" : type;

    return (
      <label className={clsx("relative flex w-full flex-col text-left", className)}>
        <span
          className={clsx(
            hideLabel ? "sr-only" : "mb-1.5 text-[12.5px] leading-4 font-semibold",
            error ? "text-hc-err" : "text-hc-text-2",
          )}
        >
          {label}
          {required && " *"}
        </span>
        <span className="relative block">
          <input
            suppressHydrationWarning
            ref={ref}
            type={effectiveType}
            className={clsx(styles(!!error, !!disabled, isPassword || !!suffix, roundness ?? "rounded-xl"), inputClassName)}
            defaultValue={defaultValue}
            required={required}
            disabled={disabled}
            placeholder={placeholder}
            autoComplete={props.autoComplete ?? "off"}
            onChange={(e) => onChange && onChange(e)}
            onBlur={(e) => onBlur && onBlur(e)}
            {...props}
          />

          {suffix && !isPassword && (
            <span className="text-hc-muted pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-sm">
              @{suffix}
            </span>
          )}

          {isPassword && (
            <button
              type="button"
              tabIndex={-1}
              aria-label={reveal ? "Hide password" : "Show password"}
              onClick={() => setReveal((v) => !v)}
              className="text-hc-muted hover:text-hc-text absolute top-1/2 right-2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg transition-colors"
            >
              {reveal ? <EyeSlashIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
            </button>
          )}
        </span>

        {!hideErrorLine && (
          <div className="text-hc-err mt-1 flex min-h-[18px] flex-row items-center text-xs leading-4">
            <span>{error ? error : " "}</span>
          </div>
        )}

        {success && (
          <div className="text-hc-ok mt-1 flex flex-row items-center text-sm">
            <CheckCircleIcon className="h-4 w-4" />
            <span className="ml-1">{success}</span>
          </div>
        )}
      </label>
    );
  },
);
