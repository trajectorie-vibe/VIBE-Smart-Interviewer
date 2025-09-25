'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface CameraCheckProps {
  onPassed: () => void;
  onSkip?: () => void; // optional in case admin disabled; not shown if check enforced
}

// Utility: compute average brightness and motion between frames
function analyzeFrame(prev: ImageData | null, curr: ImageData) {
  const data = curr.data;
  let total = 0;
  for (let i = 0; i < data.length; i += 4) {
    // luminance approx
    const r = data[i], g = data[i + 1], b = data[i + 2];
    total += 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  const avgBrightness = total / (data.length / 4);

  let motion = 0;
  if (prev) {
    const p = prev.data;
    let diffSum = 0;
    const len = data.length;
    for (let i = 0; i < len; i += 4) {
      const dr = Math.abs(data[i] - p[i]);
      const dg = Math.abs(data[i + 1] - p[i + 1]);
      const db = Math.abs(data[i + 2] - p[i + 2]);
      diffSum += (dr + dg + db) / 3;
    }
    motion = diffSum / (len / 4);
  }

  return { avgBrightness, motion };
}

export default function CameraCheck({ onPassed, onSkip }: CameraCheckProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [guidance, setGuidance] = useState<string>('Position your face within the dotted oval.');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [brightness, setBrightness] = useState<number>(0);
  const [motion, setMotion] = useState<number>(0);
  const [centerScore, setCenterScore] = useState<number>(0); // 0..1 heuristic
  const [samplesGood, setSamplesGood] = useState<number>(0);

  useEffect(() => {
    const start = async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
        setStream(s);
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          await videoRef.current.play();
        }
      } catch (e: any) {
        setError('Unable to access camera. Please allow permissions and ensure a webcam is connected.');
      }
    };
    start();
    return () => {
      if (stream) stream.getTracks().forEach(t => t.stop());
    };
  }, []);

  useEffect(() => {
    let raf = 0;
    let prev: ImageData | null = null;
    const tick = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) { raf = requestAnimationFrame(tick); return; }
      const w = canvas.width = 320; const h = canvas.height = 240;
      const ctx = canvas.getContext('2d');
      if (!ctx) { raf = requestAnimationFrame(tick); return; }
      ctx.drawImage(video, 0, 0, w, h);
      const curr = ctx.getImageData(0, 0, w, h);
      const { avgBrightness, motion: m } = analyzeFrame(prev, curr);
      setBrightness(avgBrightness);
      setMotion(m);

      // Heuristic face-centering without ML: use dark/light center mass difference
      // We approximate that the head occupies center. Compute center-window intensity vs edges.
      const centerBox = { x: w * 0.35, y: h * 0.25, w: w * 0.30, h: h * 0.50 };
      let centerSum = 0, centerCount = 0, edgeSum = 0, edgeCount = 0;
      for (let y = 0; y < h; y += 2) {
        for (let x = 0; x < w; x += 2) {
          const idx = (y * w + x) * 4;
          const lum = 0.2126 * curr.data[idx] + 0.7152 * curr.data[idx + 1] + 0.0722 * curr.data[idx + 2];
          const inCenter = x >= centerBox.x && x <= centerBox.x + centerBox.w && y >= centerBox.y && y <= centerBox.y + centerBox.h;
          if (inCenter) { centerSum += lum; centerCount++; } else { edgeSum += lum; edgeCount++; }
        }
      }
      const centerAvg = centerSum / Math.max(1, centerCount);
      const edgeAvg = edgeSum / Math.max(1, edgeCount);
      // If the center differs from edges reasonably, assume head presence; score proximity 0..1
      const score = Math.max(0, Math.min(1, Math.abs(centerAvg - edgeAvg) / 30));
      setCenterScore(score);

      // Guidance
      let msg = 'Position your face within the dotted oval.';
      if (avgBrightness < 60) msg = 'Increase lighting in front of you.';
      else if (avgBrightness > 230) msg = 'Reduce harsh lighting; avoid overexposure.';
      else if (m > 8) msg = 'Reduce background movement or stabilize camera.';
      else if (score < 0.35) msg = 'Bring your head to the center of the frame.';
      setGuidance(msg);

      // Success window: brightness good, motion low, center score decent, for several consecutive frames
      const good = avgBrightness >= 60 && avgBrightness <= 230 && m <= 8 && score >= 0.35;
      setSamplesGood(prevCount => {
        const next = good ? prevCount + 1 : 0;
        if (next >= 30) { // ~1s stable at ~30fps
          onPassed();
        }
        return next;
      });

      prev = curr;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [onPassed]);

  return (
    <div className="w-full max-w-3xl">
      <Card className="bg-card/60 backdrop-blur-xl">
        <CardContent className="p-6">
          <h2 className="text-xl font-semibold mb-2">Camera Readiness Check</h2>
          <p className="text-sm text-muted-foreground mb-4">
            For best results, please follow these guidelines:
          </p>
          <ul className="list-disc pl-5 text-sm text-muted-foreground mb-4 space-y-1">
            <li>Center your head within the dotted guide. Keep eyes at roughly the upper third of the frame.</li>
            <li>Ensure good, even lighting on your face (avoid backlight/windows behind you).</li>
            <li>Choose a plain, quiet background; minimize background movement.</li>
            <li>Keep the camera steady at eye level and sit at arm’s length.</li>
            <li>Remove sunglasses, hats; tidy hair away from face.</li>
            <li>Wear appropriate attire and ensure your face is clearly visible.</li>
            <li>Optional: Use headphones/quiet room to reduce noise.</li>
          </ul>

          {error && (
            <div className="text-red-600 mb-3">{error}</div>
          )}

          <div className="relative w-full max-w-xl mx-auto">
            <video ref={videoRef} className="w-full rounded-md bg-black" playsInline muted />
            {/* Dotted oval guide */}
            <div
              ref={overlayRef}
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
            >
              <div
                className="border-2 border-dashed border-white/80 rounded-full"
                style={{ width: '60%', height: '70%' }}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 text-sm mt-3">
            <div>
              <div className="text-muted-foreground">Brightness</div>
              <div>{Math.round(brightness)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Background Motion</div>
              <div>{motion.toFixed(1)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Centering Score</div>
              <div>{(centerScore * 100).toFixed(0)}%</div>
            </div>
          </div>

          <div className="mt-4 text-base font-medium text-center">
            {guidance}
          </div>

          <div className="mt-4 text-center text-xs text-muted-foreground">
            This check will continue automatically. Once you’re properly framed with good lighting and a steady background, you’ll proceed.
          </div>

          <div className="flex items-center justify-center gap-3 mt-6">
            {onSkip && (
              <Button type="button" variant="ghost" onClick={onSkip}>Skip</Button>
            )}
          </div>

          {/* Offscreen canvas for analysis */}
          <canvas ref={canvasRef} style={{ display: 'none' }} />
        </CardContent>
      </Card>
    </div>
  );
}
