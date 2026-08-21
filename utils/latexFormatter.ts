/**
 * latexFormatter.ts
 * Utility to format plain computer mathematical text, units, and powers into valid LaTeX KaTeX format.
 * Ensures powers, exponents, fractions, square roots, and subscripts render with true mathematical typography.
 */

/**
 * Transforms plain computer mathematical strings (e.g. x^2, m/s^2, 10^5, v_f, sqrt(x))
 * and corrupted JSON escape artifacts into clean KaTeX math syntax ($...$ or $$...$$).
 */
export function formatLatexMath(content: string | null | undefined): string {
    if (!content || typeof content !== 'string') return '';

    let text = content;

    // 0. Repair JSON escape control character artifacts (e.g. \f in \frac becoming form-feed \u000c, \b in \beta becoming backspace \u0008)
    text = text
        .replace(/\u000crac/g, '\\frac')
        .replace(/\u0008eta/g, '\\beta')
        .replace(/\u0008egin/g, '\\begin')
        .replace(/\u0008ar/g, '\\bar')
        .replace(/\u0008ox/g, '\\box')
        .replace(/\u0008ullet/g, '\\bullet')
        .replace(/\u0008f/g, '\\bf')
        .replace(/\u0008old/g, '\\bold')
        .replace(/\u0008ot/g, '\\bot')
        .replace(/(\s|^)\text(?=\{)/g, '$1\\text')
        .replace(/(\s|^)\nabla(?=[^a-zA-Z]|$)/g, '$1\\nabla')
        .replace(/(\s|^)\rho(?=[^a-zA-Z]|$)/g, '$1\\rho');

    // 1. If the whole string is a block equation $$...$$, ensure proper markdown block formatting
    const blockMatch = text.trim().match(/^\$\$([\s\S]*?)\$\$$/);
    if (blockMatch) {
        return `\n\n$$\n${blockMatch[1].trim()}\n$$\n\n`;
    }

    // Protect existing LaTeX math blocks ($$...$$ and $...$) with placeholders
    const mathBlocks: string[] = [];
    text = text.replace(/(\$\$[\s\S]*?\$\$|\$[^\$\n]+?\$)/g, (match) => {
        mathBlocks.push(match);
        return `___MATH_BLOCK_${mathBlocks.length - 1}___`;
    });

    // 2. Convert units with powers (e.g. m/s^2, m/s², kg*m/s^2, cm^3, m^2)
    text = text.replace(/\b(m\/s\^2|m\/s²|km\/h\^2|cm\^3|cm³|m\^3|m³|m\^2|m²|kg\/m\^3|N\/m\^2|rad\/s\^2|rad\/s²)\b/gi, (match) => {
        const clean = match
            .replace(/²/g, '^2')
            .replace(/³/g, '^3');
        return `$\\text{${clean}}$`;
    });

    // 3. Convert standard scientific powers of 10 (e.g. 10^5, 10^-3, 10^12)
    text = text.replace(/\b10\^([+-]?\d+)\b/g, (_m, p) => `$10^{${p}}$`);

    // 4. Convert square roots: sqrt(x) or sqrt(2gh) or sqrt(a^2 + b^2)
    text = text.replace(/\bsqrt\(([^)]+)\)/gi, (_m, inner) => `$\\sqrt{${inner.trim()}}$`);

    // 5. Convert Greek letter names to LaTeX when in formula-like expressions
    text = text.replace(/\b(theta|alpha|beta|lambda|omega|delta|mu|phi|gamma|pi|sigma|epsilon|zeta|eta|iota|kappa|nu|xi|rho|tau|upsilon|chi|psi)\b(?=[^a-zA-Z]|$)/gi, (match) => {
        const name = match.toLowerCase();
        return `$\\${name}$`;
    });

    // 6. Convert unescaped LaTeX commands outside math mode (e.g. \frac{a}{b}, \Delta x, \sum, \int, \cdot)
    text = text.replace(/(\\(?:frac\{[^{}]+\}\{[^{}]+\}|Delta\s*[a-zA-Z]|sum|int|partial|infty|cdot|pm|times|le|ge|neq|approx|rightarrow))\b/g, (match) => {
        return `$${match}$`;
    });

    // 7. Convert commonly subscripted physics/math variables: v_i, v_f, v_0, a_x, F_net, F_N, F_g, f_k, t_0, x_0
    text = text.replace(/\b([a-zA-Z])_([a-zA-Z0-9]+)\b/g, (_m, base, sub) => {
        if (sub.length === 1 || /^\d+$/.test(sub)) {
            return `$${base}_${sub}$`;
        }
        return `$${base}_{\\text{${sub}}}$`;
    });

    // 8. Convert variables/numbers raised to power: x^2, t^2, v^2, r^3, (v_f)^2, etc.
    text = text.replace(/(\b[a-zA-Z0-9]+|\([^)]+\))\^([+-]?[a-zA-Z0-9]+|\{[^}]+\})/g, (_m, base, exp) => {
        const cleanExp = exp.startsWith('{') && exp.endsWith('}') ? exp.slice(1, -1) : exp;
        return `$${base}^{${cleanExp}}$`;
    });

    // 9. Convert degree expressions: 30° or 30 deg or 45 degrees
    text = text.replace(/\b(\d+)\s*(?:°|deg|degrees)\b/gi, (_m, deg) => `$${deg}^\\circ$`);

    // 10. Convert +/- symbol to \pm
    text = text.replace(/\s*\+\/-\s*/g, ' $\\pm$ ');

    // 11. Restore protected math blocks
    text = text.replace(/___MATH_BLOCK_(\d+)___/g, (_m, idx) => {
        return mathBlocks[parseInt(idx, 10)] || '';
    });

    // 12. Normalize block equations inside markdown
    text = text.replace(/\$\$([\s\S]*?)\$\$/g, (_match, inner) => {
        return `\n\n$$\n${inner.trim()}\n$$\n\n`;
    });

    return text;
}
