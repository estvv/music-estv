import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { songlessApi } from '../../utils/api';
import { SearchIcon } from '../shared/icons';
import type { SearchResult } from '../../types';

type Search = (q: string) => Promise<SearchResult[]>;

// Search state shared by the dropdown and the side-panel layouts: debounced
// query, results, keyboard highlight.
export function useGuessSearch(search: Search = songlessApi.search) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [highlight, setHighlight] = useState(0);
  const [searching, setSearching] = useState(false);
  const requestId = useRef(0);

  // Stale responses are ignored via a request counter.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      requestId.current += 1;
      setResults([]);
      setSearching(false);
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
        }
      } catch {
        if (id === requestId.current) setResults([]);
      } finally {
        if (id === requestId.current) setSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query, search]);

  const reset = useCallback(() => {
    setQuery('');
    setResults([]);
  }, []);

  // Arrow keys move the highlight, Enter picks it. Returns true when handled.
  const onKey = (e: React.KeyboardEvent, pick: (r: SearchResult) => void) => {
    if (results.length === 0) return false;
    if (e.key === 'ArrowDown') setHighlight((h) => (h + 1) % results.length);
    else if (e.key === 'ArrowUp') setHighlight((h) => (h - 1 + results.length) % results.length);
    else if (e.key === 'Enter') pick(results[highlight]);
    else return false;
    e.preventDefault();
    return true;
  };

  return { query, setQuery, results, searching, highlight, setHighlight, reset, onKey };
}

export type GuessSearch = ReturnType<typeof useGuessSearch>;

const inputClass =
  'w-full px-4 py-3 border border-neutral-200 rounded-lg focus:outline-none focus:border-neutral-500 transition-colors bg-white disabled:bg-neutral-50';

function ResultRow({ r, active, onPick, onHover }: { r: SearchResult; active: boolean; onPick: () => void; onHover: () => void }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onPick}
      onMouseEnter={onHover}
      className={`w-full flex items-center gap-3 text-left px-3 py-2 text-sm rounded-lg ${active ? 'bg-neutral-100' : ''}`}
    >
      {r.cover ? (
        <img src={r.cover} alt="" loading="lazy" className="w-10 h-10 shrink-0 rounded object-cover bg-neutral-100" />
      ) : (
        <span className="w-10 h-10 shrink-0 rounded bg-neutral-100" />
      )}
      <span className="min-w-0 break-words">
        <span className="block font-medium text-neutral-900">{r.title}</span>
        <span className="block text-neutral-500">
          {r.artist}
          {r.album && r.album !== r.title && <> · {r.album}</>}
        </span>
      </span>
    </button>
  );
}

function ResultList({ s, onPick, className, style }: {
  s: GuessSearch;
  onPick: (r: SearchResult) => void;
  className: string;
  style?: React.CSSProperties;
}) {
  const listRef = useRef<HTMLUListElement>(null);

  // Keyboard navigation: keep the highlighted row in view.
  useEffect(() => {
    listRef.current?.children[s.highlight]?.scrollIntoView({ block: 'nearest' });
  }, [s.highlight]);

  return (
    <ul ref={listRef} id="guess-results" role="listbox" className={className} style={style}>
      {s.results.map((r, i) => (
        <li key={r.deezer_id} role="option" aria-selected={i === s.highlight}>
          <ResultRow r={r} active={i === s.highlight} onPick={() => onPick(r)} onHover={() => s.setHighlight(i)} />
        </li>
      ))}
    </ul>
  );
}

// --- side-panel layout (Songless) ---------------------------------------------

export function GuessField({ s, disabled, onPick }: { s: GuessSearch; disabled: boolean; onPick: (r: SearchResult) => void }) {
  return (
    <div className="relative">
      <input
        value={s.query}
        onChange={(e) => s.setQuery(e.target.value)}
        onKeyDown={(e) => s.onKey(e, onPick)}
        disabled={disabled}
        placeholder="Titre ou artiste…"
        role="combobox"
        aria-expanded={s.results.length > 0}
        aria-controls="guess-results"
        className={inputClass}
      />
      {s.searching && <span className="absolute right-3 top-3.5 text-xs text-neutral-400">…</span>}
    </div>
  );
}

// Fixed-size panel that always shows the proposals; only its list scrolls.
export function GuessPanel({ s, onPick, className = '' }: { s: GuessSearch; onPick: (r: SearchResult) => void; className?: string }) {
  const q = s.query.trim();
  return (
    <div className={`rounded-xl border border-neutral-200 bg-white shadow-sm flex flex-col overflow-hidden ${className}`}>
      <div className="px-4 py-3 border-b border-neutral-100 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-neutral-900">Propositions</h2>
        {s.results.length > 0 && <span className="text-xs text-neutral-400 tabular-nums">{s.results.length}</span>}
      </div>
      {s.results.length > 0 ? (
        <ResultList s={s} onPick={onPick} className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-1.5" />
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6 text-sm text-neutral-400 gap-2">
          <SearchIcon className="w-6 h-6 text-neutral-300" />
          {s.searching ? 'Recherche…' : q.length >= 2 ? 'Aucun résultat.' : 'Tape un titre ou un artiste : les morceaux s\'affichent ici.'}
        </div>
      )}
    </div>
  );
}

// --- dropdown layout (blind test, party guests) -------------------------------

interface Props {
  disabled: boolean;
  onPick: (result: SearchResult) => void;
  search?: Search;
}

export function GuessInput({ disabled, onPick, search }: Props) {
  const s = useGuessSearch(search);
  const [open, setOpen] = useState(false);
  const [maxHeight, setMaxHeight] = useState(384);
  const inputRef = useRef<HTMLInputElement>(null);
  const showList = open && s.results.length > 0;

  // Fit the list in the space left under the input.
  useLayoutEffect(() => {
    if (!showList) return;
    const place = () => {
      const rect = inputRef.current?.getBoundingClientRect();
      if (rect) setMaxHeight(Math.max(200, Math.min(480, window.innerHeight - rect.bottom - 16)));
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [showList]);

  const pick = (r: SearchResult) => {
    onPick(r);
    s.reset();
    setOpen(false);
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        value={s.query}
        onChange={(e) => { s.setQuery(e.target.value); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') return setOpen(false);
          if (showList) s.onKey(e, pick);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        disabled={disabled}
        placeholder="Titre ou artiste…"
        role="combobox"
        aria-expanded={showList}
        aria-controls="guess-results"
        className={inputClass}
      />
      {s.searching && <span className="absolute right-3 top-3.5 text-xs text-neutral-400">…</span>}
      {showList && (
        <ResultList
          s={s}
          onPick={pick}
          style={{ maxHeight }}
          className="absolute z-10 top-full mt-1 w-full overflow-y-auto overscroll-contain rounded-lg border border-neutral-200 bg-white shadow-lg p-1"
        />
      )}
    </div>
  );
}
