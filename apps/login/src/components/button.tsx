import { ThemeableProps } from "@/lib/themeUtils";
import { clsx } from "clsx";
import { ButtonHTMLAttributes, DetailedHTMLProps, forwardRef } from "react";

export enum ButtonSizes {
  Small = "Small",
  Large = "Large",
}

export enum ButtonVariants {
  Primary = "Primary",
  Secondary = "Secondary",
  Destructive = "Destructive",
  /** Quiet text button (links such as "Back", "Use password"). */
  Ghost = "Ghost",
}

export enum ButtonColors {
  Neutral = "Neutral",
  Primary = "Primary",
  Warn = "Warn",
}

export type ButtonProps = DetailedHTMLProps<ButtonHTMLAttributes<HTMLButtonElement>, HTMLButtonElement> & {
  size?: ButtonSizes;
  variant?: ButtonVariants;
  color?: ButtonColors;
  /** Primary/secondary buttons stretch to the card width by default. */
  fullWidth?: boolean;
} & ThemeableProps;

export const getButtonClasses = (
  size: ButtonSizes,
  variant: ButtonVariants,
  color: ButtonColors,
  roundnessClasses: string = "rounded-xl",
  appearance: string = "",
  fullWidth: boolean = true,
) =>
  clsx(
    "box-border inline-flex items-center justify-center gap-2 transition-all duration-200 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-hc-ring disabled:cursor-not-allowed",
    {
      "h-11 px-4 text-[15px] font-semibold": variant !== ButtonVariants.Ghost,
      "w-full": fullWidth && variant !== ButtonVariants.Ghost,
      "h-9 px-2 text-sm font-medium text-hc-link hover:text-hc-p500 disabled:text-hc-muted":
        variant === ButtonVariants.Ghost,
      // Text colour comes from .hc-btn-primary (--hc-on-accent): dark on a light tenant accent.
      "hc-btn-primary": variant === ButtonVariants.Primary && color !== ButtonColors.Warn,
      "bg-hc-err text-white hover:brightness-110 disabled:opacity-50":
        variant === ButtonVariants.Primary && color === ButtonColors.Warn,
      "border border-hc-border bg-transparent text-hc-text hover:border-hc-p500 hover:bg-hc-soft disabled:opacity-50 disabled:hover:border-hc-border disabled:hover:bg-transparent":
        variant === ButtonVariants.Secondary && color !== ButtonColors.Warn,
      "border border-hc-err-border bg-transparent text-hc-err hover:bg-hc-err-bg disabled:opacity-50":
        (variant === ButtonVariants.Secondary || variant === ButtonVariants.Destructive) && color === ButtonColors.Warn,
      "border border-hc-err-border bg-transparent text-hc-err hover:bg-hc-err-bg":
        variant === ButtonVariants.Destructive && color !== ButtonColors.Warn,
      "min-w-[160px]": size === ButtonSizes.Large,
    },
    variant === ButtonVariants.Ghost ? "rounded-lg" : roundnessClasses,
    appearance,
  );

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      className = "",
      variant = ButtonVariants.Primary,
      size = ButtonSizes.Small,
      color = ButtonColors.Primary,
      roundness,
      fullWidth = true,
      // ThemeableProps are accepted for compatibility but not forwarded to the DOM
      spacing: _spacing,
      padding: _padding,
      typography: _typography,
      ...props
    },
    ref,
  ) => {
    return (
      <button
        type="button"
        ref={ref}
        className={`${getButtonClasses(size, variant, color, roundness ?? "rounded-xl", "", fullWidth)} ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  },
);
