/**
 * Removes non-narrative structural debris, legal boilerplate, 
 * page numbers, and database-breaking null bytes from raw text strings.
 */
export function scrubDocumentDebris(rawText) {
    if (!rawText) return '';
    
    // 0. THE EXORCISM: Vaporize PostgreSQL-breaking Null Bytes (\u0000) immediately
    let cleaned = rawText.replace(/\u0000|\0/g, '');

    // 1. FRONT & BACK MATTER (Multi-line / Paragraph-level stripping)
    // Removes "About the Author", "Praise for...", "Also by...", and "Dedication" sections
    cleaned = cleaned.replace(/^(?:About the Author|Praise for|Also by|Dedication|Acknowledgments|Table of Contents)[\s\S]{0,1500}?(?=\n\n|\r\n\r\n|Chapter|\b1\b|$)/gim, '');

    // 2. LEGAL & COPYRIGHT BLOCKS
    // Strips copyright notices, ISBNs, "All rights reserved", and printed-in notices
    cleaned = cleaned.replace(/(?:Copyright\s*(?:©|\(c\)|(?:\b\d{4}\b)).*?All rights reserved\.?)/gim, '');
    cleaned = cleaned.replace(/^(?:No part of this publication may be reproduced|Printed in the United States|ISBN[-:\s0-9X]+).*$/gim, '');
    
    // 3. PROJECT GUTENBERG LICENSES (Full blocks, not just single lines)
    // Strips everything before the START banner and everything after the END banner
    cleaned = cleaned.replace(/^[\s\S]*?\*+\s*START OF THE PROJECT GUTENBERG.*?\*+/i, '');
    cleaned = cleaned.replace(/\*+\s*END OF THE PROJECT GUTENBERG[\s\S]*$/i, '');

    // 4. STANDALONE PAGE NUMBERS & ROMAN NUMERALS (Must happen BEFORE line collapsing!)
    // Catches lines that ONLY contain numbers (e.g., "  42  ") or roman numerals ("  xiv  ")
    cleaned = cleaned.replace(/^\s*(?:\d+|[ivxlcdm]+)\s*$/gim, '');
    
    // Catches common "Page X of Y", "- 12 -", and "42 / 300" variations inside lines
    cleaned = cleaned.replace(/(?:\bPage\s*\d+(?:\s*of\s*\d+)?\b|[-–—]\s*\d+\s*[-–—]|\b\d+\s*\/\s*\d+\b)/gi, '');

    // 5. RUNNING HEADERS & FOOTERS
    // Catches common book headers like "One of Us Is Lying | 45" or "45 | Chapter Two"
    cleaned = cleaned.replace(/^(?:.*?\b\d+\b.*?\|.*?|.*?\|.*?\b\d+\b.*?)$/gm, '');

    // 6. CHAPTER HEADINGS (If you want pure prose without "CHAPTER 1" announcements)
    cleaned = cleaned.replace(/^(?:CHAPTER|Chapter|chapter)\s+(?:[IVXLCDM]+|\d+)(?:\s*:|\s*[-–—]|\s+.*)?$/gm, '');

    // 7. FINAL POLISH: Collapse line breaks and normalize whitespace
    cleaned = cleaned.replace(/\r\n|\r|\n/g, ' ');
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    return cleaned;
}