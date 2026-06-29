import React, { useState, useEffect, useRef } from "react";
import { Play, Pause, RotateCcw } from "lucide-react";

/* ── Helpers ── */
function parseDuration(d) {
  const [m, s] = (d || "5:00").split(":").map(Number);
  return m * 60 + (s || 0);
}

function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const BAR_HEIGHTS = Array.from({ length: 40 }, () =>
  Math.round(20 + Math.random() * 80)
);

const VOICE_LABELS = {
  nova:  "Nova · Warm",
  echo:  "Echo · Deep",
  aria:  "Aria · Clear",
};

/**
 * MasterPlayer
 *
 * Props:
 *   bookData  — { title, voice }
 *   result    — { duration }   (from LiveProgress onComplete)
 *   onReset   — callback to restart the whole flow
 */
export default function MasterPlayer({ bookData, result, onReset }) {
  const totalSeconds = parseDuration(result?.duration);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const trackRef = useRef(null);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setElapsed((e) => {
        if (e >= totalSeconds) { setPlaying(false); return totalSeconds; }
        return e + 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [playing, totalSeconds]);

  const progress = totalSeconds ? elapsed / totalSeconds : 0;

  const handleSeek = (e) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    setElapsed(Math.round(pct * totalSeconds));
  };

  const handleKeySeek = (e) => {
    if (e.key === "ArrowRight") setElapsed((v) => Math.min(totalSeconds, v + 10));
    if (e.key === "ArrowLeft")  setElapsed((v) => Math.max(0, v - 10));
  };

  const voiceLabel = VOICE_LABELS[bookData?.voice] ?? VOICE_LABELS.nova;

  return (
    <div className="mp-panel">
      <style>{`
        /* ── Panel shell — dark card ── */
        .mp-panel {
          background: var(--void);
          color: var(--bone);
          border-radius: 22px;
          padding: 30px;
          width: 100%;
          max-width: 480px;
          margin: 0 auto;
          box-shadow: 0 24px 60px rgba(20,17,13,0.22);
        }

        /* ── Meta ── */
        .mp-meta { margin-bottom: 22px; }
        .mp-book-title {
          font-family: 'Fraunces', serif;
          font-size: 22px;
          font-weight: 600;
          color: var(--bone);
          margin: 0 0 4px;
          line-height: 1.2;
        }
        .mp-voice {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11px;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          color: var(--amber-lt, #D4A94A);
        }

        /* ── Waveform track ── */
        .mp-track {
          position: relative;
          height: 52px;
          display: flex;
          align-items: center;
          gap: 2.5px;
          cursor: pointer;
          margin-bottom: 10px;
          outline: none;
        }
        .mp-track:focus-visible {
          box-shadow: 0 0 0 2px var(--amber);
          border-radius: 4px;
        }

        .mp-bar {
          width: 2.5px;
          border-radius: 100px;
          background: rgba(243,236,224,0.16);
          flex-shrink: 0;
          transition: background 0.05s linear;
        }
        .mp-bar.played { background: var(--amber); }

        /* ── Time row ── */
        .mp-time-row {
          display: flex;
          justify-content: space-between;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11px;
          color: rgba(243,236,224,0.4);
          margin-bottom: 24px;
        }

        /* ── Controls ── */
        .mp-controls {
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .mp-playbtn {
          width: 54px; height: 54px;
          border-radius: 50%;
          border: none;
          cursor: pointer;
          background: var(--amber);
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.15s ease, background 0.2s ease;
        }
        .mp-playbtn:hover  { background: var(--amber-lt, #D4A94A); }
        .mp-playbtn:active { transform: scale(0.95); }

        /* ── Reset link ── */
        .mp-bottom { display: flex; justify-content: center; margin-top: 24px; }
        .mp-reset {
          display: flex;
          align-items: center;
          gap: 6px;
          background: transparent;
          border: 1px solid rgba(243,236,224,0.16);
          color: rgba(243,236,224,0.5);
          font-family: 'Inter', sans-serif;
          font-size: 12.5px;
          padding: 9px 18px;
          border-radius: 100px;
          cursor: pointer;
          transition: border-color 0.2s ease, color 0.2s ease;
        }
        .mp-reset:hover {
          border-color: rgba(243,236,224,0.35);
          color: var(--bone);
        }
      `}</style>

      {/* Meta */}
      <div className="mp-meta">
        <div className="mp-book-title">{bookData?.title || "Untitled"}</div>
        <div className="mp-voice">{voiceLabel}</div>
      </div>

      {/* Waveform / seek */}
      <div
        className="mp-track"
        ref={trackRef}
        onClick={handleSeek}
        onKeyDown={handleKeySeek}
        role="slider"
        aria-label="Seek"
        tabIndex={0}
        aria-valuenow={Math.round(progress * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={`${formatTime(elapsed)} of ${result?.duration || "0:00"}`}
      >
        {BAR_HEIGHTS.map((h, i) => (
          <div
            key={i}
            className={`mp-bar${i / BAR_HEIGHTS.length < progress ? " played" : ""}`}
            style={{ height: `${h}%` }}
          />
        ))}
      </div>

      {/* Timestamps */}
      <div className="mp-time-row" aria-hidden="true">
        <span>{formatTime(elapsed)}</span>
        <span>{result?.duration || "0:00"}</span>
      </div>

      {/* Play / pause */}
      <div className="mp-controls">
        <button
          className="mp-playbtn"
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing
            ? <Pause size={20} fill="#14110D" strokeWidth={0} />
            : <Play  size={20} fill="#14110D" strokeWidth={0} />
          }
        </button>
      </div>

      {/* Reset */}
      <div className="mp-bottom">
        <button className="mp-reset" onClick={onReset}>
          <RotateCcw size={13} aria-hidden="true" />
          Start a new narration
        </button>
      </div>
    </div>
  );
}