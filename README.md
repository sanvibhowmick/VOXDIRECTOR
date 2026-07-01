# VoxEditor — Ingestion & Narration Pipeline

VoxEditor turns an uploaded PDF/text file into a fully narrated audiobook. This document describes what happens between "file uploaded" and "audio ready."

## Pipeline Overview

```
PDF/Text Upload
      │
      ▼
1. Parse & Clean
      │
      ▼
2. Build Context Triplets
      │
      ▼
3. Chunk & Queue in Postgres (Supabase)
      │
      ▼
4. Dispatcher Daemon (background worker)
      │
      ├─▶ Emotion Tagging (ML model)
      ├─▶ TTS Synthesis (Hugging Face worker)
      └─▶ Save Audio (.mp3, Base64-decoded)
      │
      ▼
Stitched Audiobook Output
```

## Stage 1 — Scrubbing Debris

The parser strips non-content noise from the source file before any NLP processing touches it:

- Page numbers
- Headers and footers
- Invisible/non-printable formatting characters

This ensures downstream sentence splitting isn't polluted by layout artifacts.

## Stage 2 — Sliding Context Triplets

Rather than feeding the emotion model a single isolated sentence, the script builds a **sliding triplet** for every sentence:

```js
[previousSentence, targetSentence, nextSentence]
```

The previous/next sentence give the model surrounding context, which meaningfully improves emotion-prediction accuracy on the target sentence — tone often depends on what came before and after.

## Stage 3 — Chunking & Queuing

The full document is split into individual sentences and inserted as **pending rows** in the Supabase Postgres database.

**Example run:** 5,902 chunks

| Metric | Value |
|---|---|
| Total chunks | 5,902 |
| Avg. words/sentence | ~15 |
| Estimated total words | ~88,500 |
| Equivalent to | a standard ~300-page fiction novel |

This scale check is a useful sanity signal — if chunk count wildly over/undershoots the expected word count for the source file's length, it's worth checking the parser for missed page breaks or duplicated content.

## Stage 4 — The Dispatcher Daemon

`dispatcher.js` is a background worker that continuously drains the queue:

1. **Claim work:** Pulls 5 chunks at a time using `FOR UPDATE SKIP LOCKED`, so multiple dispatcher instances can run concurrently without double-processing the same row.
2. **Emotion tagging:** Sends each chunk (with its context triplet) to the ML model to predict emotional tone.
3. **TTS synthesis:** Routes the tagged chunk to the Hugging Face TTS worker to generate emotionally-inflected audio.
4. **Save:** Decodes the returned Base64 payload and writes it locally as an `.mp3` file.

This repeats until all 5,902 rows are processed, at which point the individual audio segments are stitched into the final audiobook.

