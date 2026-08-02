import React from 'react';

const URL_OR_MENTION = /(@\S+|https?:\/\/[^\s<]+|www\.[^\s<]+)/g;

function isUrl(part: string): boolean {
  return /^(https?:\/\/|www\.)/.test(part);
}

export function linkify(text: string): React.ReactNode[] {
  return text.split(URL_OR_MENTION).map((part, i) => {
    if (part.startsWith('@')) {
      return <span key={i} style={{ color: 'var(--accent)', fontWeight: 600 }}>{part}</span>;
    }
    if (isUrl(part)) {
      const href = part.startsWith('www.') ? `https://${part}` : part;
      return (
        <a
          key={i}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          style={{ color: 'var(--accent)', textDecoration: 'underline', wordBreak: 'break-all' }}
        >
          {part}
        </a>
      );
    }
    return part;
  });
}
