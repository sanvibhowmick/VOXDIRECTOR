import nlp from 'compromise';

/**
 * Breaks prose into sliding context triplets while isolating the target audio sentence.
 * Eliminates audio stuttering during final MP3 concatenation.
 */
export function createSlidingTriplets(cleanedText) {
    if (!cleanedText || typeof cleanedText !== 'string') return [];
    
    const doc = nlp(cleanedText);
    const sentences = doc.sentences().out('array');
    
    const structuredChunks = sentences.map((sentence, idx) => {
        const prevSentence = idx > 0 ? sentences[idx - 1] : "";
        const nextSentence = idx < sentences.length - 1 ? sentences[idx + 1] : "";
        
        // Broad context for the Python ML Brain (Port 8000)
        const modelContextString = `${prevSentence} ${sentence} ${nextSentence}`.trim();

        return {
            sequence_index: idx,
            raw_sentence: sentence,
            target_sentence: sentence,       // Surgical text for the TTS Studio (Port 8001)
            context_window: modelContextString, // Semantic context for DistilBERT
            assigned_emotion: 'pending',
            confidence_score: 0.0,
            audio_path: null,
            status: 'queued'
        };
    });

    return structuredChunks;
}