import React, { useState, useEffect, useRef } from "react";
import { Check } from "lucide-react";
import { subscribeToProgress } from "../services/api";

const STAGES = ["Reading manuscript", "Casting the voice", "Mastering audio"];

/**
 * Enterprise LiveProgress Dashboard
 * Driven by real-time Express Server-Sent Events (SSE).
 */
export default function LiveProgress({ bookData, onComplete }) {
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState("");
  const doneRef = useRef(false);

  // Safely resolve the title string whether App.jsx passes an object or raw text
  const title = typeof bookData === "string" 
    ? bookData 
    : bookData?.title || bookData?.book_title || "Untitled";

  useEffect(() => {
    // 1. Open the live Server-Sent Events (SSE) socket to Express
    const unsubscribe = subscribeToProgress(
      title,
      (incomingPacket) => {
        // Live updates driven strictly by PostgreSQL chunk completion counts!
        setPercent(incomingPacket.percent || 0);
      },
      () => {
        // Express confirmed 100% Byte-Stitching is complete
        if (doneRef.current) return;
        doneRef.current = true;
        
        setTimeout(() => {
          onComplete?.({ duration: "Ready" });
        }, 600); // 600ms buffer to let the final SVG ring animation complete smoothly
      },
      (streamErr) => {
        console.error("⚠️ [SSE Network Drop]:", streamErr);
        setError("Connection interrupted. Synthesis running in background...");
      }
    );

    // Teardown network socket cleanly if the user navigates away or unmounts
    return () => unsubscribe();
  }, [title, onComplete]);

  // Map progress percentage dynamically to the 3 visual production stages
  const stageIndex = percent < 30 ? 0 : percent < 85 ? 1 : 2;
  const circumference = 2 * Math.PI * 54;
  const offset = circumference * (1 - percent / 100);

  return (
    <div className="vox-card lp-card">
      <style>{`
        .lp-card { text-align: center; }

        /* ── Ring ── */
        .lp-ring-wrap {
          position: relative;
          width: 132px; height: 132px;
          margin: 4px auto 22px;
        }
        .lp-ring-wrap svg { transform: rotate(-90deg); display: block; }

        .lp-pct {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 22px;
          font-weight: 500;
          color: var(--ink);
        }

        /* ── Text ── */
        .lp-title {
          font-size: 15px;
          font-weight: 600;
          color: var(--ink);
          margin-bottom: 4px;
        }
        .lp-sub {
          font-size: 12.5px;
          color: var(--amber);
          font-weight: 500;
          margin-bottom: 24px;
          min-height: 18px;
        }

        /* ── Stage list ── */
        .lp-stages {
          list-style: none;
          padding: 0;
          margin: 0 0 24px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          text-align: left;
        }
        .lp-stage {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 13.5px;
          color: var(--ink-dim);
          transition: color 0.2s ease;
        }
        .lp-stage.done   { color: var(--ink); }
        .lp-stage.active { color: var(--amber); font-weight: 500; }

        .lp-stage-icon {
          width: 18px; height: 18px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1.5px solid var(--line-strong);
          flex-shrink: 0;
          transition: background 0.2s ease, border-color 0.2s ease;
        }
        .lp-stage.done   .lp-stage-icon { background: var(--amber); border-color: var(--amber); }
        .lp-stage.active .lp-stage-icon {
          border-color: var(--amber);
          animation: lpPulse 1.4s ease-in-out infinite;
        }
        @keyframes lpPulse {
          0%, 100% { box-shadow: 0 0 0 0   rgba(200,134,47,0.3); }
          50%       { box-shadow: 0 0 0 5px rgba(200,134,47,0);   }
        }

        /* ── Waveform bars ── */
        .lp-bars {
          display: flex;
          align-items: flex-end;
          justify-content: center;
          gap: 3px;
          height: 22px;
        }
        .lp-bar {
          width: 3px;
          border-radius: 100px;
          background: var(--amber);
          animation: lpWave 1s ease-in-out infinite;
        }
        @keyframes lpWave {
          0%, 100% { transform: scaleY(0.25); }
          50%       { transform: scaleY(1);    }
        }

        @media (prefers-reduced-motion: reduce) {
          .lp-stage.active .lp-stage-icon,
          .lp-bar { animation: none; }
        }
      `}</style>

      {/* Progress ring */}
      <div
        className="lp-ring-wrap"
        role="progressbar"
        aria-valuenow={Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Narration progress"
      >
        <svg width="132" height="132" viewBox="0 0 132 132" aria-hidden="true">
          <circle
            cx="66" cy="66" r="54"
            fill="none"
            strokeWidth="8"
            stroke="var(--line)"
          />
          <circle
            cx="66" cy="66" r="54"
            fill="none"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            stroke="var(--amber)"
            style={{ transition: "stroke-dashoffset 0.3s cubic-bezier(0.4, 0, 0.2, 1)" }}
          />
        </svg>
        <div className="lp-pct">{Math.round(percent)}%</div>
      </div>

      <div className="lp-title">
        Narrating "{title}"
      </div>
      <div className="lp-sub" aria-live="polite">
        {error ? <span style={{ color: "#d32f2f" }}>{error}</span> : `${STAGES[stageIndex]}…`}
      </div>

      {/* Stage checklist */}
      <ul className="lp-stages">
        {STAGES.map((s, i) => {
          const state = i < stageIndex ? "done" : i === stageIndex ? "active" : "";
          return (
            <li key={s} className={`lp-stage${state ? ` ${state}` : ""}`}>
              <span className="lp-stage-icon" aria-hidden="true">
                {i < stageIndex && (
                  <Check size={11} color="#FBF8F2" strokeWidth={3} />
                )}
              </span>
              {s}
            </li>
          );
        })}
      </ul>

      {/* Waveform */}
      <div className="lp-bars" aria-hidden="true">
        {Array.from({ length: 9 }, (_, i) => (
          <div
            key={i}
            className="lp-bar"
            style={{ height: 22, animationDelay: `${i * 0.08}s` }}
          />
        ))}
      </div>
    </div>
  );
}