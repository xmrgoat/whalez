'use client';

import { toBionicSegments } from '@/lib/bionic';

interface BionicTextProps {
  children: string;
  className?: string;
  as?: 'span' | 'p' | 'div';
}

/**
 * BionicText component
 * Renders text with bionic reading format (first part of each word bolded)
 */
export default function BionicText({ 
  children, 
  className = '', 
  as: Component = 'span' 
}: BionicTextProps) {
  const segments = toBionicSegments(children);

  return (
    <Component className={className}>
      {segments.map((seg, i) => 
        seg.bold ? (
          <b key={i} className="font-bold">{seg.text}</b>
        ) : (
          <span key={i}>{seg.text}</span>
        )
      )}
    </Component>
  );
}

/**
 * Hook to apply bionic reading to text
 */
export function useBionic(text: string) {
  return toBionicSegments(text);
}
