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

function persistSession(user: any, profile: any, menuAccess: MenuAccessState) {
  localStorage.setItem(
    "lifehub_session",
    JSON.stringify({ user, profile, menuAccess }),
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<any | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [menuAccess, setMenuAccess] = useState<MenuAccessState>(defaultMenuAccess);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      const savedSession = localStorage.getItem("lifehub_session");
      if (!savedSession) {
        setLoading(false);
        return;
      }
      try {
        const data = JSON.parse(savedSession);
        setUser(data.user);
        setProfile(data.profile);
        if (data.menuAccess) {
          setMenuAccess(data.menuAccess);
        } else if (data.profile?.role) {
          const access = await fetchMenuAccessForRole(String(data.profile.role));
          setMenuAccess(access);
          persistSession(data.user, data.profile, access);
        } else {
          setMenuAccess(defaultMenuAccess);
        }
      } catch {
        localStorage.removeItem("lifehub_session");
      } finally {
        setLoading(false);
      }
    };
    void init();
  }, []);

  const login = async (userData: any) => {
    setUser(userData.user);
    setProfile(userData.profile);
    const access = userData.profile?.role
      ? await fetchMenuAccessForRole(String(userData.profile.role))
      : defaultMenuAccess;
    setMenuAccess(access);
    persistSession(userData.user, userData.profile, access);
  };

  const signOut = () => {
    setUser(null);
    setProfile(null);
    setMenuAccess(defaultMenuAccess);
    localStorage.removeItem("lifehub_session");
  };

  const refreshMenuAccess = useCallback(async () => {
    const role = profile?.role;
    if (!role) {
      setMenuAccess(defaultMenuAccess);
      return;
    }
    const access = await fetchMenuAccessForRole(String(role));
    setMenuAccess(access);
    if (user && profile) {
      persistSession(user, profile, access);
    }
  }, [profile?.role, user, profile]);

  return (
    <AuthContext.Provider
      value={{ user, profile, menuAccess, loading, login, signOut, refreshMenuAccess }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
