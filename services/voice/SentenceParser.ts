/**
 * SentenceParser.ts — Sentence segmenter for streamed AI tokens
 *
 * Buffers streamed AI text chunks and yields clean, complete sentences at natural
 * punctuation boundaries without splitting numbers, abbreviations, or LaTeX math formulas.
 */

export class SentenceParser {
    private buffer = '';
    private readonly abbreviations = new Set([
        'mr.', 'mrs.', 'ms.', 'dr.', 'prof.', 'sr.', 'jr.', 'vs.', 'etc.', 'e.g.', 'i.e.', 'fig.', 'eq.', 'approx.', 'no.', 'vol.', 'dept.'
    ]);

    /**
     * Appends streamed chunk of text and extracts any completed sentences.
     */
    public append(chunk: string): string[] {
        this.buffer += chunk;
        const sentences: string[] = [];

        // Check for complete sentences
        while (true) {
            const nextIdx = this.findSentenceEnd(this.buffer);
            if (nextIdx === -1) break;

            const sentence = this.buffer.slice(0, nextIdx + 1).trim();
            this.buffer = this.buffer.slice(nextIdx + 1);

            if (sentence.length > 0) {
                sentences.push(sentence);
            }
        }

        return sentences;
    }

    /**
     * Flushes any remaining text in the buffer as the final sentence.
     */
    public flush(): string[] {
        const remaining = this.buffer.trim();
        this.buffer = '';
        return remaining.length > 0 ? [remaining] : [];
    }

    /**
     * Resets the internal sentence buffer.
     */
    public reset(): void {
        this.buffer = '';
    }

    /**
     * Finds the index of the next natural sentence-ending delimiter.
     */
    private findSentenceEnd(text: string): number {
        let insideMath = false;
        let insideParentheses = 0;

        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            const nextChar = text[i + 1] || '';

            // Handle LaTeX delimiters
            if (char === '$') {
                insideMath = !insideMath;
                continue;
            }

            if (insideMath) continue;

            if (char === '(' || char === '[' || char === '{') {
                insideParentheses++;
                continue;
            }
            if (char === ')' || char === ']' || char === '}') {
                if (insideParentheses > 0) insideParentheses--;
                continue;
            }

            // Check for sentence terminator (. ! ? or \n\n)
            if (char === '.' || char === '!' || char === '?' || char === ';' || char === ':') {
                if (insideParentheses > 0) continue;

                // Protect decimal numbers like 3.14 or 10.5
                const prevChar = i > 0 ? text[i - 1] : '';
                if (char === '.' && /\d/.test(prevChar) && /\d/.test(nextChar)) {
                    continue;
                }

                // Protect known abbreviations
                if (char === '.') {
                    const startOfWord = text.lastIndexOf(' ', i - 1);
                    const word = text.slice(startOfWord + 1, i + 1).toLowerCase();
                    if (this.abbreviations.has(word)) {
                        continue;
                    }
                }

                // Must be followed by whitespace, end of string, or quotation
                if (i === text.length - 1 || /\s|["'’”\)]/.test(nextChar)) {
                    return i;
                }
            }

            // Double newline is always a sentence boundary
            if (char === '\n' && nextChar === '\n') {
                return i;
            }
        }

        return -1;
    }
}
