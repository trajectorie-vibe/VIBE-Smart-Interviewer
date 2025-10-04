'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, AlertTriangle, Camera, Video } from 'lucide-react';

interface CameraCheckProps {
  onPassed: () => void;
  onSkip?: () => void; // optional skip if admin allows
}

type Guidance = 'centered' | 'left' | 'right' | 'up' | 'down';

export default function CameraCheck({ onPassed, onSkip }: CameraCheckProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastHumanDetectedRef = useRef<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [passed, setPassed] = useState(false);
  const [messages, setMessages] = useState<string[]>([]);
  const [analyzing, setAnalyzing] = useState(true);
  const [checklist, setChecklist] = useState({
    lighting: false,
    centering: false,
    background: false,
    human: false,
    camera: false,
  });

  // Thresholds
  const BRIGHTNESS_MIN = 60;      // acceptable lower brightness
  const BRIGHTNESS_MAX = 200;     // acceptable upper brightness
  const MOTION_MAX = 12;          // average pixel delta allowed
  const CENTERING_MIN = 1.05;     // center brightness ratio vs edges
  const STABLE_MS = 900;          // stability window
  const [stableSince, setStableSince] = useState<number | null>(null);

  useEffect(() => {
    let rafId: number | null = null;
    const loopRunningRef = { current: false } as { current: boolean };
    let faceDetector: any = null;
    let lastFaceCheck = 0;

    const start = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setError('Your browser does not support camera access.');
          setAnalyzing(false);
          return;
        }
        // Prefer front-facing camera and stable constraints
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: 'user' }, 
          audio: false 
        });
        streamRef.current = stream;
        if (videoRef.current) {
          const video = videoRef.current;
          video.srcObject = stream;
          // Wait for metadata to ensure dimensions are known
          await new Promise<void>(resolve => {
            const onLoaded = () => { 
              video.removeEventListener('loadedmetadata', onLoaded); 
              resolve();
            };
            video.addEventListener('loadedmetadata', onLoaded, { once: true });
          });
          await video.play().catch(() => {});
        }
        // Restart stream automatically if a track ends (common cause of flicker)
        stream.getVideoTracks().forEach(track => {
          track.addEventListener('ended', async () => {
            try {
              // Attempt a quick restart once
              const newStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
              streamRef.current = newStream;
              if (videoRef.current) {
                videoRef.current.srcObject = newStream;
                await videoRef.current.play().catch(() => {});
              }
            } catch (e) {
              console.warn('Failed to auto-restart camera track:', e);
              setError('Camera disconnected. Please re-enable your camera.');
            }
          });
        });
        // Initialize native FaceDetector if available
        try {
          // @ts-ignore - experimental web API
          if (typeof (window as any).FaceDetector !== 'undefined') {
            // @ts-ignore
            faceDetector = new (window as any).FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
          }
        } catch (e) {
          faceDetector = null;
        }
        if (!loopRunningRef.current) {
          loopRunningRef.current = true;
          analyzeLoop();
        }
      } catch (e) {
        console.error('Camera access error', e);
        setError('Please allow camera access to continue.');
        setAnalyzing(false);
      }
    };

    const analyzeLoop = () => {
      rafId = requestAnimationFrame(analyzeLoop);
      if (!videoRef.current || !canvasRef.current) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      // Skip frames until we have enough data to draw
      if (video.readyState < 2 /* HAVE_CURRENT_DATA */) {
        return;
      }
      const w = (canvas.width = video.videoWidth || 640);
      const h = (canvas.height = video.videoHeight || 480);
      const ctx = canvas.getContext('2d');
      if (!ctx || w === 0 || h === 0) return;
      ctx.drawImage(video, 0, 0, w, h);
      const imageData = ctx.getImageData(0, 0, w, h);
      const data = imageData.data;

      const brightness = averageBrightness(data);
      const motion = estimateMotion(ctx, w, h);
      const { centerRatio, guidance } = estimateCenteringAndGuidance(ctx, w, h);

      // Throttled human face detection using FaceDetector if supported
      let humanDetected = false;
      const nowTs = performance.now();
      if (faceDetector && nowTs - lastFaceCheck > 150) {
        lastFaceCheck = nowTs;
        // Run detection in a microtask to avoid making analyzeLoop async
        (async () => {
          try {
            const faces = await faceDetector.detect(videoRef.current as HTMLVideoElement);
            lastHumanDetectedRef.current = Array.isArray(faces) && faces.length > 0;
          } catch {}
        })();
      }
      // Use last known result (or heuristic if no FaceDetector)
      humanDetected = faceDetector
        ? lastHumanDetectedRef.current
        : (centerRatio >= CENTERING_MIN && brightness >= BRIGHTNESS_MIN && brightness <= BRIGHTNESS_MAX);

      const issues: string[] = [];
      if (brightness < BRIGHTNESS_MIN) issues.push('Lighting is low — face a brighter light or move to a brighter area.');
      if (brightness > BRIGHTNESS_MAX) issues.push('Strong backlight detected — reduce bright light behind you.');
      if (motion > MOTION_MAX) issues.push('Background movement detected — choose a stable, calm background.');
      if (centerRatio < CENTERING_MIN) {
        const dirMsg = guidanceToMessage(guidance);
        issues.push(dirMsg || 'Center your head inside the dotted guide.');
      }
      if (!humanDetected) issues.push('We could not detect a face. Make sure your face is visible in the frame.');

      setMessages(issues.length ? issues : ['Great! You look ready.']);
      setChecklist({
        lighting: brightness >= BRIGHTNESS_MIN && brightness <= BRIGHTNESS_MAX,
        centering: centerRatio >= CENTERING_MIN,
        background: motion <= MOTION_MAX,
        human: humanDetected,
        camera: true,
      });

      const allGood = issues.length === 0;
      setAnalyzing(false);
      const now = performance.now();
      if (allGood) {
        if (stableSince === null) setStableSince(now);
        else if (now - stableSince >= STABLE_MS && !passed) {
          setPassed(true);
        }
      } else if (stableSince !== null) {
        setStableSince(null);
        if (passed) setPassed(false);
      }
    };

    // Pause/resume analysis on tab visibility to reduce hiccups
    const onVisibility = () => {
      if (document.hidden) {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = null;
      } else if (!rafId) {
        analyzeLoop();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    start();
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
      loopRunningRef.current = false;
      // Stop and release stream
      streamRef.current?.getTracks().forEach(t => t.stop());
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [onPassed, passed, stableSince]);

  return (
    <div className="flex min-h-screen flex-col bg-white text-gray-900">
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-8">
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          <Card className="border-gray-200 bg-white shadow-sm">
            <CardContent className="p-8 space-y-6">
              {/* Header Section */}
              <div className="mb-4">
                <div className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium uppercase tracking-wider text-gray-700 mb-4">
                  <Video className="h-3 w-3" /> Camera Check
                </div>
                <h3 className="text-2xl font-semibold text-gray-900">Camera Readiness Check</h3>
                <p className="text-sm text-gray-600 mt-2">Ensure your camera and environment meet the requirements</p>
              </div>

              {/* Video Preview */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2, duration: 0.4 }}
                className="relative rounded-lg overflow-hidden bg-black border border-gray-200"
              >
                <video ref={videoRef} playsInline muted className="w-full h-auto" />
                {/* Dotted oval guide */}
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
                  <div className="rounded-full border-2 border-dashed" style={{ width: '60%', height: '60%', borderColor: 'rgba(255,255,255,0.9)' }} />
                </div>
                <canvas ref={canvasRef} className="hidden" />
              </motion.div>

              {/* Messages and Checklist */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4, duration: 0.4 }}
                className="space-y-4"
              >
                {error ? (
                  <div className="flex items-center gap-2 p-4 rounded-lg border border-red-300 bg-red-50 text-red-700">
                    <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                    <span className="text-sm">{error}</span>
                  </div>
                ) : (
                  <>
                    {/* Status Messages */}
                    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                      <ul className="space-y-2 text-sm text-gray-900">
                        {messages.map((m, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="text-gray-600">•</span>
                            <span>{m}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Checklist Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <ChecklistItem label="Lighting" ok={checklist.lighting} desc="Face a light source; avoid strong backlight." />
                      <ChecklistItem label="Framing & Centering" ok={checklist.centering} desc="Align your head within the dotted oval." />
                      <ChecklistItem label="Background" ok={checklist.background} desc="Keep background still; minimize movement." />
                      <ChecklistItem label="Face detected" ok={checklist.human} desc="Ensure your face is clearly visible to the camera." />
                      <ChecklistItem label="Camera On" ok={checklist.camera} desc="Ensure your camera is active." />
                    </div>
                  </>
                )}
              </motion.div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                <div className="text-xs text-gray-600 max-w-md">
                  <strong>Tips:</strong> Center yourself in the oval, use front lighting, and keep the background calm.
                </div>
                <div className="flex items-center gap-3">
                  {onSkip && (
                    <Button 
                      type="button" 
                      variant="ghost" 
                      onClick={onSkip} 
                      disabled={!!error || analyzing}
                      className="text-gray-700 hover:text-gray-900"
                    >
                      Skip
                    </Button>
                  )}
                  <Button 
                    onClick={() => onPassed()} 
                    disabled={!passed || !!error || analyzing}
                    className="bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50"
                  >
                    Continue
                  </Button>
                  {passed && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 200 }}
                      className="text-green-600 flex items-center gap-1 font-medium text-sm"
                    >
                      <CheckCircle className="h-4 w-4" /> Ready
                    </motion.div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Footer Tip */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.4 }}
          className="text-center text-xs text-gray-600"
        >
          This check helps ensure the best quality for your video assessment.
        </motion.div>
      </main>
    </div>
  );
}

{/* PRESERVED ORIGINAL CODE FOR REFERENCE
  return (
    <div className="w-full flex justify-center">
      <Card className="w-full max-w-3xl bg-card/60 backdrop-blur-xl">
        <CardContent className="p-6">
          <div className="mb-4 flex items-center gap-2">
            <Camera className="h-5 w-5" />
            <h3 className="font-semibold">Quick camera readiness check</h3>
          </div>
          <div className="relative rounded-md overflow-hidden bg-black">
            <video ref={videoRef} playsInline muted className="w-full h-auto" />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
              <div className="rounded-full border-2 border-dashed" style={{ width: '60%', height: '60%', borderColor: 'rgba(255,255,255,0.8)' }} />
            </div>
            <canvas ref={canvasRef} className="hidden" />
          </div>

          <div className="mt-4 space-y-2">
            {error ? (
              <div className="text-amber-600 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" /> {error}
              </div>
            ) : (
              <>
                <ul className="text-sm list-disc pl-5">
                  {messages.map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3 text-sm">
                  <ChecklistItem label="Lighting" ok={checklist.lighting} desc="Face a light source; avoid strong backlight." />
                  <ChecklistItem label="Framing & Centering" ok={checklist.centering} desc="Align your head within the dotted oval." />
                  <ChecklistItem label="Background" ok={checklist.background} desc="Keep background still; minimize movement." />
                  <ChecklistItem label="Face detected" ok={checklist.human} desc="Ensure your face is clearly visible to the camera." />
                  <ChecklistItem label="Camera On" ok={checklist.camera} desc="Ensure your camera is active." />
                </div>
              </>
            )}
          </div>

          <div className="mt-4 flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              Tips: center yourself in the oval, use front lighting, and keep the background calm.
            </div>
            <div className="flex items-center gap-2">
              {onSkip && (
                <Button type="button" variant="ghost" onClick={onSkip} disabled={!!error || analyzing}>Skip</Button>
              )}
              <Button onClick={() => onPassed()} disabled={!passed || !!error || analyzing}>
                Continue
              </Button>
              {passed && (
                <div className="text-green-600 flex items-center gap-1">
                  <CheckCircle className="h-4 w-4" /> Ready
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
*/}

// Helper components & functions
const ChecklistItem: React.FC<{ label: string; ok: boolean; desc: string }> = ({ label, ok, desc }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.3 }}
    className={`p-4 rounded-lg border ${ok ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-white'}`}
  >
    <div className={`font-semibold text-sm flex items-center gap-2 ${ok ? 'text-green-700' : 'text-gray-900'}`}>
      {ok && <CheckCircle className="h-4 w-4" />}
      {label}
    </div>
    <p className={`text-xs mt-1 ${ok ? 'text-green-600' : 'text-gray-600'}`}>{desc}</p>
  </motion.div>
);

{/* PRESERVED ORIGINAL CODE FOR REFERENCE
const ChecklistItem: React.FC<{ label: string; ok: boolean; desc: string }> = ({ label, ok, desc }) => (
  <div className="p-3 rounded-md border bg-white/50">
    <div className={`font-medium ${ok ? 'text-green-600' : 'text-gray-700'}`}>{label}</div>
    <p className="text-muted-foreground text-xs">{desc}</p>
  </div>
);
*/}

function averageBrightness(data: Uint8ClampedArray) {
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) {
    sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  }
  return sum / (data.length / 4);
}

let prevFrame: ImageData | null = null;
function estimateMotion(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const curr = ctx.getImageData(0, 0, w, h);
  let motion = 0;
  if (prevFrame && prevFrame.data.length === curr.data.length) {
    for (let i = 0; i < curr.data.length; i += 4 * 16) {
      const d = Math.abs(curr.data[i] - prevFrame.data[i]) +
        Math.abs(curr.data[i + 1] - prevFrame.data[i + 1]) +
        Math.abs(curr.data[i + 2] - prevFrame.data[i + 2]);
      motion += d / 3;
    }
    motion = motion / (curr.data.length / (4 * 16));
  }
  prevFrame = curr;
  return motion;
}

function estimateCenteringAndGuidance(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const boxBrightness = (x: number, y: number, bw: number, bh: number) => {
    const id = ctx.getImageData(x, y, bw, bh).data;
    return averageBrightness(id);
  };
  const cw = Math.floor(w * 0.3);
  const ch = Math.floor(h * 0.3);
  const cx = Math.floor((w - cw) / 2);
  const cy = Math.floor((h - ch) / 2);
  const center = boxBrightness(cx, cy, cw, ch);

  const edgeW = Math.floor(w * 0.2);
  const edgeH = Math.floor(h * 0.2);
  const edges = [
    boxBrightness(0, 0, edgeW, edgeH),
    boxBrightness(w - edgeW, 0, edgeW, edgeH),
    boxBrightness(0, h - edgeH, edgeW, edgeH),
    boxBrightness(w - edgeW, h - edgeH, edgeW, edgeH)
  ];
  const edgeAvg = edges.reduce((a, b) => a + b, 0) / edges.length;
  const centerRatio = center / Math.max(1, edgeAvg);

  // Brightness centroid for directional hint
  const grid = 8;
  let sum = 0, sx = 0, sy = 0;
  for (let gy = 0; gy < grid; gy++) {
    for (let gx = 0; gx < grid; gx++) {
      const x = Math.floor((gx + 0.5) * (w / grid));
      const y = Math.floor((gy + 0.5) * (h / grid));
      const b = boxBrightness(Math.max(0, x - 2), Math.max(0, y - 2), Math.min(4, w - x), Math.min(4, h - y));
      const weight = b + 1;
      sum += weight;
      sx += weight * x;
      sy += weight * y;
    }
  }
  const cxBright = sx / Math.max(1, sum);
  const cyBright = sy / Math.max(1, sum);
  const dx = (cx - cxBright) / w;
  const dy = (cy - cyBright) / h;

  let guidance: Guidance = 'centered';
  const th = 0.05;
  if (Math.abs(dx) > Math.abs(dy)) {
    if (dx > th) guidance = 'right';
    else if (dx < -th) guidance = 'left';
  } else {
    if (dy > th) guidance = 'down';
    else if (dy < -th) guidance = 'up';
  }

  return { centerRatio, guidance };
}

function guidanceToMessage(g: Guidance | undefined) {
  switch (g) {
    case 'left': return 'Move slightly to your left.';
    case 'right': return 'Move slightly to your right.';
    case 'up': return 'Move slightly upward.';
    case 'down': return 'Move slightly downward.';
    default: return '';
  }
}
