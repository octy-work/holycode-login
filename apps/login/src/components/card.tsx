import { clsx } from "clsx";
import { HTMLAttributes, ReactNode, forwardRef } from "react";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  roundness?: string; // kept for API compatibility with upstream
  padding?: string; // Allow override via props
}

/**
 * HolyCode card: #151525 / #fff, 1px border, radius 20, soft shadow.
 * The upstream env-driven appearance/roundness presets are intentionally not applied —
 * the design is fixed (see THEME_HOLYCODE.md).
 */
export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ children, className = "", roundness, padding, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={clsx(
          "bg-hc-card border-hc-border shadow-hc-card border",
          roundness || "rounded-[18px] sm:rounded-[20px]",
          padding || "px-5 pt-6 pb-5 sm:px-7 sm:pt-7 sm:pb-6",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    );
  },
);
