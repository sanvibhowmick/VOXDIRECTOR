import os
import re
import base64
import asyncio
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import edge_tts

app = FastAPI(title="VoxDirector TTS Worker (Byte-Stitcher Edition)")

# Global semaphore: Limits concurrent WebSocket connections to Microsoft Edge-TTS to 2.
# This prevents IP rate-limiting, connection drops, and "No audio was received" errors.
TTS_SEMAPHORE = asyncio.Semaphore(2)


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


async def stream_text_to_bytes(text: str, voice: str, pitch: str, rate: str, max_retries: int = 2) -> bytes:
    """Streams live audio frames from Microsoft directly into RAM with retries and parameter fallback."""
    clean = text.strip()
    # Skip empty or non-alphanumeric text (e.g. lone quotation marks or dashes) to prevent Microsoft stream rejections
    if not clean or not any(c.isalnum() for c in clean):
        return b""

    for attempt in range(max_retries + 1):
        try:
            communicate = edge_tts.Communicate(
                clean,
                voice,
                pitch=pitch,
                rate=rate
            )

            audio_bytes = b""
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    audio_bytes += chunk["data"]

            if audio_bytes:
                return audio_bytes

            if attempt < max_retries:
                await asyncio.sleep(0.5 * (attempt + 1))

        except Exception as e:
            if attempt < max_retries:
                await asyncio.sleep(0.5 * (attempt + 1))
            else:
                # If customized pitch/rate triggered a parameter rejection, fallback to default voice parameters
                if pitch != "+0Hz" or rate != "+0%":
                    try:
                        print(f"⚠️ Retrying '{clean[:25]}...' with baseline neutral pitch/rate fallback...")
                        communicate = edge_tts.Communicate(clean, voice)
                        fallback_bytes = b""
                        async for chunk in communicate.stream():
                            if chunk["type"] == "audio":
                                fallback_bytes += chunk["data"]
                        if fallback_bytes:
                            return fallback_bytes
                    except Exception:
                        pass
                raise e

    return b""


@app.post("/synthesize")
async def synthesize_audio(req: TTSRequest):
    print(f"🎙️ Processing Audio for Chunk {req.chunk_id} [{req.emotion.upper()}]")

    has_dialogue = '"' in req.text or '“' in req.text
    settings = EMOTION_SETTINGS.get(
        req.emotion.lower(),
        EMOTION_SETTINGS["neutral"]
    )

    async with TTS_SEMAPHORE:
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
                            .strip()
                        )

                        if any(c.isalnum() for c in raw_speech):
                            # Render ALL speech bytes with the dialogue configs
                            final_payload += await stream_text_to_bytes(
                                raw_speech,
                                NARRATOR_VOICE,
                                settings["pitch"],
                                settings["rate"]
                            )

                    else:
                        if any(c.isalnum() for c in clean_seg):
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

            # Fallback if sentence consisted only of punctuation
            if not final_payload:
                try:
                    fallback_text = req.text if any(c.isalnum() for c in req.text) else "..."
                    final_payload = await stream_text_to_bytes(
                        fallback_text,
                        NARRATOR_VOICE,
                        "+0Hz",
                        "+0%"
                    )
                except Exception:
                    pass

            # Encode the raw bytes to Base64 to send over HTTP
            encoded_audio = base64.b64encode(final_payload).decode('utf-8')

            print(f"✅ Audio chunk {req.chunk_id} successfully encoded for transport.")

            return {
                "status": "success",
                "audio_base64": encoded_audio,
                "chunk_id": req.chunk_id
            }

        except Exception as e:
            print(f"❌ TTS Engine crash: {str(e)}")
            raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn

    # Dynamically resolve the port assigned by the cloud router, fallback to 8001 locally
    cloud_port = int(os.environ.get("PORT", 8001))

    # Set host to 0.0.0.0 to accept traffic from outside the deployment container
    uvicorn.run(
        "tts_worker:app",
        host="0.0.0.0",
        port=cloud_port,
        reload=True,
        workers=4
    )