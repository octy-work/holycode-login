"use client";

import { buildServiceHref, SERVICE_KEYS, ServiceEntry, ServiceOrg } from "@/lib/services";
import { openServiceInDesktop } from "@/lib/topbar";
import { clsx } from "clsx";
import { useTranslations } from "next-intl";
import { MouseEvent, ReactNode, RefObject, useCallback, useEffect, useId, useRef, useState } from "react";

/**
 * The HolyCode service switcher of the profile: the grid button (nine dots)
 * next to the logo and the menu of services — the same markup as
 * apps/holychat-web/src/switcher/ in the holycode repository, on the fork's
 * `hc-*` tokens (owner's decisions of 28.09.2026).
 *
 * Tiles come from the directory (`services`): the chat, HolyBuild, HolyAgent,
 * the panel (when the server handed it out — owners and admins only), the
 * profile ("you are here"), mail; under a tile `status.text` from the server
 * when there is one. Below: "Organization admin" (owners and admins) and
 * "Theme and language — from your ID profile". A tile is a plain link in the
 * same tab: `<url>?org=<organization>&return_to=<where we are>`.
 *
 * On phones (< 768 px) there is no grid button: the same tiles are in the
 * services sheet of the bottom bar (`mobile-nav.tsx`).
 */

// ---------------------------------------------------------------------------
// Icons — the same solid shapes as the chat's switcher/iconPaths.js (the
// shared filled set of HolyAgent and Daenerys: Iconly Bold, Heroicons solid;
// owner's decision of 28.09.2026 — no emoji, filled icons everywhere)
// ---------------------------------------------------------------------------

const PATHS: Record<string, ReactNode> = {
  chat: (
    <path
      d="M10,20a9.955,9.955,0,0,1-4.92-1.3,2.2,2.2,0,0,0-1.107-.424,1.213,1.213,0,0,0-.383.063l-2.02.6a.754.754,0,0,1-.226.036.62.62,0,0,1-.5-.239.647.647,0,0,1-.094-.578l.67-2.244a1.046,1.046,0,0,0-.07-.9,10.566,10.566,0,0,1-1.35-5A10.158,10.158,0,0,1,2.831,3.032,9.89,9.89,0,0,1,10.02,0a9.865,9.865,0,0,1,7.12,2.994,10.058,10.058,0,0,1,2.1,3.182A9.89,9.89,0,0,1,20,9.985a10.138,10.138,0,0,1-.865,4.172,9.6,9.6,0,0,1-2.275,3.153A10.245,10.245,0,0,1,10,20ZM14.59,8.743a1.282,1.282,0,1,0,1.28,1.282A1.282,1.282,0,0,0,14.59,8.743Zm-4.629,0A1.268,1.268,0,0,0,8.7,10.015,1.28,1.28,0,1,0,9.98,8.743H9.961Zm-4.591,0a1.282,1.282,0,1,0,1.28,1.282A1.283,1.283,0,0,0,5.37,8.743Z"
      transform="translate(2 2)"
    />
  ),
  build: (
    <path
      d="M12 2.5 2.5 7.5 12 12.5l9.5-5L12 2.5Zm-7.3 8.2L2.5 12l9.5 5 9.5-5-2.2-1.3L12 14.5l-7.3-3.8Zm0 4.3L2.5 16.3l9.5 5 9.5-5-2.2-1.3L12 18.8l-7.3-3.8Z"
      fillRule="evenodd"
    />
  ),
  agent: (
    <path
      d="M12 2a1 1 0 0 1 1 1v1.08A6.5 6.5 0 0 1 18.5 10.5V11H19a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-.7A6.5 6.5 0 0 1 12 22a6.5 6.5 0 0 1-6.3-4H5a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h.5v-.5A6.5 6.5 0 0 1 11 4.08V3a1 1 0 0 1 1-1Zm-3 9.25a1.75 1.75 0 1 0 0 3.5 1.75 1.75 0 0 0 0-3.5Zm6 0a1.75 1.75 0 1 0 0 3.5 1.75 1.75 0 0 0 0-3.5Z"
      fillRule="evenodd"
    />
  ),
  panel: (
    <path
      d="M4 3h6a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm10 0h6a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm0 7h6a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1ZM4 14h6a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1Z"
      fillRule="evenodd"
    />
  ),
  profile: (
    <path
      d="M17.294 7.29105C17.294 10.2281 14.9391 12.5831 12 12.5831C9.0619 12.5831 6.70601 10.2281 6.70601 7.29105C6.70601 4.35402 9.0619 2 12 2C14.9391 2 17.294 4.35402 17.294 7.29105ZM12 22C7.66237 22 4 21.295 4 18.575C4 15.8539 7.68538 15.1739 12 15.1739C16.3386 15.1739 20 15.8789 20 18.599C20 21.32 16.3146 22 12 22Z"
      fillRule="evenodd"
    />
  ),
  mail: (
    <path
      d="M14.939,18H5.06A5.061,5.061,0,0,1,0,12.95V5.05A5.061,5.061,0,0,1,5.06,0h9.879a5.091,5.091,0,0,1,3.58,1.481A5.012,5.012,0,0,1,20,5.05v7.9A5.061,5.061,0,0,1,14.939,18ZM4.034,5.246A.733.733,0,0,0,3.5,5.47a.764.764,0,0,0-.071,1l.131.13L8.11,10.15a3.129,3.129,0,0,0,1.95.68,3.18,3.18,0,0,0,1.958-.68L16.53,6.54l.08-.08a.774.774,0,0,0-.012-1,.831.831,0,0,0-.528-.26h-.042a.76.76,0,0,0-.519.2L11,9a1.565,1.565,0,0,1-1,.36A1.592,1.592,0,0,1,9,9L4.5,5.4A.778.778,0,0,0,4.034,5.246Z"
      transform="translate(2 3)"
    />
  ),
  admin: (
    <path
      d="M20.4022 13.58C20.7599 13.77 21.0358 14.07 21.23 14.37C21.6081 14.99 21.5775 15.75 21.2096 16.42L20.4942 17.62C20.1161 18.26 19.4109 18.66 18.6853 18.66C18.3277 18.66 17.9291 18.56 17.6021 18.36C17.3364 18.19 17.0298 18.13 16.7027 18.13C15.691 18.13 14.8428 18.96 14.8121 19.95C14.8121 21.1 13.8719 22 12.6967 22H11.3068C10.1213 22 9.18113 21.1 9.18113 19.95C9.16069 18.96 8.31247 18.13 7.30073 18.13C6.96348 18.13 6.6569 18.19 6.40141 18.36C6.07438 18.56 5.6656 18.66 5.31813 18.66C4.58232 18.66 3.87717 18.26 3.49905 17.62L2.7939 16.42C2.41577 15.77 2.39533 14.99 2.77346 14.37C2.93697 14.07 3.24356 13.77 3.59102 13.58C3.87717 13.44 4.06112 13.21 4.23486 12.94C4.74584 12.08 4.43925 10.95 3.57059 10.44C2.55885 9.87 2.23182 8.6 2.81434 7.61L3.49905 6.43C4.09178 5.44 5.35901 5.09 6.38097 5.67C7.27007 6.15 8.42488 5.83 8.94608 4.98C9.10959 4.7 9.20157 4.4 9.18113 4.1C9.16069 3.71 9.27311 3.34 9.46728 3.04C9.8454 2.42 10.5301 2.02 11.2761 2H12.7171C13.4734 2 14.1581 2.42 14.5362 3.04C14.7201 3.34 14.8428 3.71 14.8121 4.1C14.7917 4.4 14.8837 4.7 15.0472 4.98C15.5684 5.83 16.7232 6.15 17.6225 5.67C18.6342 5.09 19.9117 5.44 20.4942 6.43L21.1789 7.61C21.7716 8.6 21.4446 9.87 20.4227 10.44C19.554 10.95 19.2474 12.08 19.7686 12.94C19.9321 13.21 20.1161 13.44 20.4022 13.58ZM9.10959 12.01C9.10959 13.58 10.4075 14.83 12.012 14.83C13.6164 14.83 14.8837 13.58 14.8837 12.01C14.8837 10.44 13.6164 9.18 12.012 9.18C10.4075 9.18 9.10959 10.44 9.10959 12.01Z"
      fillRule="evenodd"
    />
  ),
  prefs: (
    <path d="M18.75 12.75h1.5a.75.75 0 0 0 0-1.5h-1.5a.75.75 0 0 0 0 1.5ZM12 6a.75.75 0 0 1 .75-.75h7.5a.75.75 0 0 1 0 1.5h-7.5A.75.75 0 0 1 12 6ZM12 18a.75.75 0 0 1 .75-.75h7.5a.75.75 0 0 1 0 1.5h-7.5A.75.75 0 0 1 12 18ZM3.75 6.75h1.5a.75.75 0 1 0 0-1.5h-1.5a.75.75 0 0 0 0 1.5ZM5.25 18.75h-1.5a.75.75 0 0 1 0-1.5h1.5a.75.75 0 0 1 0 1.5ZM3 12a.75.75 0 0 1 .75-.75h7.5a.75.75 0 0 1 0 1.5h-7.5A.75.75 0 0 1 3 12ZM9 3.75a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5ZM12.75 12a2.25 2.25 0 1 1 4.5 0 2.25 2.25 0 0 1-4.5 0ZM9 15.75a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5Z" />
  ),
  // The top bar and the avatar menu (owner's decision of 02.10.2026, option A): "back", the
  // account rows and the HolyAgent cloud — the same shapes as the chat's switcher/iconPaths.js.
  back: (
    <path
      d="M11.03 3.97a.75.75 0 0 1 0 1.06l-6.22 6.22H21a.75.75 0 0 1 0 1.5H4.81l6.22 6.22a.75.75 0 1 1-1.06 1.06l-7.5-7.5a.75.75 0 0 1 0-1.06l7.5-7.5a.75.75 0 0 1 1.06 0Z"
      fillRule="evenodd"
    />
  ),
  user: (
    <path
      d="M17.294 7.29105C17.294 10.2281 14.9391 12.5831 12 12.5831C9.0619 12.5831 6.70601 10.2281 6.70601 7.29105C6.70601 4.35402 9.0619 2 12 2C14.9391 2 17.294 4.35402 17.294 7.29105ZM12 22C7.66237 22 4 21.295 4 18.575C4 15.8539 7.68538 15.1739 12 15.1739C16.3386 15.1739 20 15.8789 20 18.599C20 21.32 16.3146 22 12 22Z"
      fillRule="evenodd"
    />
  ),
  security: (
    <path
      d="M12 2 4 5v6c0 5.3 3.4 9.7 8 11 4.6-1.3 8-5.7 8-11V5l-8-3Zm-1.2 13.6-3.1-3.1 1.4-1.4 1.7 1.7 4.1-4.1 1.4 1.4-5.5 5.5Z"
      fillRule="evenodd"
    />
  ),
  keys: (
    <path
      d="M15.5 2a6.5 6.5 0 0 0-6.2 8.5L2 17.8V22h4.2l1.4-1.4v-2.2h2.2l1.4-1.4v-2.2h2.2l.1-.1A6.5 6.5 0 1 0 15.5 2Zm1.5 6.5a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z"
      fillRule="evenodd"
    />
  ),
  language: (
    <path d="M21.721 12.752a9.711 9.711 0 0 0-.945-5.003 12.754 12.754 0 0 1-4.339 2.708 18.991 18.991 0 0 1-.214 4.772 17.165 17.165 0 0 0 5.498-2.477ZM14.634 15.55a17.324 17.324 0 0 0 .332-4.647c-.952.227-1.945.347-2.966.347-1.021 0-2.014-.12-2.966-.347a17.515 17.515 0 0 0 .332 4.647 17.385 17.385 0 0 0 5.268 0ZM9.772 17.119a18.963 18.963 0 0 0 4.456 0A17.182 17.182 0 0 1 12 21.724a17.18 17.18 0 0 1-2.228-4.605ZM7.777 15.23a18.87 18.87 0 0 1-.214-4.774 12.753 12.753 0 0 1-4.34-2.708 9.711 9.711 0 0 0-.944 5.004 17.165 17.165 0 0 0 5.498 2.477ZM21.356 14.752a9.765 9.765 0 0 1-7.478 6.817 18.64 18.64 0 0 0 1.988-4.718 18.627 18.627 0 0 0 5.49-2.098ZM2.644 14.752c1.682.971 3.53 1.688 5.49 2.099a18.64 18.64 0 0 0 1.988 4.718 9.765 9.765 0 0 1-7.478-6.816ZM13.878 2.43a9.755 9.755 0 0 1 6.116 3.986 11.267 11.267 0 0 1-3.746 2.504 18.63 18.63 0 0 0-2.37-6.49ZM12 2.276a17.152 17.152 0 0 1 2.805 7.121c-.897.23-1.837.353-2.805.353-.968 0-1.908-.122-2.805-.353A17.151 17.151 0 0 1 12 2.276ZM10.122 2.43a18.629 18.629 0 0 0-2.37 6.49 11.266 11.266 0 0 1-3.746-2.504 9.754 9.754 0 0 1 6.116-3.985Z" />
  ),
  settings: (
    <path
      d="M20.4022 13.58C20.7599 13.77 21.0358 14.07 21.23 14.37C21.6081 14.99 21.5775 15.75 21.2096 16.42L20.4942 17.62C20.1161 18.26 19.4109 18.66 18.6853 18.66C18.3277 18.66 17.9291 18.56 17.6021 18.36C17.3364 18.19 17.0298 18.13 16.7027 18.13C15.691 18.13 14.8428 18.96 14.8121 19.95C14.8121 21.1 13.8719 22 12.6967 22H11.3068C10.1213 22 9.18113 21.1 9.18113 19.95C9.16069 18.96 8.31247 18.13 7.30073 18.13C6.96348 18.13 6.6569 18.19 6.40141 18.36C6.07438 18.56 5.6656 18.66 5.31813 18.66C4.58232 18.66 3.87717 18.26 3.49905 17.62L2.7939 16.42C2.41577 15.77 2.39533 14.99 2.77346 14.37C2.93697 14.07 3.24356 13.77 3.59102 13.58C3.87717 13.44 4.06112 13.21 4.23486 12.94C4.74584 12.08 4.43925 10.95 3.57059 10.44C2.55885 9.87 2.23182 8.6 2.81434 7.61L3.49905 6.43C4.09178 5.44 5.35901 5.09 6.38097 5.67C7.27007 6.15 8.42488 5.83 8.94608 4.98C9.10959 4.7 9.20157 4.4 9.18113 4.1C9.16069 3.71 9.27311 3.34 9.46728 3.04C9.8454 2.42 10.5301 2.02 11.2761 2H12.7171C13.4734 2 14.1581 2.42 14.5362 3.04C14.7201 3.34 14.8428 3.71 14.8121 4.1C14.7917 4.4 14.8837 4.7 15.0472 4.98C15.5684 5.83 16.7232 6.15 17.6225 5.67C18.6342 5.09 19.9117 5.44 20.4942 6.43L21.1789 7.61C21.7716 8.6 21.4446 9.87 20.4227 10.44C19.554 10.95 19.2474 12.08 19.7686 12.94C19.9321 13.21 20.1161 13.44 20.4022 13.58ZM9.10959 12.01C9.10959 13.58 10.4075 14.83 12.012 14.83C13.6164 14.83 14.8837 13.58 14.8837 12.01C14.8837 10.44 13.6164 9.18 12.012 9.18C10.4075 9.18 9.10959 10.44 9.10959 12.01Z"
      fillRule="evenodd"
    />
  ),
  "switch-user": (
    <path
      d="M14.454,17.721a4.445,4.445,0,0,1-.434-.394A17.665,17.665,0,0,1,10.909,12.7a4.061,4.061,0,0,1-.32-1.078V11.57a1.461,1.461,0,0,1,.779-1.288,6.515,6.515,0,0,1,1.04-.28A20.9,20.9,0,0,1,15.3,9.83a17.926,17.926,0,0,1,2.985.2,7.45,7.45,0,0,1,.835.209,1.5,1.5,0,0,1,.709.65,1.633,1.633,0,0,1,.171.732,3.875,3.875,0,0,1-.264.963,17.773,17.773,0,0,1-3.155,4.736c-.16.162-.355.337-.4.382a1.43,1.43,0,0,1-.891.3A1.363,1.363,0,0,1,14.454,17.721Zm-10.94-2.3.257-4.578a.934.934,0,1,1,1.867,0L5.9,15.417a1.191,1.191,0,1,1-2.381,0Zm-1.8-7.444A7.4,7.4,0,0,1,.88,7.764a1.491,1.491,0,0,1-.709-.65A1.62,1.62,0,0,1,0,6.384a3.943,3.943,0,0,1,.262-.963A17.762,17.762,0,0,1,3.418.685c.161-.162.355-.337.4-.383A1.433,1.433,0,0,1,4.712,0a1.368,1.368,0,0,1,.834.278,4.586,4.586,0,0,1,.435.4A17.751,17.751,0,0,1,9.091,5.3a4.108,4.108,0,0,1,.321,1.079v.047a1.464,1.464,0,0,1-.778,1.287A6.442,6.442,0,0,1,7.593,8,20.9,20.9,0,0,1,4.7,8.17,17.926,17.926,0,0,1,1.715,7.973Zm12.647-.811L14.1,2.583a1.191,1.191,0,1,1,2.381,0l-.257,4.579a.934.934,0,1,1-1.867,0Z"
      transform="translate(2 3) translate(0 0)"
    />
  ),
  "sign-out": (
    <path
      d="M4.517,20A4.482,4.482,0,0,1,0,15.56V4.45A4.493,4.493,0,0,1,4.528,0H9.492A4.48,4.48,0,0,1,14,4.44V9.23H7.9a.77.77,0,1,0,0,1.54H14v4.78A4.493,4.493,0,0,1,9.472,20ZM16.54,13.451a.773.773,0,0,1,0-1.09l1.6-1.59H14V9.23h4.14l-1.6-1.59a.773.773,0,0,1,0-1.09.764.764,0,0,1,1.09-.01l2.92,2.91a.766.766,0,0,1,.229.55.741.741,0,0,1-.229.54l-2.92,2.911a.762.762,0,0,1-1.09,0Z"
      transform="translate(2 2) translate(0)"
    />
  ),
  download: (
    <>
      <path
        key="0"
        d="M12.75 13C12.75 12.5858 12.4142 12.25 12 12.25C11.5858 12.25 11.25 12.5858 11.25 13V19.1893L9.53033 17.4697C9.23744 17.1768 8.76256 17.1768 8.46967 17.4697C8.17678 17.7626 8.17678 18.2374 8.46967 18.5303L11.4697 21.5303C11.5416 21.6022 11.6245 21.6565 11.7129 21.6931C11.8013 21.7298 11.8983 21.75 12 21.75C12.1919 21.75 12.3839 21.6768 12.5303 21.5303L15.5303 18.5303C15.8232 18.2374 15.8232 17.7626 15.5303 17.4697C15.2374 17.1768 14.7626 17.1768 14.4697 17.4697L12.75 19.1893V13Z"
      />
      <path
        key="1"
        d="M8.70294 6.56461C9.6799 4.04041 12.1301 2.25 15 2.25C18.7279 2.25 21.75 5.27208 21.75 9C21.75 10.9992 20.8799 12.7962 19.5002 14.0311C19.1915 14.3073 18.7174 14.281 18.4411 13.9724C18.1649 13.6638 18.1912 13.1896 18.4998 12.9134C19.5751 11.951 20.25 10.5548 20.25 9C20.25 6.10051 17.8995 3.75 15 3.75C12.5136 3.75 10.4293 5.47913 9.8873 7.80127C9.83192 8.03853 9.66474 8.23411 9.43898 8.32574C9.21323 8.41736 8.95703 8.39362 8.75196 8.26206C8.24682 7.938 7.64651 7.75 7 7.75C5.20507 7.75 3.75 9.20507 3.75 11C3.75 12.202 4.40216 13.2526 5.37554 13.8157C5.73409 14.0231 5.85661 14.4819 5.6492 14.8404C5.4418 15.199 4.983 15.3215 4.62446 15.1141C3.20663 14.2939 2.25 12.7591 2.25 11C2.25 8.37665 4.37665 6.25 7 6.25C7.59949 6.25 8.17389 6.36137 8.70294 6.56461Z"
      />
    </>
  ),
};

export function SwitcherIcon({ name, size = 16, className }: { name: string; size?: number; className?: string }) {
  const paths = PATHS[name];
  if (!paths) return null;
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      {paths}
    </svg>
  );
}

/** The grid button: nine dots. */
export function GridIcon({ size = 16, className }: { size?: number; className?: string }) {
  const dots: ReactNode[] = [];
  for (const cy of [5, 12, 19]) {
    for (const cx of [5, 12, 19]) dots.push(<circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.9" />);
  }
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      {dots}
    </svg>
  );
}

/** The service's icon: an SVG by `icon` or by key, an emoji as text, otherwise the first letter. */
export function ServiceIcon({
  service,
  size = 16,
}: {
  service: Pick<ServiceEntry, "key" | "name" | "icon">;
  size?: number;
}) {
  const icon = String(service.icon ?? "").trim();
  const key = String(service.key ?? "").trim();
  if (icon && PATHS[icon]) return <SwitcherIcon name={icon} size={size} />;
  if (icon && !PATHS[icon] && Array.from(icon).length <= 2 && /[^\w\s-]/.test(icon)) {
    return (
      <span className="text-[15px] leading-none" aria-hidden="true">
        {icon}
      </span>
    );
  }
  if (PATHS[key]) return <SwitcherIcon name={key} size={size} />;
  const letter = String(service.name || key || "?")
    .trim()
    .charAt(0)
    .toUpperCase();
  return (
    <span className="text-[13px] leading-none font-extrabold" aria-hidden="true">
      {letter}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Texts — profile.switcher.* in locales/{ru,en}.json (overridable by hosted_login_translation)
// ---------------------------------------------------------------------------

type SwitcherT = ReturnType<typeof useTranslations>;

const KNOWN = new Set<string>(SERVICE_KEYS);

/** The tile's name: from the server, else by key, else the key itself. */
export function serviceName(service: Pick<ServiceEntry, "key" | "name">, t: SwitcherT): string {
  const own = String(service.name ?? "").trim();
  if (own) return own;
  return KNOWN.has(service.key) ? t(`name.${service.key}`) : service.key;
}

/** Under the tile: "you are here" for the current service, else status.text from the server, else the hint by key. */
export function serviceHint(service: Pick<ServiceEntry, "key" | "status">, t: SwitcherT, current = false): string {
  if (current) return t("youAreHere");
  const status = String(service.status?.text ?? "").trim();
  if (status) return status;
  return KNOWN.has(service.key) ? t(`hint.${service.key}`) : "";
}

// ---------------------------------------------------------------------------
// Behaviour
// ---------------------------------------------------------------------------

/** Closes on a click outside and on Escape (focus back to the trigger). */
export function useSwitcherDismiss(
  open: boolean,
  rootRef: RefObject<HTMLElement | null>,
  onClose: () => void,
  triggerRef?: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!open || typeof window === "undefined") return undefined;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current && !rootRef.current.contains(target)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onClose();
      triggerRef?.current?.focus?.();
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open, onClose, rootRef, triggerRef]);
}

export function defaultReturnTo(): string {
  try {
    return typeof window !== "undefined" ? String(window.location.href || "") : "";
  } catch {
    return "";
  }
}

export function orgIdOf(org: ServiceOrg | string | null | undefined): string {
  if (!org) return "";
  if (typeof org === "string") return org.trim();
  return String(org.account_id ?? "").trim();
}

export function orgNameOf(org: ServiceOrg | string | null | undefined): string {
  if (!org || typeof org !== "object") return "";
  return String(org.name ?? "").trim();
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

const tileClasses =
  "border-hc-border bg-hc-card-2 flex min-w-0 flex-col items-center justify-start border text-center text-inherit no-underline transition-colors focus-visible:ring-hc-ring focus-visible:ring-[3px] focus-visible:outline-none";

/** The header menu's tile (switcher.css) and the phone sheet's, a little larger (mobile-nav.css `.hcm-tile`). */
const TILE = {
  menu: {
    box: "min-h-[78px] rounded-[11px] px-1.5 pt-[9px] pb-2",
    icon: "mb-[5px] h-[30px] w-[30px] rounded-[9px]",
    iconSize: 16,
    name: "text-[12px]",
    hint: "mt-px",
  },
  sheet: {
    box: "min-h-[84px] rounded-[13px] px-1.5 pt-2.5 pb-[9px]",
    icon: "mb-1.5 h-8 w-8 rounded-[10px]",
    iconSize: 18,
    name: "text-[12.5px]",
    hint: "mt-0.5",
  },
} as const;

/**
 * One tile: a link into the service, or (the current service) a button that says "you are here".
 * `variant` — "menu": the header menu (`role="menuitem"`); "sheet": the phone's services sheet (a dialog).
 */
export function ServiceTile({
  service,
  current = false,
  href = "",
  name,
  hint,
  variant = "menu",
  onSelect,
  testId,
}: {
  service: ServiceEntry;
  current?: boolean;
  href?: string;
  name: string;
  hint: string;
  variant?: keyof typeof TILE;
  onSelect?: (event: MouseEvent<HTMLElement>) => void;
  testId?: string;
}) {
  const size = TILE[variant];
  const role = variant === "menu" ? "menuitem" : undefined;
  const inner = (
    <>
      <span className={clsx("text-hc-p400 bg-hc-soft flex items-center justify-center", size.icon)}>
        <ServiceIcon service={service} size={size.iconSize} />
      </span>
      <span className={clsx("block max-w-full truncate font-bold", size.name)}>{name}</span>
      {hint ? (
        <span
          className={clsx(
            "line-clamp-2 max-w-full text-[10.5px] leading-[1.25] [overflow-wrap:anywhere]",
            size.hint,
            current ? "text-hc-p400" : "text-hc-muted",
            current && variant === "sheet" && "font-semibold",
          )}
        >
          {hint}
        </span>
      ) : null}
    </>
  );
  const classes = clsx(
    tileClasses,
    size.box,
    current ? "border-hc-p500 bg-hc-soft cursor-default" : "hover:border-hc-p500 hover:bg-hc-soft cursor-pointer",
    current && variant === "sheet" && "shadow-[inset_0_0_0_1px_var(--hc-p500)]",
  );
  if (current || !href) {
    return (
      <button
        type="button"
        role={role}
        className={classes}
        aria-current={current ? "page" : undefined}
        onClick={(event) => onSelect?.(event)}
        data-testid={testId}
        data-service={service.key}
      >
        {inner}
      </button>
    );
  }
  return (
    <a
      role={role}
      className={classes}
      href={href}
      onClick={(event) => onSelect?.(event)}
      data-testid={testId}
      data-service={service.key}
      data-href={href}
    >
      {inner}
    </a>
  );
}

const rowClasses =
  "flex min-h-[34px] w-full items-center gap-[9px] rounded-[9px] px-2 py-[7px] text-left text-inherit no-underline";

function MenuRow({
  icon,
  text,
  right,
  href,
  external,
  onSelect,
  testId,
}: {
  icon: string;
  text: string;
  right?: string;
  href: string;
  external?: boolean;
  onSelect?: () => void;
  testId?: string;
}) {
  return (
    <a
      role="menuitem"
      href={href}
      className={clsx(
        rowClasses,
        "hover:bg-hc-card-2 focus-visible:bg-hc-card-2 transition-colors focus-visible:outline-none",
      )}
      onClick={() => onSelect?.()}
      data-testid={testId}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
    >
      <span className="text-hc-p400 flex w-5 shrink-0 items-center justify-center">
        <SwitcherIcon name={icon} size={16} />
      </span>
      <span className="max-w-full min-w-0 flex-[1_0_auto] truncate">{text}</span>
      {right ? (
        <span className="text-hc-muted ml-auto min-w-0 flex-[0_1_auto] truncate pl-2 text-[11px]">{right}</span>
      ) : null}
    </a>
  );
}

/** Which services the switcher lists: those with a key and an address. */
export function listOf(services: ServiceEntry[] | undefined | null): ServiceEntry[] {
  return Array.isArray(services) ? services.filter((item) => item && item.key && item.url) : [];
}

// ---------------------------------------------------------------------------
// The switcher (grid button + menu)
// ---------------------------------------------------------------------------

export type ServiceSwitcherProps = {
  services: ServiceEntry[];
  org: ServiceOrg | null;
  /** The key of the service we are in: its tile says "you are here". */
  current?: string;
  /** Where a service should bring the person back to; read when the menu opens. */
  getReturnTo?: () => string;
  /** The organization admin (chat.holycode.org/admin) — shown to owners and admins. */
  adminUrl?: string;
  canOpenAdmin?: boolean;
  /** "dark · RU" next to "Theme and language — from your ID profile"; the row links to the settings. */
  prefsSummary?: string;
  prefsHref?: string;
  compact?: boolean;
  align?: "left" | "right";
  className?: string;
  onOpen?: () => void;
};

export function ServiceSwitcher({
  services,
  org,
  current = "profile",
  getReturnTo = defaultReturnTo,
  adminUrl = "",
  canOpenAdmin = false,
  prefsSummary = "",
  prefsHref = "",
  compact = false,
  align = "left",
  className,
  onOpen,
}: ServiceSwitcherProps) {
  const t = useTranslations("profile.switcher");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const close = useCallback(() => setOpen(false), []);
  useSwitcherDismiss(open, rootRef, close, triggerRef);

  const orgId = orgIdOf(org);
  const orgName = orgNameOf(org);
  const list = listOf(services);
  const returnTo = open ? String(getReturnTo?.() ?? "") : "";
  const adminHref = canOpenAdmin && adminUrl ? buildServiceHref(adminUrl, { org: orgId, returnTo }) : "";

  const toggle = () => {
    if (open) {
      close();
      return;
    }
    setOpen(true);
    onOpen?.();
  };

  return (
    <div
      ref={rootRef}
      // no display utility here: the host decides (the profile hides it under 768 px with `hidden md:block`)
      className={clsx("relative min-w-0", className)}
      data-testid="service-switcher"
      data-org={orgId || undefined}
    >
      <button
        ref={triggerRef}
        type="button"
        className={clsx(
          "border-hc-p500/70 bg-hc-soft text-hc-p400 inline-flex items-center justify-center border transition-colors",
          "hover:border-hc-p500 aria-expanded:border-hc-p500 focus-visible:ring-hc-ring focus-visible:ring-[3px] focus-visible:outline-none",
          compact ? "h-[34px] w-[34px] rounded-[9px]" : "h-10 w-10 rounded-[10px]",
        )}
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={t("trigger")}
        title={t("trigger")}
        data-testid="service-switcher-trigger"
      >
        <GridIcon size={compact ? 15 : 17} />
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={t("title")}
          className={clsx(
            "border-hc-border bg-hc-card text-hc-text shadow-hc-card absolute top-[calc(100%+8px)] z-50 max-h-[calc(100vh-5rem)] w-[352px] max-w-[calc(100vw-1.5rem)] overflow-y-auto overscroll-contain rounded-[14px] border p-2.5 text-left text-[13px] leading-[1.4]",
            align === "right" ? "right-0 left-auto" : "left-0",
          )}
          data-testid="service-menu"
        >
          <div className="text-hc-muted truncate px-2 pt-1 pb-1.5 text-[10.5px] font-semibold tracking-[0.1em] uppercase">
            {orgName ? `${t("title")} · ${orgName}` : t("title")}
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {list.map((service) => {
              const isCurrent = service.key === current;
              const href = isCurrent ? "" : buildServiceHref(service.url, { org: orgId, returnTo });
              return (
                <ServiceTile
                  key={service.key}
                  service={service}
                  current={isCurrent}
                  href={href}
                  name={serviceName(service, t)}
                  hint={serviceHint(service, t, isCurrent)}
                  onSelect={(event) => {
                    // inside the HolyAgent shell: a tab of its window instead of leaving this one
                    openServiceInDesktop(service, href, event);
                    close();
                  }}
                  testId={`service-tile-${service.key}`}
                />
              );
            })}
          </div>
          {adminHref || (prefsSummary && prefsHref) ? (
            <hr className="border-hc-border-subtle mt-2 mb-1.5 border-0 border-t" />
          ) : null}
          {adminHref ? (
            <MenuRow
              icon="admin"
              text={t("orgAdmin")}
              right={t("orgAdminHint")}
              href={adminHref}
              onSelect={close}
              testId="service-menu-admin"
            />
          ) : null}
          {prefsSummary && prefsHref ? (
            <MenuRow
              icon="prefs"
              text={t("prefsFromId")}
              right={prefsSummary}
              href={prefsHref}
              onSelect={close}
              testId="service-menu-prefs"
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
