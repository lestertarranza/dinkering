"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

export function QrCode({
  url,
  label,
  size = 160,
}: {
  url: string;
  label?: string;
  size?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !url) return;
    QRCode.toCanvas(canvas, url, {
      width: size,
      margin: 1,
      color: { dark: "#0f172a", light: "#ffffff" },
    }).catch(() => setError(true));
  }, [url, size]);

  if (error) return null;

  return (
    <div className="inline-flex flex-col items-center gap-2">
      <canvas
        ref={canvasRef}
        className="rounded-lg border border-slate-200 bg-white p-2"
        aria-label={label ?? "QR code"}
      />
      {label ? (
        <p className="max-w-[180px] text-center text-xs text-slate-500">
          {label}
        </p>
      ) : null}
    </div>
  );
}
