import axios from "axios";
import { clearAdminSession, getAdminToken, setAdminSession } from "./auth";

function resolveApiBaseUrl(url) {
  const defaultUrl = import.meta.env.DEV ? "http://localhost:4000/api" : "https://vaishnavi-silk-emporium.onrender.com/api";
  const trimmed = (url || defaultUrl).replace(/\/$/, "");
  return trimmed.endsWith("/api") ? trimmed : `${trimmed}/api`;
}

const baseURL = resolveApiBaseUrl(import.meta.env.VITE_API_URL);

export const apiBaseUrl = baseURL;

export const api = axios.create({
  baseURL,
  withCredentials: true
});

api.interceptors.request.use((config) => {
  const token = getAdminToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let refreshRequest;

async function refreshAccessToken() {
  if (!refreshRequest) {
    refreshRequest = api
      .post("/auth/refresh", {}, { _skipAuthRefresh: true })
      .then((response) => {
        setAdminSession(response.data.token, response.data.user);
        return response.data.token;
      })
      .finally(() => {
        refreshRequest = null;
      });
  }
  return refreshRequest;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const request = error.config;
    const status = error.response?.status;
    const isAuthEndpoint = request?.url?.startsWith("/auth/");

    if (status !== 401 || request?._retry || request?._skipAuthRefresh || isAuthEndpoint) {
      return Promise.reject(error);
    }

    request._retry = true;
    try {
      const token = await refreshAccessToken();
      request.headers.Authorization = `Bearer ${token}`;
      return api(request);
    } catch (refreshError) {
      clearAdminSession();
      window.dispatchEvent(new Event("admin-session-expired"));
      return Promise.reject(refreshError);
    }
  }
);

export async function restoreAdminSession() {
  const token = getAdminToken();
  if (token) {
    try {
      const response = await api.get("/auth/me", { _skipAuthRefresh: true });
      setAdminSession(token, response.data.user);
      return response.data.user;
    } catch (error) {
      if (![401, 403].includes(error.response?.status)) throw error;
    }
  }
  const response = await api.post("/auth/refresh", {}, { _skipAuthRefresh: true });
  setAdminSession(response.data.token, response.data.user);
  return response.data.user;
}

export async function extendAdminSession() {
  const response = await api.post("/auth/refresh", {}, { _skipAuthRefresh: true });
  setAdminSession(response.data.token, response.data.user);
  return response.data.user;
}
