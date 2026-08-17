import { useEffect, useState } from "react";
import { searchProfiles, type ProfileLite } from "@/lib/chats";
import { Avatar } from "@/components/Avatar";

export function UserSearch({
  placeholder = "Search by username",
  excludeIds = [],
  onSelect,
}: {
  placeholder?: string;
  excludeIds?: string[];
  onSelect: (profile: ProfileLite) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ProfileLite[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const term = q.trim();
    if (!term) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const rows = await searchProfiles(term);
        if (!cancelled) setResults(rows.filter((r) => !excludeIds.includes(r.id)));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, excludeIds.join(",")]);

  return (
    <div>
      <input
        className="w-full rounded-xl bg-input px-4 py-3 outline-none focus:ring-2 focus:ring-ring"
        placeholder={placeholder}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {q.trim() !== "" && (
        <ul className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-border divide-y divide-border">
          {loading && results.length === 0 && (
            <li className="px-3 py-3 text-sm text-muted-foreground">Searching…</li>
          )}
          {!loading && results.length === 0 && (
            <li className="px-3 py-3 text-sm text-muted-foreground">No people found</li>
          )}
          {results.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => {
                  onSelect(p);
                  setQ("");
                  setResults([]);
                }}
                className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-secondary"
              >
                <Avatar displayName={p.display_name} avatarPath={p.avatar_url} size={34} />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{p.display_name}</p>
                  <p className="text-xs text-muted-foreground truncate">@{p.username}</p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
