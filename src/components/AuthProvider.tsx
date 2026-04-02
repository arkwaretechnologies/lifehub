"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { UserProfile } from "@/lib/types";

interface AuthContextType {
  user: any | null;
  profile: UserProfile | null;
  loading: boolean;
  login: (userData: any) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  login: () => {},
  signOut: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<any | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load session from localStorage on mount
    const savedSession = localStorage.getItem("lifehub_session");
    if (savedSession) {
      const data = JSON.parse(savedSession);
      setUser(data.user);
      setProfile(data.profile);
    }
    setLoading(false);
  }, []);

  const login = (userData: any) => {
    setUser(userData.user);
    setProfile(userData.profile);
    localStorage.setItem("lifehub_session", JSON.stringify(userData));
  };

  const signOut = () => {
    setUser(null);
    setProfile(null);
    localStorage.removeItem("lifehub_session");
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, login, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
