// frontend/src/services/api.js
const API_BASE = "http://localhost:5000";

export const uploadManuscript = async (file, title, voice) => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("title", title);
  formData.append("voice", voice);

  const res = await fetch(`${API_BASE}/api/process-book`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `Server responded with ${res.status}`);
  }
  return res.json();
};

export const subscribeToProgress = (title, onProgress, onComplete, onError) => {
  const es = new EventSource(`${API_BASE}/api/status/${encodeURIComponent(title)}`);

  es.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      onProgress(data);
      if (data.status === "READY") {
        es.close();
        onComplete(data);
      }
    } catch (err) {
      console.error("Failed to parse SSE data", err);
    }
  };

  es.onerror = (err) => {
    es.close();
    if (onError) onError(err);
  };

  return () => es.close();
};

// NEW: Centralized Cleanup API
export const cleanupBookFiles = async (title) => {
  try {
    const res = await fetch(`${API_BASE}/api/cleanup/${encodeURIComponent(title)}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error("Cleanup request failed");
    return true;
  } catch (err) {
    console.error("Cleanup error:", err);
    return false;
  }
};

// Helper to get the direct file URL
export const getAudioUrl = (title) => {
  return `${API_BASE}/master_audiobooks/${encodeURIComponent(title)}.mp3`;
};