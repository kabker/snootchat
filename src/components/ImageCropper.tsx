import { useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

async function cropToFile(src: string, area: Area, name: string): Promise<File> {
  const img = new Image();
  img.src = src;
  await img.decode();
  const size = Math.min(512, Math.round(area.width));
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  canvas.getContext("2d")!.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, size, size);
  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Crop failed"))), "image/jpeg", 0.9));
  return new File([blob], name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
}

/** Square/circle cropper shown before a profile or group picture is uploaded. */
export function ImageCropper({ file, onCancel, onDone }: { file: File; onCancel: () => void; onDone: (cropped: File) => void }) {
  const [src] = useState(() => URL.createObjectURL(file));
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="fixed inset-0 z-[60] bg-foreground/50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-card rounded-3xl border border-border p-5">
        <h3 className="text-lg font-bold mb-3">Crop photo</h3>
        <div className="relative h-72 rounded-2xl overflow-hidden bg-secondary">
          <Cropper image={src} crop={crop} zoom={zoom} aspect={1} cropShape="round" showGrid={false}
            onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={(_, px) => setArea(px)} />
        </div>
        <Slider className="mt-5" min={1} max={3} step={0.05} value={[zoom]} onValueChange={(v) => setZoom(v[0])} aria-label="Zoom" />
        <div className="flex gap-3 mt-5">
          <Button variant="secondary" className="flex-1" onClick={() => { URL.revokeObjectURL(src); onCancel(); }}>Cancel</Button>
          <Button className="flex-1" disabled={!area || busy} onClick={async () => {
            if (!area) return;
            setBusy(true);
            try { onDone(await cropToFile(src, area, file.name)); } finally { setBusy(false); URL.revokeObjectURL(src); }
          }}>Use photo</Button>
        </div>
      </div>
    </div>
  );
}
