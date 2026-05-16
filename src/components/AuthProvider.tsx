"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from "react";
import { UserProfile } from "@/lib/types";
import {
  defaultMenuAccess,
  fetchMenuAccessForRole,
  type MenuAccessState,
} from "@/lib/menuAccess";

const SESSION_KEY = "lifehub_session";

interface AuthContextType {
  user: any | null;
  profile: UserProfile | null;
  menuAccess: MenuAccessState;
  loading: boolean;
  login: (userData: any) => Promise<void>;
  signOut: () => void;
  refreshMenuAccess: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  menuAccess: defaultMenuAccess,
  loading: true,
  login: async () => {},
  signOut: () => {},
  refreshMenuAccess: async () => {},
});

type PersistedSession = {
  token: string;
  user?: unknown;
  profile?: unknown;
  menuAccess?: MenuAccessState;
};

function persistSession(payload: PersistedSession) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
}

async function fetchSessionWithToken(token: string): Promise<{
  user: unknown;
  profile: UserProfile;
  menuAccess: MenuAccessState;
} | null> {
  const res = await fetch("/api/auth/session", {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const json = (await res.json().catch(() => null)) as {
    user?: unknown;
    profile?: UserProfile;
    menuAccess?: MenuAccessState;
    error?: string;
  } | null;
  if (!json || json.error || !json.profile) return null;
  return {
    user: json.user ?? null,
    profile: json.profile,
    menuAccess: json.menuAccess ?? defaultMenuAccess,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<any | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [menuAccess, setMenuAccess] = useState<MenuAccessState>(defaultMenuAccess);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      const savedSession = localStorage.getItem(SESSION_KEY);
      if (!savedSession) {
        setLoading(false);
        return;
      }
      try {
        const data = JSON.parse(savedSession) as PersistedSession & Record<string, unknown>;
        if (!data.token || typeof data.token !== "string") {
          localStorage.removeItem(SESSION_KEY);
          setLoading(false);
          return;
        }

        const fresh = await fetchSessionWithToken(data.token);
        if (!fresh) {
          localStorage.removeItem(SESSION_KEY);
          setUser(null);
          setProfile(null);
          setMenuAccess(defaultMenuAccess);
          setLoading(false);
          return;
        }

        setUser(fresh.user);
        setProfile(fresh.profile);
        setMenuAccess(fresh.menuAccess);
        persistSession({
          token: data.token,
          user: fresh.user,
          profile: fresh.profile,
          menuAccess: fresh.menuAccess,
        });
      } catch {
        localStorage.removeItem(SESSION_KEY);
      } finally {
        setLoading(false);
      }
    };
    void init();
  }, []);

  const login = async (userData: any) => {
    const token = typeof userData?.token === "string" ? userData.token : "";
    if (!token) {
      throw new Error("Missing session token from login response.");
    }
    setUser(userData.user);
    setProfile(userData.profile);
    const access =
      userData.menuAccess != null
        ? (userData.menuAccess as MenuAccessState)
        : userData.profile?.role
          ? await fetchMenuAccessForRole(String(userData.profile.role))
          : defaultMenuAccess;
    setMenuAccess(access);
    persistSession({
      token,
      user: userData.user,
      profile: userData.profile,
      menuAccess: access,
    });
  };

  const signOut = () => {
    setUser(null);
    setProfile(null);
    setMenuAccess(defaultMenuAccess);
    localStorage.removeItem(SESSION_KEY);
  };

  const refreshMenuAccess = useCallback(async () => {
    const raw = typeof window !== "undefined" ? localStorage.getItem(SESSION_KEY) : null;
    if (!raw) {
      setMenuAccess(defaultMenuAccess);
      return;
    }
    let token: string;
    try {
      token = (JSON.parse(raw) as PersistedSession).token;
    } catch {
      setMenuAccess(defaultMenuAccess);
      return;
    }
    if (!token) {
      setMenuAccess(defaultMenuAccess);
      return;
    }

    const fresh = await fetchSessionWithToken(token);
    if (!fresh) {
      setUser(null);
      setProfile(null);
      setMenuAccess(defaultMenuAccess);
      localStorage.removeItem(SESSION_KEY);
      return;
    }
    setUser(fresh.user);
    setProfile(fresh.profile);
    setMenuAccess(fresh.menuAccess);
    persistSession({
      token,
      user: fresh.user,
      profile: fresh.profile,
      menuAccess: fresh.menuAccess,
    });
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, profile, menuAccess, loading, login, signOut, refreshMenuAccess }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
