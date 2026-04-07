import React, { createContext, useContext, useEffect, useState } from 'react';
import { authApi, AuthUser } from '../lib/auth';

interface AuthContextType {
  user: AuthUser | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
  error: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const storedUser = localStorage.getItem('user');
    return storedUser ? JSON.parse(storedUser) : null;
  });
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'));
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

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
      localStorage.setItem('user', JSON.stringify(userData));
      localStorage.setItem('token', response.token);
    } catch (err) {
      setError('登录失败，请检查用户名和密码。');
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
    setUser(null);
    setToken(null);
    localStorage.removeItem('user');
    localStorage.removeItem('token');
  };

  useEffect(() => {
    const verifyToken = async () => {
      if (!token) return;
      setIsLoading(true);
      try {
        const userInfo = await authApi.getCurrentUser(token);
        setUser({
          id: String(userInfo.id),
          username: userInfo.username,
          name: userInfo.name || '',
          role: userInfo.role,
          avatar: userInfo.avatar || '',
          storeName: userInfo.storeName || '',
          onlineStatus: typeof userInfo.onlineStatus === 'number' ? userInfo.onlineStatus : 0,
        });
      } catch {
        // Keep existing local user if token check fails to avoid abrupt UX jumps.
      } finally {
        setIsLoading(false);
      }
    };

    verifyToken();
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
