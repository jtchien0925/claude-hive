"use client";

const MUTED_KEY = "hive.notifications.muted";
const PERMISSION_KEY = "hive.notifications.permission";

export type StoredPermission = "granted" | "denied" | "default";

function hasNotificationApi(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function isMuted(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(MUTED_KEY) === "1";
}

export function setMuted(muted: boolean): void {
  if (typeof window === "undefined") return;
  if (muted) window.localStorage.setItem(MUTED_KEY, "1");
  else window.localStorage.removeItem(MUTED_KEY);
}

export function getStoredPermission(): StoredPermission {
  if (typeof window === "undefined") return "default";
  const v = window.localStorage.getItem(PERMISSION_KEY);
  if (v === "granted" || v === "denied") return v;
  return "default";
}

export async function ensurePermission(): Promise<NotificationPermission | "unsupported"> {
  if (!hasNotificationApi()) return "unsupported";
  if (Notification.permission === "granted") {
    window.localStorage.setItem(PERMISSION_KEY, "granted");
    return "granted";
  }
  if (Notification.permission === "denied") {
    window.localStorage.setItem(PERMISSION_KEY, "denied");
    return "denied";
  }
  const result = await Notification.requestPermission();
  window.localStorage.setItem(PERMISSION_KEY, result);
  return result;
}

export interface FireNotificationArgs {
  sessionId: string;
  title: string;
  body: string;
  onClick: () => void;
}

export async function fireNotification(args: FireNotificationArgs): Promise<void> {
  if (!hasNotificationApi()) return;
  if (isMuted()) return;
  const permission = await ensurePermission();
  if (permission !== "granted") return;

  // tag = sessionId ensures repeat events for the same session replace in place
  const n = new Notification(args.title, {
    body: args.body,
    tag: args.sessionId,
  });
  n.onclick = () => {
    window.focus();
    args.onClick();
    n.close();
  };
}
