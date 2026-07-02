// frontend/src/services/api.js
const API_BASE = "https://voxdirector-backend.onrender.com";

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
  return res.json(); // This now returns instantly with your "Ticket"
};

// 🆕 REPLACED SSE WITH A BULLETPROOF POLLING FETCH
export const checkJobStatus = async (title) => {
  const res = await fetch(`${API_BASE}/api/status/${encodeURIComponent(title)}`);
  if (!res.ok) throw new Error("Failed to fetch status");
  return res.json();
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