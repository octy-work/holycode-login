"use client";

import { clsx } from "clsx";
import { ChangeEvent, forwardRef, InputHTMLAttributes, useImperativeHandle, useRef, useState } from "react";

export type CodeInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "size"> & {
  label?: string;
  length?: number;
  error?: string;
  /** "numeric" for OTP/TOTP, "text" for alphanumeric codes (e-mail verification, password reset). */
  mode?: "numeric" | "text";
  value?: string;
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
};

/**
 * Six-cell code input. A single real <input> (autofill, paste and screen readers keep
 * working — one-time-code autofill needs one field) drawn as separate cells; the caret
 * blinks in the active cell.
 */
export const CodeInput = forwardRef<HTMLInputElement, CodeInputProps>(function CodeInput(
  { label, length = 6, error, mode = "numeric", className, onChange, onFocus, onBlur, value, defaultValue, ...props },
  ref,
) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

  const [inner, setInner] = useState<string>(String(defaultValue ?? value ?? ""));
  const [focused, setFocused] = useState(false);

  const current = (value !== undefined ? String(value) : inner).slice(0, length);
  const cells = Array.from({ length }, (_, i) => current[i] ?? "");
  const activeIndex = Math.min(current.length, length - 1);

  return (
    <div className={clsx("flex w-full flex-col", className)}>
      {label && <span className="text-hc-text-2 mb-1.5 text-[12.5px] font-semibold">{label}</span>}
      <div className="relative flex gap-2" onClick={() => inputRef.current?.focus()} data-testid="code-cells">
        {cells.map((ch, i) => {
          const isActive = focused && i === activeIndex;
          return (
            <div
              key={i}
              aria-hidden="true"
              className={clsx(
                "bg-hc-input border-hc-input-border text-hc-text flex h-[52px] flex-1 items-center justify-center rounded-xl border font-mono text-[22px] font-bold transition-all",
                isActive && "border-hc-p500 ring-hc-ring ring-[3px]",
                error && "border-hc-err",
              )}
            >
              {ch ? (
                <span className="uppercase">{ch}</span>
              ) : isActive ? (
                <span className="hc-caret bg-hc-text inline-block h-6 w-px" />
              ) : null}
            </div>
          );
        })}
        <input
          {...props}
          ref={inputRef}
          type="text"
          value={value !== undefined ? value : undefined}
          defaultValue={value === undefined ? defaultValue : undefined}
          inputMode={mode === "numeric" ? "numeric" : "text"}
          pattern={mode === "numeric" ? "[0-9]*" : undefined}
          maxLength={length}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          className="absolute inset-0 h-full w-full cursor-text opacity-0"
          onChange={(e) => {
            setInner(e.target.value);
            onChange?.(e);
          }}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
        />
      </div>
      <div className="text-hc-err mt-1 min-h-[18px] text-xs">{error ?? " "}</div>
    </div>
  );
});
