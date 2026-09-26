"use client";

import { ColorShade, getColorHash } from "@/helpers/colors";

interface AvatarProps {
  name: string | null | undefined;
  loginName: string;
  imageUrl?: string;
  size?: "small" | "base" | "large";
  shadow?: boolean;
}

export function getInitials(name: string, loginName: string) {
  if (name) {
    const split = name.split(" ");
    return split[0].charAt(0) + (split[1] ? split[1].charAt(0) : "");
  }

  const username = loginName.split("@")[0];
  let separator = "_";
  if (username.includes("-")) {
    separator = "-";
  }
  if (username.includes(".")) {
    separator = ".";
  }
  const split = username.split(separator);
  return split[0].charAt(0) + (split[1] ? split[1].charAt(0) : "");
}

/** Round avatar with a gradient derived from the login name (same in light and dark). */
export function Avatar({ size = "base", name, loginName, imageUrl, shadow }: AvatarProps) {
  const credentials = getInitials(name ?? loginName, loginName);
  const color: ColorShade = getColorHash(loginName);

  return (
    <div
      className={`pointer-events-none flex flex-shrink-0 cursor-default items-center justify-center rounded-full font-bold text-white ${
        shadow ? "shadow" : ""
      } ${size === "large" ? "h-20 w-20 text-xl" : size === "small" ? "h-8 w-8 text-[12px]" : "h-10 w-10 text-[14px]"}`}
      style={{ backgroundImage: `linear-gradient(135deg, ${color[500]}, ${color[700]})` }}
    >
      {imageUrl ? (
        <img height={48} width={48} alt="avatar" className="h-full w-full rounded-full object-cover" src={imageUrl} />
      ) : (
        <span className="uppercase">{credentials}</span>
      )}
    </div>
  );
}
