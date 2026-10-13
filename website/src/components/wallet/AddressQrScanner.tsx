"use client";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import jsQR from "jsqr";
import { parseWalletAddress } from "@/lib/wallet-activity";
import { walletUxCopy } from "@/lib/wallet-ux-copy";
import { useLanguage } from "@/context/LanguageContext";
import { WalletDialog } from "./WalletDialog";

export function AddressQrScanner({ onAddress, onClose }: { onAddress: (address: string) => void; onClose: () => void }) {
  const { lang } = useLanguage(); const t = walletUxCopy(lang);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const frame = useRef<number>(0); const active = useRef(true);
  const starting = useRef(false);
  const [error, setError] = useState("");
  useEffect(() => { active.current = true; return () => {
    active.current = false; cancelAnimationFrame(frame.current); stream.current?.getTracks().forEach((track) => track.stop());
  }; }, []);
  function stopCamera() {
    cancelAnimationFrame(frame.current); stream.current?.getTracks().forEach((track) => track.stop()); stream.current = null;
  }
  function decode(canvas: HTMLCanvasElement): boolean {
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return false;
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(pixels.data, pixels.width, pixels.height);
    if (!code) return false;
    const address = parseWalletAddress(code.data);
    if (!address) { setError(t.invalidQr); return false; }
    stopCamera(); onAddress(address); return true;
  }
  async function startCamera() {
    if (starting.current) return;
    starting.current = true; stopCamera(); setError("");
    try {
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      if (!active.current) { media.getTracks().forEach((track) => track.stop()); return; }
      stream.current = media;
      const element = video.current;
      if (!element) { stopCamera(); return; }
      element.srcObject = media; await element.play();
      const canvas = document.createElement("canvas");
      let lastScan = 0;
      const tick = (time = 0) => {
        if (!active.current || !stream.current) return;
        if (element.videoWidth > 0 && time - lastScan >= 200) {
          lastScan = time;
          canvas.width = Math.min(element.videoWidth, 960); canvas.height = Math.round(canvas.width * element.videoHeight / element.videoWidth);
          canvas.getContext("2d")?.drawImage(element, 0, 0, canvas.width, canvas.height);
          if (decode(canvas)) return;
        }
        frame.current = requestAnimationFrame(tick);
      }; tick();
    } catch { stopCamera(); if (active.current) setError(t.cameraError); }
    finally { starting.current = false; }
  }
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    stopCamera(); setError("");
    try {
      const bitmap = await createImageBitmap(file);
      if (!active.current) { bitmap.close(); return; }
      const canvas = document.createElement("canvas"); const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
      if (!decode(canvas)) setError(t.invalidQr);
    } catch { if (active.current) setError(t.invalidQr); }
  }
  return <WalletDialog title={t.scanner} closeLabel={t.close} onClose={onClose}>
    <video ref={video} muted playsInline className="mb-4 w-full rounded-xl bg-canvas" />
    {error && <p role="alert" className="mb-3 text-sm text-warm">{error}</p>}
    <div className="flex flex-wrap gap-3"><button type="button" onClick={() => void startCamera()} className="rounded-xl bg-brand px-4 py-2 text-brand-ink">{t.camera}</button>
      <label className="cursor-pointer rounded-xl border border-line px-4 py-2">{t.upload}<input type="file" accept="image/*" onChange={(event) => void upload(event)} className="sr-only" /></label></div>
  </WalletDialog>;
}
