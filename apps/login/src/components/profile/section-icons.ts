import { ProfileSection } from "@/lib/profile";
import {
  AdjustmentsHorizontalIcon,
  BuildingOffice2Icon,
  HomeIcon,
  IdentificationIcon,
  KeyIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/solid";
import { ComponentType } from "react";

/** One icon per profile section: the sidebar, the phone's bottom bar and "More in Profile". */
export const SECTION_ICONS: Record<ProfileSection, ComponentType<{ className?: string }>> = {
  home: HomeIcon,
  data: IdentificationIcon,
  security: ShieldCheckIcon,
  keys: KeyIcon,
  orgs: BuildingOffice2Icon,
  settings: AdjustmentsHorizontalIcon,
};
