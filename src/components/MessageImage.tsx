import { useEffect, useState } from "react";
import { resolveStorageUrl } from "@/lib/storage";
export function MessageImage({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    async function resolve() { const value = await resolveStorageUrl(path, "chat-images"); if (live) { setUrl(value); setFailed(!value); } }
    void resolve();
    const timer = setInterval(resolve, 50 * 60 * 1000);
    return () => { live = false; clearInterval(timer); };
  }, [path]);
  if (failed) return <p className="p-3 text-sm text-muted-foreground">Image unavailable</p>;
  if (!url) return <div className="w-48 h-32 animate-pulse bg-secondary rounded-lg" aria-label="Loading image" />;
  return <a href={url} target="_blank" rel="noreferrer" className="block" aria-label="Open image"><img src={url} alt="Chat attachment" draggable={false} onError={() => setFailed(true)} className="max-w-full max-h-96 rounded-lg object-contain" /></a>;
}