import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "../api/client";

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
    return data.user;
  };

  const register = async (fields) => {
    const { data } = await api.post("/auth/register", fields);
    applyToken(data.token, data.user);
    return data.user;
  };

  const logout = () => applyToken(null, null);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
