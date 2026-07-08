// ─── Auth context ──────────────────────────────────────────────────────
// Session-cookie based auth. The API server owns the session; this context
// mirrors the current user (or null) and exposes login/logout/changePassword.

import {
  createContext,
  useContext,
  useCallback,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  authMe,
  authLogin,
  authLogout,
  authChangePassword,
  getAuthMeQueryKey,
  ApiError,
  type AuthUser,
} from "@workspace/api-client-react";

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: getAuthMeQueryKey(),
    queryFn: async ({ signal }) => {
      try {
        const result = await authMe({ signal });
        return result.user;
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await authLogin({ email, password });
      queryClient.setQueryData(getAuthMeQueryKey(), result.user);
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    try {
      await authLogout();
    } finally {
      queryClient.setQueryData(getAuthMeQueryKey(), null);
      queryClient.removeQueries({ predicate: (q) => q.queryKey !== getAuthMeQueryKey() });
    }
  }, [queryClient]);

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      const result = await authChangePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      queryClient.setQueryData(getAuthMeQueryKey(), result.user);
    },
    [queryClient],
  );

  return (
    <AuthContext.Provider
      value={{ user: data ?? null, isLoading, login, logout, changePassword }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
