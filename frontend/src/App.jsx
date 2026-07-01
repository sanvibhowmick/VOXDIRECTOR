import React, { useState } from "react";
import Navbar from "./components/Navbar";
import Hero from "./components/Hero";
import BookDropzone from "./components/BookDropzone";
import LiveProgress from "./components/Liveprogress";
import MasterPlayer from "./components/Masterplayer";
import "./globals.css";
import heroImg from "./dist/image.jpg";
import { uploadManuscript } from "./services/api";

export default function App() {
  const [screen,   setScreen]   = useState("home");
  const [bookData, setBookData] = useState(null);
  const [result,   setResult]   = useState(null);
 
  const navStatus = { home: "idle", generating: "generating", player: "ready" }[screen];
 
  /**
   * BINARY RELAY: Ships physical hard drive File object directly to Express Multer
   */
  const handleGenerate = async ({ file, title, voice }) => {
    setBookData({ title, voice });
    setScreen("generating");

    try {
      console.log(`🚀 [App.jsx] Transmitting binary "${file.name}" to Express Gateway...`);
      await uploadManuscript(file, title, voice);
    } catch (err) {
      console.error("❌ Transmission failed:", err);
      alert(`Failed to send manuscript to server:\n${err.message}`);
      setScreen("home");
    }
  };

  const handleComplete = (res)  => { setResult(res);    setScreen("player");     };
  const handleReset    = ()     => { setBookData(null); setResult(null); setScreen("home"); };
 
  const scrollToMain = () =>
    document.getElementById("main-content")?.scrollIntoView({ behavior: "smooth" });
 
  return (
    <div className="app-root">
 
      {/* ── Full-page fixed background ── */}
      <div className="app-bg">
        <img src={heroImg} alt="" aria-hidden="true" className="app-bg-img" />
        <div className="app-bg-veil" />
      </div>
 
      {/* ── Navbar ── */}
      <Navbar status={navStatus} dark />
 
      {/* ── Hero headline (text only, floats over image) ── */}
      <header className="app-hero">
        <p className="app-eyebrow">
          <span className="app-eyebrow-line" />
          Manuscript to audio
          <span className="app-eyebrow-line" />
        </p>
        <h1 className="app-headline">
          Give your manuscript<br />
          <em>a voice.</em>
        </h1>
        <p className="app-sub">
          Upload a file, choose a narrator, and your words become a world.
        </p>
        <button className="app-cta-primary" onClick={scrollToMain}>
          Start narrating
        </button>
      </header>
 
      {/* ── Main content floats over background ── */}
      <main id="main-content" className="app-main">
 
        {screen === "home" && (
          <>
            <SectionLabel text="How it works" />
            <div className="app-steps">
              {[
                { num: "01", title: "Upload",   desc: "PDF, DOCX, TXT, or EPUB — any length." },
                { num: "02", title: "Download", desc: "Chapter-split MP3s, ready to share."   },
              ].map((s) => (
                <div key={s.num} className="app-step-card">
                  <div className="app-step-num">{s.num}</div>
                  <div className="app-step-title">{s.title}</div>
                  <div className="app-step-desc">{s.desc}</div>
                </div>
              ))}
            </div>
 
            <SectionLabel text="Your manuscript" />
            <BookDropzone onGenerate={handleGenerate} />
          </>
        )}
 
        {screen === "generating" && (
          <LiveProgress bookData={bookData} onComplete={handleComplete} />
        )}
 
        {screen === "player" && (
          <MasterPlayer bookData={bookData} result={result} onReset={handleReset} />
        )}
      </main>
 
      <footer className="app-footer">
        Vox Director — manuscript narration studio
      </footer>
    </div>
  );
}
 
function SectionLabel({ text }) {
  return (
    <p className="app-section-label">
      {text}
      <span className="app-section-line" />
    </p>
  );
}