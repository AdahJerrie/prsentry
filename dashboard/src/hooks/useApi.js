// top of useApi.js, temporarily
console.log("API base URL:", import.meta.env.VITE_API_BASE_URL);
// src/hooks/useApi.js
import { useState, useEffect } from "react";
const BASE_URL = import.meta.env.VITE_API_BASE_URL;
export function useApi(path) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(!!path);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!path) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;

    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${BASE_URL}${path}`);
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, [path]);

  return { data, loading, error };
}