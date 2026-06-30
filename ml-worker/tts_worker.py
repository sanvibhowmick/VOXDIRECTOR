import os
import re
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import edge_tts

app = FastAPI(title="VoxDirector TTS Worker (Byte-Stitcher Edition)")


class TTSRequest(BaseModel):
    chunk_id: int
    text: str
    emotion: str


NARRATOR_VOICE = "en-US-AndrewNeural"


EMOTION_SETTINGS = {
    "sadness": {"pitch": "-6Hz", "rate": "-10%"},
    "joy": {"pitch": "+6Hz", "rate": "+8%"},

    # Intimate: lower vocal floor (chest voice), slightly slower cadence
    "love": {"pitch": "-4Hz", "rate": "-5%"},

    # Aggressive: loud, tense, fast delivery
    "anger": {"pitch": "+8Hz", "rate": "+12%"},

    # Panic/Tension: constricted throat (higher pitch!), hurried breath
    "fear": {"pitch": "+8Hz", "rate": "+15%"},

    # Adrenaline spike: quick jump in cadence, sharp pitch lift
    "surprise": {"pitch": "+10Hz", "rate": "+12%"},

    # Baseline narrative anchor
    "neutral": {"pitch": "+0Hz", "rate": "+0%"}
}


async def stream_text_to_bytes(text: str, voice: str, pitch: str, rate: str) -> bytes:
    """Streams live audio frames from Microsoft directly into RAM."""
    communicate = edge_tts.Communicate(
        text,
        voice,
        pitch=pitch,
        rate=rate
    )

    audio_bytes = b""

    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio_bytes += chunk["data"]

    return audio_bytes


@app.post("/synthesize")
async def synthesize_audio(req: TTSRequest):
    print(f"🎙️ Processing Audio for Chunk {req.chunk_id} [{req.emotion.upper()}]")

    has_dialogue = '"' in req.text or '“' in req.text
    settings = EMOTION_SETTINGS.get(
        req.emotion.lower(),
        EMOTION_SETTINGS["neutral"]
    )

    output_dir = os.path.join(os.path.dirname(__file__), "output_audio")
    os.makedirs(output_dir, exist_ok=True)

    output_path = os.path.join(
        output_dir,
        f"chunk_{req.chunk_id}.mp3"
    )

    try:
        final_payload = b""

        if has_dialogue:
            print(f"💬 Dialogue detected in Chunk {req.chunk_id}. Stitching byte streams...")

            parts = re.split(r'([\"“][^\"”]*[\"”])', req.text)

            for part in parts:
                clean_seg = part.strip()

                if not clean_seg:
                    continue

                if clean_seg.startswith(('"', '“')):
                    raw_speech = (
                        clean_seg
                        .replace('"', '')
                        .replace('“', '')
                        .replace('”', '')
                    )

                    # Render ALL speech bytes with the single male dialogue actor
                    final_payload += await stream_text_to_bytes(
                        raw_speech,
                        NARRATOR_VOICE,
                        settings["pitch"],
                        settings["rate"]
                    )

                else:
                    # Render narrative residue bytes neutrally
                    final_payload += await stream_text_to_bytes(
                        clean_seg,
                        NARRATOR_VOICE,
                        "+0Hz",
                        "+0%"
                    )

        else:
            final_payload = await stream_text_to_bytes(
                req.text,
                NARRATOR_VOICE,
                settings["pitch"],
                settings["rate"]
            )

        # Write fused binary directly to disk
        with open(output_path, "wb") as f:
            f.write(final_payload)

        print(f"✅ Audio chunk successfully saved to: {output_path}")

        return {
            "status": "success",
            "file_path": output_path,
            "chunk_id": req.chunk_id
        }

    except Exception as e:
        print(f"❌ TTS Engine crash: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "tts_worker:app",
        host="127.0.0.1",
        port=8001,
        reload=True
    )