import axios from "axios";

const apiBaseUrl = import.meta.env.VITE_API_URL || "http://localhost:4000";

export const api = axios.create({
  baseURL: `${apiBaseUrl}/api`,
  withCredentials: true, // send httpOnly refresh cookie
});

export default api;

// Restore auth token from storage on load
const storedToken = localStorage.getItem("pd_token");
if (storedToken) {
  api.defaults.headers.common["Authorization"] = `Bearer ${storedToken}`;
}

export const toAssetUrl = (url) => {
  if (!url) return "";
  if (url.startsWith("http")) return url;
  return `${apiBaseUrl}${url}`;
};

// --- Silent token refresh on 401 ---
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((p) => (error ? p.reject(error) : p.resolve(token)));
  failedQueue = [];
};

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            original.headers["Authorization"] = `Bearer ${token}`;
            return api(original);
          })
          .catch(Promise.reject.bind(Promise));
      }

      original._retry = true;
      isRefreshing = true;

      try {
        const { data } = await axios.post(
          `${apiBaseUrl}/api/auth/refresh`,
          {},
          { withCredentials: true },
        );
        const newToken = data.token;
        localStorage.setItem("pd_token", newToken);
        api.defaults.headers.common["Authorization"] = `Bearer ${newToken}`;
        processQueue(null, newToken);
        original.headers["Authorization"] = `Bearer ${newToken}`;
        return api(original);
      } catch (refreshError) {
        processQueue(refreshError, null);
        localStorage.removeItem("pd_token");
        window.location.href = "/login";
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  },
);

