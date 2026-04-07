import React, { createContext, useContext, useEffect, useState } from 'react';
import { authApi, AuthUser } from '../lib/auth';
import {
  clearSessionToken,
  clearSessionUser,
  getSessionToken,
  getSessionUser,
  setSessionToken,
  setSessionUser,
} from '../lib/session';

interface AuthContextType {
  user: AuthUser | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
  error: string | null;
}

type ApiErrorLike = Error & { code?: string };

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(() => getSessionUser());
  const [token, setToken] = useState<string | null>(() => getSessionToken() || null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const clearAuthState = () => {
    setUser(null);
    setToken(null);
    clearSessionUser();
    clearSessionToken();
  };

  const login = async (username: string, password: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await authApi.login(username, password);
      const userData: AuthUser = {
        id: String(response.user.id),
        username: response.user.username,
        name: response.user.name || '',
        role: response.user.role,
        avatar: response.user.avatar || '',
        storeName: response.user.storeName || '',
        onlineStatus: typeof response.user.onlineStatus === 'number' ? response.user.onlineStatus : 0,
      };

      setUser(userData);
      setToken(response.token);
      setSessionUser(userData);
      setSessionToken(response.token);
    } catch (err) {
      const e = err as ApiErrorLike;
      setError(mapAuthErrorMessage(e?.message || '', e?.code));
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    if (token) {
      authApi.logout(token).catch(() => {
        // ignore network errors during logout cleanup
      });
    }
    clearAuthState();
  };

  useEffect(() => {
    let timer: number | undefined;

    const verifyToken = async (silent: boolean) => {
      if (!token) return;
      if (!silent) setIsLoading(true);
      try {
        const userInfo = await authApi.getCurrentUser(token);
        const nextUser: AuthUser = {
          id: String(userInfo.id),
          username: userInfo.username,
          name: userInfo.name || '',
          role: userInfo.role,
          avatar: userInfo.avatar || '',
          storeName: userInfo.storeName || '',
          onlineStatus: typeof userInfo.onlineStatus === 'number' ? userInfo.onlineStatus : 0,
        };
        setUser(nextUser);
        setSessionUser(nextUser);
      } catch (err) {
        const e = err as ApiErrorLike;
        const mapped = mapAuthErrorMessage(e?.message || '', e?.code);
        setError(mapped);
        clearAuthState();
      } finally {
        if (!silent) setIsLoading(false);
      }
    };

    verifyToken(false);
    if (token) {
      timer = window.setInterval(() => {
        verifyToken(true);
      }, 15000);
    }

    return () => {
      if (timer) window.clearInterval(timer);
    };
  }, [token]);

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading, error }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

function mapAuthErrorMessage(message: string, code?: string): string {
  const m = (message || '').trim();
  const c = (code || '').trim();

  if (c === 'SESSION_REVOKED') return '账号在别处登录，已被顶号下线';
  if (c === 'ACCOUNT_DISABLED') return '账号已停用';
  if (c === 'ACCOUNT_EXPIRED') return '账号已到期';
  if (c === 'INVALID_TOKEN') return '登录状态已失效，请重新登录';
  if (c === 'MISSING_AUTH') return '请先登录';

  if (!m) return '登录失败，请检查用户名和密码。';
  if (m === '账号已停用' || m === 'Account is disabled') return '账号已停用';
  if (m === '账号已到期' || m === 'Account has expired') return '账号已到期';
  if (m === '账号已在别处登录，被顶号下线' || m === 'Session revoked') return '账号在别处登录，已被顶号下线';
  if (m === 'Invalid username or password') return '用户名或密码错误';
  return m;
}
