const GUEST_FLAG = "doodee_guest_mode";
const USER_KEY = "doodee_user";

export interface GuestUser {
  mode: "guest";
  createdAt: string;
}

export function isGuest(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(GUEST_FLAG) === "true";
  } catch {
    return false;
  }
}

export function enterGuestMode(): GuestUser {
  const user: GuestUser = {
    mode: "guest",
    createdAt: new Date().toISOString(),
  };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(GUEST_FLAG, "true");
      window.localStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch {
      // Storage blocked (private mode) — guest mode still works for this session.
    }
  }
  return user;
}

export function readGuestUser(): GuestUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GuestUser;
    return parsed?.mode === "guest" ? parsed : null;
  } catch {
    return null;
  }
}

export function clearGuestMode(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(GUEST_FLAG);
    window.localStorage.removeItem(USER_KEY);
  } catch {
    // Ignore
  }
}
