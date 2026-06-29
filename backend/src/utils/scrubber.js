/**
 * Removes non-narrative structural debris from raw text strings.
 */
export function scrubDocumentDebris(rawText) {
    if (!rawText) return '';
    let cleaned = rawText;
    
    // 1. Strip standard page numbers (e.g. "Page 4", "- 12 -", "42 / 300")
    cleaned = cleaned.replace(/(?:Page\s*\d+|[-–]\s*\d+\s*[-–]|\b\d+\s*\/\s*\d+\b)/gi, '');
    
    // 2. Strip standard Project Gutenberg / eBook legal disclaimers
    cleaned = cleaned.replace(/(?:\*+\s*START OF THE PROJECT GUTENBERG.*|\*+\s*END OF THE PROJECT GUTENBERG.*)/gi, '');

    // 3. Strip running chapter headers that get stamped at the top of pages
    cleaned = cleaned.replace(/^(?:CHAPTER|Chapter|chapter)\s+[I|V|X|L|C|D|M|\d+].*$/gm, '');
    
    // 4. Collapse multi-line carriage returns into standard single spaces
    cleaned = cleaned.replace(/\r\n|\r|\n/g, ' ');
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    
    return cleaned;
}