import React from "react";

const STATUS_META = {
  idle:       { label: "Ready",      color: "rgba(107,90,68,0.7)" },
  generating: { label: "Narrating…", color: "#C8862F"             },
  ready:      { label: "Done",       color: "#4A9C6F"             },
};

/**
 * Navbar
 *
 * Props:
 *   status  — "idle" | "generating" | "ready"
 *   dark    — boolean. Pass true when rendered over the Hero image
 *             (Hero.jsx compact mode) so text and lines invert.
 */
export default function Navbar({ status = "idle", dark = false }) {
  const meta = STATUS_META[status] ?? STATUS_META.idle;

  return (
    <nav
      className="nv-wrap"
      style={{
        "--nv-border": dark ? "rgba(245,237,216,0.12)" : "rgba(33,28,22,0.10)",
        "--nv-word-color": dark ? "#F7EDD2" : "var(--ink)",
      }}
    >
      <style>{`
        .nv-wrap {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 22px 32px;
          border-bottom: 1px solid var(--nv-border);
          position: relative;
          z-index: 10;
        }

        .nv-brand {
          display: flex;
          align-items: center;
          gap: 9px;
          text-decoration: none;
        }

        .nv-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: var(--amber);
          flex-shrink: 0;
        }
        .nv-dot.pulse {
          animation: nvPulse 2.6s ease-in-out infinite;
        }
        @keyframes nvPulse {
          0%   { box-shadow: 0 0 0 0   rgba(200,134,47,0.5); }
          70%  { box-shadow: 0 0 0 7px rgba(200,134,47,0);   }
          100% { box-shadow: 0 0 0 0   rgba(200,134,47,0);   }
        }

        .nv-word {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 12.5px;
          font-weight: 500;
          letter-spacing: 3px;
          text-transform: uppercase;
          color: var(--nv-word-color);
        }

        .nv-status-pill {
          display: flex;
          align-items: center;
          gap: 6px;
          font-family: 'IBM Plex Mono', monospace;
          font-size: 10.5px;
          letter-spacing: 1.5px;
          text-transform: uppercase;
        }

        .nv-status-dot {
          width: 5px;
          height: 5px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        @media (prefers-reduced-motion: reduce) {
          .nv-dot.pulse { animation: none; }
        }

        @media (max-width: 480px) {
          .nv-wrap { padding: 18px 20px; }
        }
      `}</style>

      <div className="nv-brand">
        <span className={`nv-dot${status === "generating" ? " pulse" : ""}`} />
        <span className="nv-word">VoxDirector</span>
      </div>

      <div
        className="nv-status-pill"
        aria-live="polite"
        style={{ color: meta.color }}
      >
        <span className="nv-status-dot" style={{ background: meta.color }} />
        {meta.label}
      </div>
    </nav>
  );
}