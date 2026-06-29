import torch
import torch.nn.functional as F
import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from transformers import AutoTokenizer, AutoModelForSequenceClassification

app = FastAPI(title="VoxDirector ML Worker", version="1.0")

# Target the clean 4-file Rust bundle folder
MODEL_PATH = "./voxdirector_model_v1"

# Label mapping matching our trained output nodes
ID2LABEL = {0: "sadness", 1: "joy", 2: "love", 3: "anger", 4: "fear", 5: "surprise"}

print("📦 Loading local deployment bundle into memory...")
device = "cuda" if torch.cuda.is_available() else "cpu"

try:
    # AutoTokenizer automatically detects and uses the high-speed Rust tokenizer.json
    tokenizer = AutoTokenizer.from_pretrained(MODEL_PATH)
    model = AutoModelForSequenceClassification.from_pretrained(MODEL_PATH).to(device)
    model.eval()
    print(f"✅ Director Agent successfully loaded on device: [{device.upper()}]")
except Exception as e:
    print(f"❌ FATAL: Could not load deployment bundle. Error: {e}")

class NarrativeRequest(BaseModel):
    context_window: str # Expects sliding triplet: [Prev + Current + Next]

@app.post("/predict")
def predict_emotion(req: NarrativeRequest):
    """Tokenizes incoming narrative triplets and outputs the required voice profile."""
    if not req.context_window.strip():
        raise HTTPException(status_code=400, detail="Empty context window provided.")

    inputs = tokenizer(
        req.context_window,
        return_tensors="pt",
        truncation=True,
        padding="max_length",
        max_length=128
    ).to(device)
    if "token_type_ids" in inputs:
        del inputs["token_type_ids"]
    with torch.no_grad():
        outputs = model(**inputs)

    probabilities = F.softmax(outputs.logits, dim=-1).squeeze().tolist()
    winning_idx = int(np.argmax(probabilities))
    confidence = float(probabilities[winning_idx])

    # Apply our 60% graceful degradation guardrail
    if confidence < 0.60:
        assigned_profile = "neutral"
        routing_flag = "fallback_low_confidence"
    else:
        assigned_profile = ID2LABEL[winning_idx]
        routing_flag = "model_directed"

    return {
        "voice_profile": assigned_profile,
        "confidence": confidence,
        "routing_flag": routing_flag,
        "raw_distribution": {ID2LABEL[i]: probabilities[i] for i in range(6)}
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)