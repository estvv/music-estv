import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { songlessApi } from '../../utils/api';
import type { SearchResult } from '../../types';

interface Props {
  disabled: boolean;
  onPick: (result: SearchResult) => void;
  search?: (q: string) => Promise<SearchResult[]>;
}

export function GuessInput({ disabled, onPick, search = songlessApi.search }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [highlight, setHighlight] = useState(0);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const requestId = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const [placement, setPlacement] = useState<{ up: boolean; maxHeight: number }>({ up: false, maxHeight: 384 });

  // Debounced search; stale responses are ignored via a request counter.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await search(q);
        if (id === requestId.current) {
          setResults(data);
          setHighlight(0);
          setOpen(true);
        }
      } catch {
        if (id === requestId.current) setResults([]);
      } finally {
        if (id === requestId.current) setSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query, search]);

  // Open downward and fit the list in the viewport; only flip upward when the
  // space below is too small to be usable.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = inputRef.current?.getBoundingClientRect();
      if (!rect) return;
      const margin = 12;
      const below = window.innerHeight - rect.bottom - margin;
      const above = rect.top - margin;
      const up = below < 180 && above > below;
      setPlacement({ up, maxHeight: Math.min(384, Math.max(120, up ? above : below)) });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  const pick = (r: SearchResult) => {
    onPick(r);
    setQuery('');
    setResults([]);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => (h + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => (h - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(results[highlight]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => results.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        disabled={disabled}
        placeholder="Titre ou artiste…"
        role="combobox"
        aria-expanded={open}
        aria-controls="guess-results"
        className="w-full px-4 py-3 border border-neutral-200 rounded-lg focus:outline-none focus:border-neutral-500 transition-colors bg-white disabled:bg-neutral-50"
      />
      {searching && <span className="absolute right-3 top-3.5 text-xs text-neutral-400">…</span>}
      {open && results.length > 0 && (
        <ul
          id="guess-results"
          role="listbox"
          style={{ maxHeight: placement.maxHeight }}
          className={`absolute z-10 ${placement.up ? 'bottom-full mb-1' : 'top-full mt-1'} w-full overflow-y-auto rounded-lg border border-neutral-200 bg-white shadow-lg`}
        >
          {results.map((r, i) => (
            <li key={r.deezer_id} role="option" aria-selected={i === highlight}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(r)}
                onMouseEnter={() => setHighlight(i)}
                className={`w-full flex items-center gap-3 text-left px-3 py-2 text-sm ${i === highlight ? 'bg-neutral-100' : ''}`}
              >
                {r.cover ? (
                  <img src={r.cover} alt="" loading="lazy" className="w-10 h-10 shrink-0 rounded object-cover bg-neutral-100" />
                ) : (
                  <span className="w-10 h-10 shrink-0 rounded bg-neutral-100" />
                )}
                <span className="min-w-0">
                  <span className="block truncate font-medium text-neutral-900">{r.title}</span>
                  <span className="block truncate text-neutral-500">
                    {r.artist}
                    {r.album && r.album !== r.title && <> · {r.album}</>}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
