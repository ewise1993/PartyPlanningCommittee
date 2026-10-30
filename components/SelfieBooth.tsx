"use client";
import { useEffect, useRef, useState } from "react";

// Same oval as the team photos: 0.8 aspect, filling the square's height.
const SIZE = 320;
const COUNTDOWN = 3;
type Stage = "starting" | "live" | "countdown" | "review" | "error";

// Takes a selfie (or an uploaded photo) and hands back an oval PNG data URL.
export function SelfieBooth({ onSave, onCancel }: { onSave: (dataUrl: string) => void; onCancel: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [stage, setStage] = useState<Stage>("starting");
  const [count, setCount] = useState(COUNTDOWN);
  const [shot, setShot] = useState<string | null>(null);
  const [error, setError] = useState("");

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };
  useEffect(() => stopCamera, []);

  useEffect(() => {
    if (stage !== "starting") return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This browser can't open the camera here. Upload a photo instead.");
      setStage("error");
      return;
    }
    let cancelled = false;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false })
      .then((stream) => {
        if (cancelled) { stream.getTracks().forEach((track) => track.stop()); return; }
        streamRef.current = stream;
        const video = videoRef.current!;
        video.srcObject = stream;
        video.play().catch(() => { /* autoplay is muted, so this only fails if the booth closed */ });
        setStage("live");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const name = err instanceof DOMException ? err.name : "";
        setError(name === "NotAllowedError" ? "Camera access is blocked. Allow it in your browser, or upload a photo instead."
          : name === "NotFoundError" ? "No camera found. Upload a photo instead."
          : "The camera couldn't start. Upload a photo instead.");
        setStage("error");
      });
    return () => { cancelled = true; };
  }, [stage]);

  useEffect(() => {
    if (stage !== "countdown") return;
    if (count === 0) {
      const video = videoRef.current;
      if (video?.videoWidth) setShot(ovalCrop(video, video.videoWidth, video.videoHeight, true));
      stopCamera();
      setStage("review");
      return;
    }
    const timer = setTimeout(() => setCount((c) => c - 1), 800);
    return () => clearTimeout(timer);
  }, [stage, count]);

  const snap = () => { setCount(COUNTDOWN); setStage("countdown"); };
  const retake = () => { setShot(null); setError(""); setStage("starting"); };
  const upload = (file: File | undefined) => {
    if (!file || !file.type.startsWith("image/")) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setShot(ovalCrop(img, img.naturalWidth, img.naturalHeight, false));
      URL.revokeObjectURL(url);
      stopCamera();
      setStage("review");
    };
    img.onerror = () => { URL.revokeObjectURL(url); setError("That file couldn't be read. Try a JPG or PNG."); setStage("error"); };
    img.src = url;
  };

  return <section className="chase-select booth glass" aria-labelledby="booth-heading">
    <p className="eyebrow">Selfie booth</p>
    <h2 id="booth-heading">{stage === "review" ? "Looking good" : "Strike a pose"}</h2>
    <p>{stage === "review" ? "Play as yourself, or try again." : "Line your face up with the oval."}</p>
    <div className="booth-view">
      {stage === "review" && shot
        ? <img src={shot} alt="Your selfie" width={SIZE} height={SIZE}/>
        : <>
          <video ref={videoRef} muted playsInline aria-label="Camera preview" hidden={stage === "error"}/>
          {stage !== "error" && <div className="booth-guide" aria-hidden="true"/>}
          {stage === "starting" && <p className="booth-note" role="status">Opening camera…</p>}
          {stage === "countdown" && <p className="booth-count" aria-live="assertive">{count}</p>}
          {stage === "error" && <p className="booth-note" role="alert">{error}</p>}
        </>}
    </div>
    <div className="chase-actions">
      {stage === "review"
        ? <><button type="button" className="button glass" onClick={() => shot && onSave(shot)}>Play as me</button><button type="button" className="button glass" onClick={retake}>Retake</button></>
        : <button type="button" className="button glass" onClick={snap} disabled={stage !== "live"}>{stage === "countdown" ? "Smile…" : "Take photo"}</button>}
      <label className="button glass booth-upload">Upload a photo<input type="file" accept="image/*" onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }}/></label>
      <button type="button" className="button glass" onClick={() => { stopCamera(); onCancel(); }}>Cancel</button>
    </div>
    <p className="booth-privacy">Your photo stays in this browser. It isn&rsquo;t uploaded anywhere.</p>
  </section>;
}

// Square crop into the shared oval (biased up on portrait photos, where faces sit high);
// the camera is mirrored to match the preview.
function ovalCrop(source: CanvasImageSource, width: number, height: number, mirror: boolean) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;
  ctx.beginPath();
  ctx.ellipse(SIZE / 2, SIZE / 2, SIZE * 0.4, SIZE * 0.5, 0, 0, Math.PI * 2);
  ctx.clip();
  if (mirror) { ctx.translate(SIZE, 0); ctx.scale(-1, 1); }
  const side = Math.min(width, height);
  ctx.drawImage(source, (width - side) / 2, (height - side) * 0.3, side, side, 0, 0, SIZE, SIZE);
  return canvas.toDataURL("image/png");
}
