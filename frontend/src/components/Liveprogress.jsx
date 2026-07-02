import React, { useState, useEffect } from "react";
import { Check } from "lucide-react";
import { checkJobStatus, getAudioUrl } from "../services/api";

const STAGES = ["Reading manuscript", "Casting the voice", "Mastering audio"];

// 🆕 Accept onReset as a prop
export default function LiveProgress({ bookData, onComplete, onReset }) {
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState("");
  const [isDead, setIsDead] = useState(false); // 🆕 Track if the job completely failed

  const title = typeof bookData === "string" 
    ? bookData 
    : bookData?.title || "Untitled";

  useEffect(() => {
    if (!title || isDead) return;

    const interval = setInterval(async () => {
      try {
        const data = await checkJobStatus(title);
        
        if (data.percent !== undefined) setPercent(data.percent);

        // 🆕 Handle the dead job state from the backend
        if (data.status === 'failed') {
            clearInterval(interval);
            setIsDead(true);
            setError(`Generation failed. ${data.failed} chunks could not be processed.`);
            return;
        }

        if (data.status === 'completed' || data.status === 'READY') {
          clearInterval(interval);
          
          setTimeout(() => {
            onComplete?.({ 
              duration: "Ready",
              audioUrl: data.cloudUrl || getAudioUrl(title) 
            });
          }, 600);
        }
      } catch (err) {
        console.error("Polling error:", err);
        setError("Connection interrupted. Trying to reconnect...");
      }
    }, 5000); 

    return () => clearInterval(interval);
  }, [title, onComplete, isDead]);

  const stageIndex = percent < 30 ? 0 : percent < 85 ? 1 : 2;
  const circumference = 2 * Math.PI * 54;
  const offset = circumference * (1 - percent / 100);

  return (
    <div className="vox-card lp-card">
      <style>{`
        /* ... Keep all your existing CSS exactly the same ... */
        .lp-card { 
          text-align: center; 
          padding: 32px 24px;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .lp-ring-wrap {
          position: relative;
          width: 132px; height: 132px;
          margin: 0 auto 24px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .lp-ring-wrap svg { 
          position: absolute;
          top: 0; left: 0;
          transform: rotate(-90deg); 
        }

        .lp-pct {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 26px;
          font-weight: 600;
          color: var(--ink);
          letter-spacing: -1px;
          z-index: 2;
        }

        .lp-title {
          font-size: 16px;
          font-weight: 600;
          color: var(--ink);
          margin-bottom: 6px;
          line-height: 1.4;
          width: 100%;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        
        .lp-sub {
          font-size: 13px;
          color: var(--amber);
          font-weight: 500;
          margin-bottom: 28px;
          min-height: 18px;
          line-height: 1.4;
        }

        .lp-stages {
          list-style: none;
          padding: 0;
          margin: 0 0 28px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          text-align: left;
          width: 100%;
          max-width: 220px;
        }
        .lp-stage {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 14px;
          color: var(--ink-dim);
          transition: color 0.2s ease;
        }
        .lp-stage.done   { color: var(--ink); }
        .lp-stage.active { color: var(--amber); font-weight: 500; }

        .lp-stage-icon {
          width: 20px; height: 20px;
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
          50%      { box-shadow: 0 0 0 6px rgba(200,134,47,0);   }
        }

        .lp-bars {
          display: flex;
          align-items: flex-end;
          justify-content: center;
          gap: 4px;
          height: 24px;
          margin-bottom: 20px;
        }
        .lp-bar {
          width: 3px;
          border-radius: 100px;
          background: var(--amber);
          animation: lpWave 1s ease-in-out infinite;
        }
        @keyframes lpWave {
          0%, 100% { transform: scaleY(0.25); }
          50%      { transform: scaleY(1);    }
        }
        
        /* 🆕 CSS for the escape hatch button */
        .lp-cancel-btn {
          background: none;
          border: 1px solid var(--line-strong);
          color: var(--ink-dim);
          font-size: 12px;
          padding: 8px 16px;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .lp-cancel-btn:hover {
          color: var(--rust);
          border-color: var(--rust);
          background: rgba(211, 47, 47, 0.05);
        }
      `}</style>
      
      <div
        className="lp-ring-wrap"
        role="progressbar"
        aria-valuenow={Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <svg width="132" height="132" viewBox="0 0 132 132" aria-hidden="true">
          <circle cx="66" cy="66" r="54" fill="none" strokeWidth="8" stroke="var(--line)" />
          {/* 🆕 If the job is dead, turn the ring red (var(--rust)) to indicate failure */}
          <circle cx="66" cy="66" r="54" fill="none" strokeWidth="8" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} stroke={isDead ? "var(--rust)" : "var(--amber)"} style={{ transition: "stroke-dashoffset 0.3s cubic-bezier(0.4, 0, 0.2, 1)" }} />
        </svg>
        <div className="lp-pct">{Math.round(percent)}%</div>
      </div>

      <div className="lp-title">Narrating "{title}"</div>
      <div className="lp-sub" aria-live="polite">
        {error ? <span style={{ color: "var(--rust)" }}>{error}</span> : `${STAGES[stageIndex]}...`}
      </div>

      <ul className="lp-stages">
        {STAGES.map((s, i) => (
          <li key={s} className={`lp-stage ${i < stageIndex ? "done" : i === stageIndex && !isDead ? "active" : ""}`}>
            <span className="lp-stage-icon">
              {i < stageIndex && <Check size={12} color="#FBF8F2" strokeWidth={3} />}
            </span>
            {s}
          </li>
        ))}
      </ul>

      {/* Hide the waveform if the job is dead */}
      {!isDead && (
        <div className="lp-bars" aria-hidden="true">
          {Array.from({ length: 9 }, (_, i) => (
            <div key={i} className="lp-bar" style={{ height: 24, animationDelay: `${i * 0.08}s` }} />
          ))}
        </div>
      )}

      {/* 🆕 The Escape Hatch */}
      <button className="lp-cancel-btn" onClick={onReset}>
        {isDead ? "Return Home" : "Cancel Generation"}
      </button>

    </div>
  );
}