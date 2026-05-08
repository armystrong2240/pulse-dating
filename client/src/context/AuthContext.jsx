import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "../api/client";
import { registerPushNotifications, unregisterPushNotifications } from "../api/push";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const applyToken = useCallback((tok, usr) => {
    setUser(usr);
    if (tok) {
      localStorage.setItem("pd_token", tok);
      api.defaults.headers.common["Authorization"] = `Bearer ${tok}`;
    } else {
      localStorage.removeItem("pd_token");
      delete api.defaults.headers.common["Authorization"];
    }
  }, []);

  // Restore session on mount
  useEffect(() => {
    const stored = localStorage.getItem("pd_token");
    if (!stored) {
      setLoading(false);
      return;
    }
    api.defaults.headers.common["Authorization"] = `Bearer ${stored}`;
    api
      .get("/auth/me")
      .then(({ data }) => setUser(data))
      .catch(() => applyToken(null, null))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    applyToken(data.token, data.user);
    registerPushNotifications();
    return data.user;
  };

  const register = async (fields) => {
    const { data } = await api.post("/auth/register", fields);
    applyToken(data.token, data.user);
    registerPushNotifications();
    return data.user;
  };

  const logout = async () => {
    unregisterPushNotifications();
    try {
      await api.post("/auth/logout");
    } catch {
      // ignore — server may already be unreachable; clear client state regardless
    }
    applyToken(null, null);
  };

  const loginWithFacebook = async (fbAccessToken) => {
    const { data } = await api.post("/auth/facebook", { accessToken: fbAccessToken });
    applyToken(data.token, data.user);
    registerPushNotifications();
    return data.user;
  };

  const requestMagicLink = async (email) => {
    const { data } = await api.post("/auth/magic-link/request", { email });
    return data;
  };

  const loginWithMagicLink = async (token) => {
    const { data } = await api.post("/auth/magic-link/verify", { token });
    applyToken(data.token, data.user);
    registerPushNotifications();
    return data.user;
  };

  const requestPhoneOtp = async (phone) => {
    const { data } = await api.post("/auth/phone-otp/request", { phone });
    return data;
  };

  const loginWithPhoneOtp = async (phone, code) => {
    const { data } = await api.post("/auth/phone-otp/verify", { phone, code });
    applyToken(data.token, data.user);
    registerPushNotifications();
    return data.user;
  };

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      login,
      register,
      logout,
      loginWithFacebook,
      requestMagicLink,
      loginWithMagicLink,
      requestPhoneOtp,
      loginWithPhoneOtp,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
