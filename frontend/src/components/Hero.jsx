import React from "react";

/**
 * Hero — text-only header block.
 * The full-page background image is set on .app-bg in App.jsx / globals.css.
 * This component just renders the headline, subtext, and CTAs.
 *
 * Props:
 *   compact  — boolean. Collapses to title-only strip.
 *   onStart  — callback for the primary CTA button.
 */
export default function Hero({ compact = false, onStart }) {
  return (
    <header className={`hr-wrap${compact ? " compact" : ""}`}>
      <style>{`
        .hr-wrap {
          text-align: center;
          padding: 80px 24px 72px;
          max-width: 640px;
          margin: 0 auto;
        }

        /* Eyebrow */
        .hr-eyebrow {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 10px;
          font-weight: 500;
          letter-spacing: 4px;
          text-transform: uppercase;
          color: #D4A94A;
          margin-bottom: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          max-height: 32px;
          opacity: 1;
          overflow: hidden;
          transition: max-height 0.3s ease, opacity 0.3s ease, margin 0.3s ease;
        }
        .hr-wrap.compact .hr-eyebrow { max-height: 0; opacity: 0; margin: 0; }

        .hr-eyebrow-line {
          display: block;
          width: 32px; height: 1px;
          background: #D4A94A;
          opacity: 0.5;
          flex-shrink: 0;
        }

        /* Headline */
        .hr-headline {
          font-family: 'Fraunces', serif;
          font-weight: 600;
          font-size: clamp(42px, 7.5vw, 72px);
          line-height: 1.04;
          letter-spacing: -1.5px;
          color: #F7EDD2;
          margin-bottom: 18px;
          text-shadow: 0 2px 24px rgba(13,10,6,0.5);
          transition: font-size 0.35s ease, margin 0.35s ease;
        }
        .hr-wrap.compact .hr-headline {
          font-size: clamp(22px, 4vw, 30px);
          margin-bottom: 0;
          text-shadow: none;
        }
        .hr-headline em {
          font-style: italic;
          font-weight: 300;
          color: #D4A94A;
        }

        /* Subtext */
        .hr-sub {
          font-size: 15.5px;
          font-weight: 300;
          color: rgba(243,236,224,0.68);
          line-height: 1.65;
          max-width: 380px;
          margin: 0 auto 36px;
          max-height: 60px;
          opacity: 1;
          overflow: hidden;
          transition: max-height 0.3s ease, opacity 0.3s ease, margin 0.3s ease;
        }
        .hr-wrap.compact .hr-sub { max-height: 0; opacity: 0; margin: 0; }

        /* CTA row */
        .hr-ctas {
          display: flex;
          gap: 12px;
          justify-content: center;
          flex-wrap: wrap;
          max-height: 60px;
          opacity: 1;
          overflow: hidden;
          transition: max-height 0.3s ease, opacity 0.3s ease;
        }
        .hr-wrap.compact .hr-ctas { max-height: 0; opacity: 0; }

        .hr-btn-primary {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 2.5px;
          text-transform: uppercase;
          background: #D4A94A;
          color: #1A1209;
          border: none;
          padding: 14px 32px;
          border-radius: 2px;
          cursor: pointer;
          transition: background 0.2s ease, transform 0.15s ease;
        }
        .hr-btn-primary:hover  { background: #E8C060; }
        .hr-btn-primary:active { transform: scale(0.97); }

        .hr-btn-ghost {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 2.5px;
          text-transform: uppercase;
          background: transparent;
          color: #F3ECE0;
          border: 1px solid rgba(243,236,224,0.28);
          padding: 14px 32px;
          border-radius: 2px;
          cursor: pointer;
          transition: border-color 0.2s ease;
        }
        .hr-btn-ghost:hover { border-color: rgba(243,236,224,0.60); }

        @media (max-width: 480px) {
          .hr-wrap { padding: 60px 20px 52px; }
        }
      `}</style>

      <p className="hr-eyebrow" aria-hidden={compact}>
        <span className="hr-eyebrow-line" />
        Manuscript to audio
        <span className="hr-eyebrow-line" />
      </p>

      <h1 className="hr-headline">
        Give your manuscript{!compact && <br />}{" "}
        <em>a voice.</em>
      </h1>

      <p className="hr-sub">
        Upload a file and your words become a world.
      </p>

      <div className="hr-ctas">
        <button className="hr-btn-primary" onClick={onStart}>
          Start narrating
        </button>
        <button className="hr-btn-ghost">
          Hear a sample
        </button>
      </div>
    </header>
  );
}