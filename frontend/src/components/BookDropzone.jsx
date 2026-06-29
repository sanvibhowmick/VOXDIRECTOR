import React, { useState, useRef } from "react";
import { Upload, Check, Play } from "lucide-react";

const VOICES = [
  { id: "nova",  label: "Nova",  tag: "Warm"  },
  { id: "echo",  label: "Echo",  tag: "Deep"  },
  { id: "aria",  label: "Aria",  tag: "Clear" },
];

/**
 * BookDropzone
 *
 * Props:
 *   onGenerate({ file, title, voice }) — called when the user submits.
 */
export default function BookDropzone({ onGenerate }) {
  const [dragOver, setDragOver]     = useState(false);
  const [file, setFile]             = useState(null);
  const [title, setTitle]           = useState("");
  const [titleError, setTitleError] = useState(false);
  const [voice, setVoice]           = useState("nova");
  const inputRef = useRef(null);

  const processFile = (f) => {
    if (!f) return;
    setFile(f);
    if (!title) {
      const guessed = f.name
        .replace(/\.(txt|pdf|epub|docx)$/i, "")
        .replace(/[-_]/g, " ");
      setTitle(guessed);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    processFile(e.dataTransfer.files[0]);
  };

  const handleFileInput = (e) => processFile(e.target.files[0]);

  const handleSubmit = () => {
    if (!file) return;
    if (!title.trim()) {
      setTitleError(true);
      inputRef.current?.focus();
      return;
    }
    setTitleError(false);
    onGenerate?.({ file, title: title.trim(), voice });
  };

  const handleTitleChange = (e) => {
    setTitle(e.target.value);
    if (titleError) setTitleError(false);
  };

  return (
    <div className="vox-card dz-card">
      <style>{`
        /* ── Drop zone ── */
        .dz-zone {
          border-radius: 14px;
          border: 1.5px dashed var(--line-strong);
          padding: 34px 20px;
          text-align: center;
          cursor: pointer;
          transition: border-color 0.22s ease, background 0.22s ease;
          margin-bottom: 22px;
          outline: none;
        }
        .dz-zone:hover,
        .dz-zone:focus-visible,
        .dz-zone.drag-active {
          border-color: var(--amber);
          border-style: solid;
          background: rgba(200,134,47,0.055);
        }

        /* Icon ring */
        .dz-ring {
          width: 52px; height: 52px;
          border-radius: 50%;
          margin: 0 auto 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(200,134,47,0.09);
          border: 1px solid rgba(200,134,47,0.22);
          transition: background 0.3s ease, border-color 0.3s ease;
        }
        .dz-ring.has-file {
          background: rgba(200,134,47,0.18);
          border-color: rgba(200,134,47,0.42);
        }

        .dz-title {
          font-size: 14.5px;
          font-weight: 500;
          color: var(--ink);
          margin-bottom: 4px;
        }
        .dz-title.uploaded { color: var(--amber); }

        .dz-sub {
          font-size: 12.5px;
          color: var(--ink-dim);
          line-height: 1.6;
        }

        .dz-formats {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 10.5px;
          letter-spacing: 0.5px;
          color: var(--ink-dim);
          opacity: 0.75;
          margin-top: 5px;
        }

        /* ── Voice grid ── */
        .dz-voice-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
        }

        .dz-voice-btn {
          background: rgba(33,28,22,0.025);
          border: 1px solid var(--line);
          border-radius: 10px;
          padding: 10px 6px;
          cursor: pointer;
          text-align: center;
          font-family: inherit;
          transition: border-color 0.18s ease, background 0.18s ease;
          outline: none;
        }
        .dz-voice-btn:hover,
        .dz-voice-btn:focus-visible {
          border-color: var(--line-strong);
        }
        .dz-voice-btn.active {
          background: rgba(200,134,47,0.12);
          border-color: rgba(200,134,47,0.48);
        }

        .dz-voice-name {
          font-size: 13px;
          font-weight: 600;
          color: var(--ink-dim);
          transition: color 0.15s;
        }
        .dz-voice-btn.active .dz-voice-name { color: var(--amber); }

        .dz-voice-tag {
          font-size: 10px;
          color: var(--ink-dim);
          opacity: 0.7;
          margin-top: 2px;
          transition: color 0.15s, opacity 0.15s;
        }
        .dz-voice-btn.active .dz-voice-tag {
          color: var(--rust);
          opacity: 1;
        }
      `}</style>

      {/* ── Drop zone ── */}
      <div
        className={`dz-zone${dragOver ? " drag-active" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => document.getElementById("vox-file-input").click()}
        onKeyDown={(e) => e.key === "Enter" && document.getElementById("vox-file-input").click()}
        role="button"
        tabIndex={0}
        aria-label={file ? `${file.name} — click to change` : "Upload manuscript file"}
      >
        <input
          type="file"
          id="vox-file-input"
          accept=".txt,.pdf,.epub,.docx"
          style={{ display: "none" }}
          onChange={handleFileInput}
        />

        <div className={`dz-ring${file ? " has-file" : ""}`} aria-hidden="true">
          {file
            ? <Check size={22} color="#C8862F" strokeWidth={2.2} />
            : <Upload size={20} color="#C8862F" strokeWidth={1.8} />
          }
        </div>

        {file ? (
          <>
            <div className="dz-title uploaded">{file.name}</div>
            <div className="dz-sub">{(file.size / 1024).toFixed(1)} KB · click to change</div>
          </>
        ) : (
          <>
            <div className="dz-title">Drop your manuscript here</div>
            <div className="dz-sub">or click to browse</div>
            <div className="dz-formats">.TXT · .PDF · .EPUB · .DOCX</div>
          </>
        )}
      </div>

      {/* ── Book title ── */}
      <div className="vox-field">
        <label className="vox-label" htmlFor="vox-title">Book title</label>
        <input
          id="vox-title"
          ref={inputRef}
          className={`vox-input${titleError ? " error" : ""}`}
          placeholder="e.g. Dracula, The Great Gatsby…"
          value={title}
          onChange={handleTitleChange}
        />
        {titleError && (
          <div className="vox-field-error" role="alert">Add a title before generating</div>
        )}
      </div>

      {/* ── Narrator voice ── */}
      
      

      {/* ── Submit ── */}
      <button
        className="vox-btn-primary"
        onClick={handleSubmit}
        disabled={!file}
        style={{ marginTop: 24 }}
      >
        <Play size={14} fill="#FBF8F2" strokeWidth={0} aria-hidden="true" />
        Generate audiobook
      </button>
    </div>
  );
}