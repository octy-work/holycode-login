import { ColorShade, getColorHash } from "@/helpers/colors";
import { getInitials } from "./avatar";

interface AvatarProps {
  appName: string;
  imageUrl?: string;
  shadow?: boolean;
}

export function AppAvatar({ appName, imageUrl, shadow }: AvatarProps) {
  const credentials = getInitials(appName, appName);
  const color: ColorShade = getColorHash(appName);

  return (
    <div
      className={`pointer-events-none flex h-[100px] w-[100px] cursor-default items-center justify-center rounded-full text-white ${
        shadow ? "shadow" : ""
      }`}
      style={{ backgroundImage: `linear-gradient(135deg, ${color[500]}, ${color[700]})` }}
    >
      {imageUrl ? (
        <img height={48} width={48} alt="avatar" className="h-full w-full rounded-full object-cover" src={imageUrl} />
      ) : (
        <span className={`text-3xl uppercase`}>{credentials}</span>
      )}
    </div>
  );
}
