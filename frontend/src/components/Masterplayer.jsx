import React, { useState, useRef } from "react";
import { Play, Pause, RotateCcw, Download, Loader2 } from "lucide-react";
import { cleanupBookFiles } from "../services/api";

/* ── Helpers ── */
function formatTime(totalSeconds) {
  if (isNaN(totalSeconds) || totalSeconds < 0) return "0:00";
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const BAR_HEIGHTS = Array.from({ length: 40 }, () =>
  Math.round(20 + Math.random() * 80)
);

export default function MasterPlayer({ bookData, result, onReset }) {
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false); 
  
  const trackRef = useRef(null);
  const audioRef = useRef(null); 

  const handleTimeUpdate = () => {
    if (audioRef.current) setElapsed(audioRef.current.currentTime);
  };
  const handleLoadedMetadata = () => {
    if (audioRef.current) setDuration(audioRef.current.duration);
  };
  const handleEnded = () => setPlaying(false);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setPlaying(!playing);
  };

  const progress = duration > 0 ? elapsed / duration : 0;

  const handleSeek = (e) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || !audioRef.current) return;
    const pct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const newTime = pct * duration;
    
    audioRef.current.currentTime = newTime;
    setElapsed(newTime);
  };

  // ── DELETE & RESET LOGIC ──
  const handleCleanupAndReset = async () => {
    const titleToDelete = result?.bookTitle || bookData?.title;
    if (titleToDelete) {
      console.log(`🗑️ Asking server to delete: ${titleToDelete}`);
      await cleanupBookFiles(titleToDelete); // Using the centralized API service
    }
    
    if (audioRef.current) audioRef.current.pause();
    onReset();
  };

  // ── SECURE DOWNLOAD & DELETE LOGIC ──
  const handleDownload = async (e) => {
    e.preventDefault();
    if (isDownloading) return;
    
    setIsDownloading(true);
    
    try {
      // Fetch file into browser RAM
      const res = await fetch(result?.audioUrl);
      const blob = await res.blob();
      
      // Trigger secure download
      const localUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = localUrl;
      a.download = `VoxDirector_${bookData?.title || "Audiobook"}.mp3`;
      document.body.appendChild(a);
      a.click();
      
      // Cleanup browser memory
      window.URL.revokeObjectURL(localUrl);
      document.body.removeChild(a);

      
    } catch (err) {
      console.error("Failed to download or clean up:", err);
      alert("Failed to download the file. It may have already been deleted.");
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="mp-panel">
      <style>{`
        .mp-panel {
          background: var(--void); color: var(--bone);
          border-radius: 22px; padding: 30px;
          width: 100%; max-width: 480px; margin: 0 auto;
          box-shadow: 0 24px 60px rgba(20,17,13,0.22);
        }
        .mp-meta { margin-bottom: 22px; }
        .mp-book-title {
          font-family: 'Fraunces', serif; font-size: 22px;
          font-weight: 600; color: var(--bone);
          margin: 0 0 4px; line-height: 1.2;
        }
        .mp-voice {
          font-family: 'IBM Plex Mono', monospace; font-size: 11px;
          letter-spacing: 1.5px; text-transform: uppercase;
          color: var(--amber-lt, #D4A94A);
        }
        .mp-track {
          position: relative; height: 52px; display: flex;
          align-items: center; gap: 2.5px; cursor: pointer;
          margin-bottom: 10px; outline: none;
        }
        .mp-bar {
          width: 2.5px; border-radius: 100px;
          background: rgba(243,236,224,0.16); flex-shrink: 0;
          transition: background 0.05s linear;
        }
        .mp-bar.played { background: var(--amber); }
        .mp-time-row {
          display: flex; justify-content: space-between;
          font-family: 'IBM Plex Mono', monospace; font-size: 11px;
          color: rgba(243,236,224,0.4); margin-bottom: 24px;
        }
        .mp-controls {
          display: flex; align-items: center; justify-content: center; gap: 20px;
        }
        .mp-playbtn {
          width: 54px; height: 54px; border-radius: 50%;
          border: none; cursor: pointer; background: var(--amber);
          display: flex; align-items: center; justify-content: center;
          transition: transform 0.15s ease, background 0.2s ease;
        }
        .mp-playbtn:hover  { background: var(--amber-lt, #D4A94A); }
        .mp-playbtn:active { transform: scale(0.95); }
        
        .mp-dlbtn {
          width: 44px; height: 44px; border-radius: 50%;
          border: 1px solid rgba(243,236,224,0.16); background: transparent;
          color: var(--bone); cursor: pointer; display: flex;
          align-items: center; justify-content: center; text-decoration: none;
          transition: all 0.2s ease;
        }
        .mp-dlbtn:hover:not(:disabled) { border-color: rgba(243,236,224,0.35); }
        .mp-dlbtn:disabled { opacity: 0.5; cursor: not-allowed; }

        .mp-bottom { display: flex; justify-content: center; margin-top: 24px; }
        .mp-reset {
          display: flex; align-items: center; gap: 6px;
          background: transparent; border: 1px solid rgba(243,236,224,0.16);
          color: rgba(243,236,224,0.5); font-family: 'Inter', sans-serif;
          font-size: 12.5px; padding: 9px 18px; border-radius: 100px;
          cursor: pointer; transition: border-color 0.2s, color 0.2s;
        }
        .mp-reset:hover { border-color: rgba(243,236,224,0.35); color: var(--bone); }
        
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}</style>

      {/* HIDDEN HTML5 AUDIO ELEMENT */}
      <audio 
        ref={audioRef} 
        src={result?.audioUrl} 
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
      />

      <div className="mp-meta">
        <div className="mp-book-title">{bookData?.title || "Untitled"}</div>
        {bookData?.voice && <div className="mp-voice">{bookData.voice}</div>}
      </div>

      <div
        className="mp-track"
        ref={trackRef}
        onClick={handleSeek}
        role="slider"
        tabIndex={0}
      >
        {BAR_HEIGHTS.map((h, i) => (
          <div
            key={i}
            className={`mp-bar${i / BAR_HEIGHTS.length < progress ? " played" : ""}`}
            style={{ height: `${h}%` }}
          />
        ))}
      </div>

      <div className="mp-time-row" aria-hidden="true">
        <span>{formatTime(elapsed)}</span>
        <span>{formatTime(duration)}</span>
      </div>

      <div className="mp-controls">
        <button className="mp-playbtn" onClick={togglePlay}>
          {playing
            ? <Pause size={20} fill="#14110D" strokeWidth={0} />
            : <Play  size={20} fill="#14110D" strokeWidth={0} />
          }
        </button>

        {result?.audioUrl && (
          <button 
            className="mp-dlbtn" 
            onClick={handleDownload}
            disabled={isDownloading}
            title="Download MP3 & Close"
          >
            {isDownloading ? <Loader2 size={18} className="spin" /> : <Download size={18} />}
          </button>
        )}
      </div>

      <div className="mp-bottom">
        <button className="mp-reset" onClick={handleCleanupAndReset}>
          <RotateCcw size={13} aria-hidden="true" />
          Close and Delete File
        </button>
      </div>
    </div>
  );
}