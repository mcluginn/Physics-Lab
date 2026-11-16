'use client';

import React, { useMemo } from 'react';
import katex from 'katex';

export type KatexMathProps = {
  math: string;
  displayMode?: boolean;
  className?: string;
};

/**
 * Renders a LaTeX expression cleanly using KaTeX HTML output (screen + print safe).
 */
export function KatexMath({ math, displayMode = false, className }: KatexMathProps) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(math, {
        displayMode,
        throwOnError: false,
        strict: false,
        output: 'html',
      });
    } catch {
      return math;
    }
  }, [math, displayMode]);

  return (
    <span
      className={className ? `katex-wrap ${className}` : 'katex-wrap'}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/**
 * Renders prose containing $$...$$ display math or $...$ inline LaTeX delimiters.
 */
export function LatexRichText({ text }: { text: string }) {
  const segments = useMemo(() => {
    if (!text || (!text.includes('$'))) return [text];
    return text.split(/(\$\$[^$]+\$\$|\$[^$]+\$)/g);
  }, [text]);

  return (
    <>
      {segments.map((part, idx) => {
        if (!part) return null;
        if (part.startsWith('$$') && part.endsWith('$$') && part.length > 4) {
          return (
            <KatexMath
              key={idx}
              math={part.slice(2, -2)}
              displayMode={true}
              className="katex-block-inline"
            />
          );
        }
        if (part.startsWith('$') && part.endsWith('$') && part.length > 2) {
          return <KatexMath key={idx} math={part.slice(1, -1)} displayMode={false} />;
        }
        return <React.Fragment key={idx}>{part}</React.Fragment>;
      })}
    </>
  );
}
