async function request(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `요청 실패 (${response.status})`);
  }
  return payload;
}

export const api = {
  state: () => request("/api/state"),
  repository: () => request("/api/repository"),
  commitPush: (body) =>
    request("/api/repository/commit-push", {
      method: "POST",
      body: JSON.stringify(body)
    }),
  analyze: (body) =>
    request("/api/analyze", { method: "POST", body: JSON.stringify(body) }),
  preview: (body) =>
    request("/api/preview", { method: "POST", body: JSON.stringify(body) }),
  apply: (body) =>
    request("/api/apply", { method: "POST", body: JSON.stringify(body) }),

  // Review Queue API
  reviewQueue: () => request("/api/review/queue"),
  reviewItem: (body) =>
    request("/api/review/item", { method: "POST", body: JSON.stringify(body) }),
  reviewStatus: (body) =>
    request("/api/review/status", { method: "POST", body: JSON.stringify(body) }),
  reviewPreview: (body) =>
    request("/api/review/preview", { method: "POST", body: JSON.stringify(body) }),
  reviewApply: (body) =>
    request("/api/review/apply", { method: "POST", body: JSON.stringify(body) }),

  kauJob: () => request("/api/kau/job"),
  kauRefresh: () => request("/api/kau/refresh", { method: "POST" }),
  kauCacheUrl: (cacheKey) => `/api/kau/cache?key=${encodeURIComponent(cacheKey)}`,

  // Instagram API
  instagramFetch: () => request('/api/instagram/fetch', { method: 'POST' }),
  instagramQueue: () => request('/api/instagram/queue'),
};
