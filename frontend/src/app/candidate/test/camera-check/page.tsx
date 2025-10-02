"use client";

import React, { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Header from "@/components/header";
import { ProtectedRoute, useAuth } from "@/contexts/auth-context";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, Loader2, Camera, Sun, Mic, User } from "lucide-react";
import { motion } from "framer-motion";

interface CameraCondition {
  id: string;
  label: string;
  icon: React.ReactNode;
  status: "checking" | "pass" | "fail";
  message: string;
}

const LIGHTING_RECHECK_INTERVAL = 4000;
const NOISE_CHECK_INTERVAL = 2000;
const FACE_CHECK_INTERVAL = 1500;
const CENTRAL_SAMPLE = {
  xRatio: 0.35,
  yRatio: 0.25,
  widthRatio: 0.3,
  heightRatio: 0.4,
} as const;

function CameraCheckContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  useAuth();

  const assignmentId = searchParams.get("assignment_id");
  const testType = searchParams.get("test_type");

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lightingTimeoutRef = useRef<number | null>(null);
  const noiseTimeoutRef = useRef<number | null>(null);
  const faceCheckTimeoutRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [conditions, setConditions] = useState<CameraCondition[]>([
    {
      id: "camera",
      label: "Camera Access",
      icon: <Camera className="h-5 w-5" />,
      status: "checking",
      message: "Checking camera...",
    },
    {
      id: "lighting",
      label: "Lighting Quality",
      icon: <Sun className="h-5 w-5" />,
      status: "checking",
      message: "Analyzing lighting...",
    },
    {
      id: "noise",
      label: "Background Noise",
      icon: <Mic className="h-5 w-5" />,
      status: "checking",
      message: "Checking microphone...",
    },
    {
      id: "face",
      label: "Face Centering",
      icon: <User className="h-5 w-5" />,
      status: "checking",
      message: "Detecting face position...",
    },
  ]);

  const updateCondition = useCallback((id: string, status: "checking" | "pass" | "fail", message: string) => {
    setConditions((prev) => prev.map((c) => (c.id === id ? { ...c, status, message } : c)));
  }, []);

  const initializeCamera = useCallback(async () => {
    console.log("[Camera Check] Initializing camera preview...");
    try {
      setLoading(true);
      setError(null);

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user",
        },
        audio: true, // Enable audio for noise check
      });

      console.log("[Camera Check] Media stream obtained");
      streamRef.current = mediaStream;
      setStream(mediaStream);
      updateCondition("camera", "checking", "Preparing camera preview...");
      setLoading(false);
    } catch (err: any) {
      console.error("[Camera Check] Error accessing media devices:", err);
      setError("Unable to access your camera. Please check permissions and ensure no other app is using it.");
      updateCondition("camera", "fail", "Camera access denied");
      setLoading(false);
    }
  }, [updateCondition]);

  const checkBackgroundNoise = useCallback(async () => {
    if (noiseTimeoutRef.current) {
      window.clearTimeout(noiseTimeoutRef.current);
      noiseTimeoutRef.current = null;
    }

    try {
      // Request microphone access
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      micStreamRef.current = micStream;

      // Create audio context and analyser
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;
      
      const analyser = audioContext.createAnalyser();
      analyserRef.current = analyser;
      analyser.fftSize = 512;
      
      const source = audioContext.createMediaStreamSource(micStream);
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const checkNoise = () => {
        if (!analyserRef.current) return;
        
        analyser.getByteFrequencyData(dataArray);
        
        // Calculate average volume
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        
        // Calculate peak volume
        const peak = Math.max(...Array.from(dataArray));
        
        let status: "pass" | "fail" = "pass";
        let message = "Background noise is acceptable.";
        
        // Thresholds for noise detection (more lenient)
        if (average > 60) {
          status = "fail";
          message = "Too much background noise detected. Find a quieter location.";
        } else if (peak > 140) {
          status = "fail";
          message = "Intermittent loud noises detected. Reduce background sounds.";
        } else if (average > 45) {
          status = "pass";
          message = "Slight background noise detected, but acceptable.";
        } else if (average < 3) {
          status = "fail";
          message = "Microphone may not be working. Please check your microphone.";
        }
        
        updateCondition("noise", status, message);
        noiseTimeoutRef.current = window.setTimeout(checkNoise, NOISE_CHECK_INTERVAL);
      };

      checkNoise();
    } catch (err) {
      console.error("[Camera Check] Error accessing microphone:", err);
      updateCondition("noise", "fail", "Unable to access microphone. Check permissions.");
    }
  }, [updateCondition]);

  const checkFaceCentering = useCallback(() => {
    if (faceCheckTimeoutRef.current) {
      window.clearTimeout(faceCheckTimeoutRef.current);
      faceCheckTimeoutRef.current = null;
    }

    const runFaceDetection = async () => {
      const currentVideo = videoRef.current;
      if (!currentVideo || currentVideo.readyState < 2) {
        faceCheckTimeoutRef.current = window.setTimeout(runFaceDetection, 500);
        return;
      }

      try {
        // Check if FaceDetector API is available
        if ('FaceDetector' in window) {
          const faceDetector = new (window as any).FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
          
          const detectFace = async () => {
            try {
              const faces = await faceDetector.detect(currentVideo);
              
              if (faces.length === 0) {
                updateCondition("face", "fail", "No face detected. Please position yourself in frame.");
              } else {
                const face = faces[0];
                const box = face.boundingBox;
                
                // Get video dimensions
                const videoWidth = currentVideo.videoWidth;
                const videoHeight = currentVideo.videoHeight;
                
                // Calculate center of face
                const faceCenterX = box.x + box.width / 2;
                const faceCenterY = box.y + box.height / 2;
                
                // Calculate ideal center (slightly above middle for headroom)
                const idealCenterX = videoWidth * 0.5;
                const idealCenterY = videoHeight * 0.35;
                
                // Calculate face size relative to frame
                const faceArea = box.width * box.height;
                const frameArea = videoWidth * videoHeight;
                const faceSizeRatio = faceArea / frameArea;
                
                // Check centering (tolerance: 20% of frame width/height)
                const horizontalOffset = Math.abs(faceCenterX - idealCenterX) / videoWidth;
                const verticalOffset = Math.abs(faceCenterY - idealCenterY) / videoHeight;
                
                let status: "pass" | "fail" = "pass";
                let message = "Face is well centered.";
                
                // Check if face is too small (too far)
                if (faceSizeRatio < 0.08) {
                  status = "fail";
                  message = "Move closer to the camera. Your face appears too small.";
                }
                // Check if face is too large (too close)
                else if (faceSizeRatio > 0.35) {
                  status = "fail";
                  message = "Move away from the camera. Your face is too close.";
                }
                // Check horizontal centering
                else if (horizontalOffset > 0.25) {
                  status = "fail";
                  message = faceCenterX < idealCenterX 
                    ? "Move to the right to center your face."
                    : "Move to the left to center your face.";
                }
                // Check vertical centering
                else if (verticalOffset > 0.2) {
                  status = "fail";
                  message = faceCenterY < idealCenterY
                    ? "Move down slightly to center your face."
                    : "Move up slightly to center your face.";
                }
                // Good but could be better
                else if (faceSizeRatio < 0.12 || faceSizeRatio > 0.28) {
                  status = "pass";
                  message = faceSizeRatio < 0.12
                    ? "Face centered, but you could be slightly closer."
                    : "Face centered, but you could be slightly further.";
                }
                
                updateCondition("face", status, message);
              }
            } catch (err) {
              console.error("[Camera Check] Face detection error:", err);
            }
            
            faceCheckTimeoutRef.current = window.setTimeout(detectFace, FACE_CHECK_INTERVAL);
          };
          
          detectFace();
        } else {
          // Fallback: Use simple brightness-based detection in face region
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            updateCondition("face", "pass", "Face detection unavailable, proceeding...");
            return;
          }

          canvas.width = currentVideo.videoWidth;
          canvas.height = currentVideo.videoHeight;
          
          const checkFaceRegion = () => {
            ctx.drawImage(currentVideo, 0, 0);
            
            // Sample the center oval region where face should be
            const centerX = canvas.width * 0.5;
            const centerY = canvas.height * 0.35;
            const ovalWidth = canvas.width * 0.3;
            const ovalHeight = canvas.height * 0.4;
            
            const sampleX = Math.floor(centerX - ovalWidth / 2);
            const sampleY = Math.floor(centerY - ovalHeight / 2);
            const sampleW = Math.floor(ovalWidth);
            const sampleH = Math.floor(ovalHeight);
            
            try {
              const imageData = ctx.getImageData(sampleX, sampleY, sampleW, sampleH);
              const data = imageData.data;
              
              let pixelCount = 0;
              let skinTonePixels = 0;
              
              // Simple skin tone detection (heuristic)
              for (let i = 0; i < data.length; i += 4) {
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];
                
                // Skin tone rough heuristic
                if (r > 60 && g > 40 && b > 20 && r > g && r > b && Math.abs(r - g) > 15) {
                  skinTonePixels++;
                }
                pixelCount++;
              }
              
              const skinRatio = skinTonePixels / pixelCount;
              
              let status: "pass" | "fail" = "pass";
              let message = "Face appears to be centered.";
              
              if (skinRatio < 0.15) {
                status = "fail";
                message = "Position your face in the center oval guide.";
              } else if (skinRatio > 0.6) {
                status = "fail";
                message = "Move back slightly from the camera.";
              } else if (skinRatio < 0.25) {
                status = "pass";
                message = "Face detected, ensure you're centered in the guide.";
              }
              
              updateCondition("face", status, message);
            } catch (err) {
              console.error("[Camera Check] Face region check error:", err);
            }
            
            faceCheckTimeoutRef.current = window.setTimeout(checkFaceRegion, FACE_CHECK_INTERVAL);
          };
          
          checkFaceRegion();
        }
      } catch (err) {
        console.error("[Camera Check] Error initializing face detection:", err);
        updateCondition("face", "pass", "Face detection unavailable, proceeding...");
      }
    };

    runFaceDetection();
  }, [updateCondition]);

  const checkLighting = useCallback(() => {
    if (lightingTimeoutRef.current) {
      window.clearTimeout(lightingTimeoutRef.current);
      lightingTimeoutRef.current = null;
    }

    const runAnalysis = () => {
      const currentVideo = videoRef.current;
      if (!currentVideo) {
        updateCondition("lighting", "fail", "Unable to analyze lighting");
        return;
      }

      if (currentVideo.readyState < 2 || !currentVideo.videoWidth || !currentVideo.videoHeight) {
        lightingTimeoutRef.current = window.setTimeout(runAnalysis, 250);
        return;
      }

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        updateCondition("lighting", "fail", "Unable to analyze lighting");
        return;
      }

      canvas.width = currentVideo.videoWidth;
      canvas.height = currentVideo.videoHeight;
      ctx.drawImage(currentVideo, 0, 0);

      try {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        let totalBrightness = 0;
        for (let i = 0; i < data.length; i += 4) {
          totalBrightness += (data[i] + data[i + 1] + data[i + 2]) / 3;
        }
        const avgBrightness = totalBrightness / (data.length / 4);

  const sampleWidth = Math.max(1, Math.floor(canvas.width * CENTRAL_SAMPLE.widthRatio));
  const sampleHeight = Math.max(1, Math.floor(canvas.height * CENTRAL_SAMPLE.heightRatio));
  const sampleX = Math.min(canvas.width - sampleWidth, Math.floor(canvas.width * CENTRAL_SAMPLE.xRatio));
  const sampleY = Math.min(canvas.height - sampleHeight, Math.floor(canvas.height * CENTRAL_SAMPLE.yRatio));

        const region = ctx.getImageData(sampleX, sampleY, sampleWidth, sampleHeight).data;
        let regionBrightness = 0;
        for (let j = 0; j < region.length; j += 4) {
          regionBrightness += (region[j] + region[j + 1] + region[j + 2]) / 3;
        }
        const subjectBrightness = regionBrightness / (region.length / 4);

        let status: "pass" | "fail" = "pass";
        let message = "Lighting looks good.";

        if (avgBrightness < 70) {
          status = "fail";
          message = "Too dark - add front lighting so your face is clearly visible.";
        } else if (avgBrightness > 225) {
          status = "fail";
          message = "Too bright - move away from direct light or reduce screen glare.";
        } else if (subjectBrightness < 85) {
          status = "fail";
          message = "Increase front lighting so your face is brighter.";
        } else if (avgBrightness < 95) {
          status = "pass";
          message = "Lighting is acceptable, but a bit more light would help.";
        }

        updateCondition("lighting", status, message);
      } catch (err) {
        console.error("[Camera Check] Error analyzing lighting:", err);
        updateCondition("lighting", "fail", "Unable to analyze lighting. Check your setup and retry.");
      }

      lightingTimeoutRef.current = window.setTimeout(checkLighting, LIGHTING_RECHECK_INTERVAL);
    };

    runAnalysis();
  }, [updateCondition]);

  useEffect(() => {
    if (!assignmentId || !testType) {
      router.push("/candidate");
      return;
    }

    initializeCamera();

    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      micStreamRef.current?.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
      audioContextRef.current?.close();
      audioContextRef.current = null;
      if (lightingTimeoutRef.current) {
        window.clearTimeout(lightingTimeoutRef.current);
        lightingTimeoutRef.current = null;
      }
      if (noiseTimeoutRef.current) {
        window.clearTimeout(noiseTimeoutRef.current);
        noiseTimeoutRef.current = null;
      }
      if (faceCheckTimeoutRef.current) {
        window.clearTimeout(faceCheckTimeoutRef.current);
        faceCheckTimeoutRef.current = null;
      }
    };
  }, [assignmentId, testType, router, initializeCamera]);

  useEffect(() => {
    const video = videoRef.current;
    if (!stream || !video) {
      return;
    }

    video.srcObject = stream;
    video.muted = true;

    const handleReady = () => {
      video.play().catch((err) => console.log("[Camera Check] Play prevented:", err));
      updateCondition("camera", "pass", "Camera connected");
      setTimeout(checkLighting, 350);
      setTimeout(checkBackgroundNoise, 500);
      setTimeout(checkFaceCentering, 800);
    };

    if (video.readyState >= 2) {
      handleReady();
    } else {
      video.addEventListener("loadedmetadata", handleReady, { once: true });
    }

    return () => {
      video.removeEventListener("loadedmetadata", handleReady);
    };
  }, [stream, updateCondition, checkLighting, checkBackgroundNoise, checkFaceCentering]);

  const stopStreamsAndTimers = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setStream(null);
    micStreamRef.current?.getTracks().forEach((track) => track.stop());
    micStreamRef.current = null;
    audioContextRef.current?.close();
    audioContextRef.current = null;
    if (lightingTimeoutRef.current) {
      window.clearTimeout(lightingTimeoutRef.current);
      lightingTimeoutRef.current = null;
    }
    if (noiseTimeoutRef.current) {
      window.clearTimeout(noiseTimeoutRef.current);
      noiseTimeoutRef.current = null;
    }
    if (faceCheckTimeoutRef.current) {
      window.clearTimeout(faceCheckTimeoutRef.current);
      faceCheckTimeoutRef.current = null;
    }
  }, []);

  const allConditionsPassed = conditions.every((c) => c.status === "pass");
  const anyConditionFailed = conditions.some((c) => c.status === "fail");

  const handleContinue = () => {
    if (typeof window !== "undefined" && assignmentId) {
      try {
        window.sessionStorage.setItem(`camera-check:${assignmentId}`, "passed");
      } catch (err) {
        console.warn("[Camera Check] Unable to persist gate flag", err);
      }
    }
    router.push(`/candidate/test/questions?assignment_id=${assignmentId}&test_type=${testType}`);
  };

  const handleBack = () => {
    stopStreamsAndTimers();
    router.push(`/candidate/test/gdpr?assignment_id=${assignmentId}&test_type=${testType}`);
  };

  const handleRetry = () => {
    stopStreamsAndTimers();
    setConditions((prev) => prev.map((c) => ({ ...c, status: "checking", message: `Checking ${c.label.toLowerCase()}...` })));
    void initializeCamera();
  };

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-white via-orange-50 to-red-50">
      <Header />
      <main className="flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-8 text-center"
          >
            <h1 className="text-4xl font-bold text-gray-900">Camera Setup Check</h1>
            <p className="mt-3 text-lg text-gray-600">Let’s make sure your camera and lighting are ready</p>
          </motion.div>

          {loading ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-20">
              <Loader2 className="mb-4 h-12 w-12 animate-spin text-orange-600" />
              <p className="text-gray-600">Setting up your camera...</p>
            </motion.div>
          ) : error ? (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="py-12 text-center">
              <Card className="border-2 border-red-200">
                <CardContent className="pt-6">
                  <XCircle className="mx-auto mb-4 h-16 w-16 text-red-500" />
                  <h2 className="mb-2 text-2xl font-bold text-gray-900">Camera Access Required</h2>
                  <p className="mb-6 text-gray-600">{error}</p>
                  <div className="flex justify-center gap-4">
                    <Button variant="outline" onClick={handleBack}>
                      Go Back
                    </Button>
                    <Button onClick={handleRetry}>Try Again</Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ) : (
            <div className="grid gap-8 lg:grid-cols-2">
              <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5, delay: 0.2 }}>
                <Card className="overflow-hidden border-2 border-orange-200 shadow-xl">
                  <CardContent className="p-0">
                    <div className="relative aspect-video bg-black">
                      <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
                      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                        <div className="relative flex aspect-[9/16] w-[54%] max-w-[280px] items-center justify-center">
                          {/* Simple oval outline guide */}
                          <svg
                            viewBox="0 0 220 360"
                            className="absolute inset-0 h-full w-full"
                          >
                            <defs>
                              <linearGradient id="camera-oval-glow" x1="0" x2="0" y1="0" y2="1">
                                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
                                <stop offset="50%" stopColor="#ffffff" stopOpacity="0.7" />
                                <stop offset="100%" stopColor="#ffffff" stopOpacity="0.5" />
                              </linearGradient>
                              <filter id="glow">
                                <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                                <feMerge>
                                  <feMergeNode in="coloredBlur"/>
                                  <feMergeNode in="SourceGraphic"/>
                                </feMerge>
                              </filter>
                            </defs>
                            {/* Main oval outline - matches the detection area */}
                            <ellipse
                              cx="110"
                              cy="180"
                              rx="75"
                              ry="140"
                              fill="none"
                              stroke="url(#camera-oval-glow)"
                              strokeWidth="4"
                              strokeDasharray="12 8"
                              strokeLinecap="round"
                              filter="url(#glow)"
                              className="drop-shadow-[0_2px_12px_rgba(255,255,255,0.6)]"
                            />
                            {/* Inner oval for better guidance */}
                            <ellipse
                              cx="110"
                              cy="180"
                              rx="70"
                              ry="135"
                              fill="none"
                              stroke="url(#camera-oval-glow)"
                              strokeWidth="1"
                              strokeDasharray="6 6"
                              strokeLinecap="round"
                              opacity="0.5"
                            />
                          </svg>
                        </div>
                        <div className="mt-5 px-4 text-center text-xs font-medium uppercase tracking-wide text-white/90 drop-shadow-[0_2px_8px_rgba(0,0,0,0.7)]">
                          Position your face inside the oval
                        </div>
                      </div>
                      <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-red-500 px-3 py-1 text-sm font-semibold text-white">
                        <div className="h-2 w-2 animate-pulse rounded-full bg-white" />
                        LIVE
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.4 }}
                className="space-y-4"
              >
                <Card className="border-2 border-red-200 shadow-xl">
                  <CardContent className="space-y-4 pt-6">
                    <h2 className="mb-4 text-2xl font-bold text-gray-900">System Check</h2>
                    {conditions.map((condition, index) => (
                      <motion.div
                        key={condition.id}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.3, delay: 0.6 + index * 0.1 }}
                        className={`rounded-lg border-2 p-4 transition-all ${
                          condition.status === "pass"
                            ? "border-green-300 bg-green-50"
                            : condition.status === "fail"
                            ? "border-red-300 bg-red-50"
                            : "border-gray-300 bg-gray-50"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`rounded-lg p-2 ${
                              condition.status === "pass"
                                ? "bg-green-600 text-white"
                                : condition.status === "fail"
                                ? "bg-red-600 text-white"
                                : "bg-gray-400 text-white"
                            }`}
                          >
                            {condition.icon}
                          </div>
                          <div className="flex-1">
                            <div className="mb-1 flex items-center justify-between">
                              <h3 className="font-semibold text-gray-900">{condition.label}</h3>
                              {condition.status === "checking" && <Loader2 className="h-5 w-5 animate-spin text-gray-600" />}
                              {condition.status === "pass" && <CheckCircle className="h-6 w-6 text-green-600" />}
                              {condition.status === "fail" && <XCircle className="h-6 w-6 text-red-600" />}
                            </div>
                            <p
                              className={`text-sm ${
                                condition.status === "pass"
                                  ? "text-green-700"
                                  : condition.status === "fail"
                                  ? "text-red-700"
                                  : "text-gray-600"
                              }`}
                            >
                              {condition.message}
                            </p>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </CardContent>
                </Card>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 1 }}
                  className="flex gap-4"
                >
                  <Button variant="outline" onClick={handleBack} className="flex-1">
                    Back
                  </Button>
                  {anyConditionFailed && (
                    <Button onClick={handleRetry} variant="outline" className="flex-1">
                      Retry Check
                    </Button>
                  )}
                  <Button
                    onClick={handleContinue}
                    disabled={!allConditionsPassed}
                    className={`flex-1 ${
                      allConditionsPassed ? "bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700" : ""
                    }`}
                  >
                    {allConditionsPassed ? "Continue to Test" : "Waiting for checks..."}
                  </Button>
                </motion.div>

                {allConditionsPassed && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5 }}
                    className="rounded-lg border-2 border-green-300 bg-green-50 p-4 text-center"
                  >
                    <CheckCircle className="mx-auto mb-2 h-8 w-8 text-green-600" />
                    <p className="font-semibold text-green-800">All checks passed!</p>
                    <p className="text-sm text-green-700">You&apos;re ready to begin the test</p>
                  </motion.div>
                )}
              </motion.div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default function CameraCheckPage() {
  return (
    <ProtectedRoute allowedRoles={["candidate"]}>
      <Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-orange-600" />
          </div>
        }
      >
        <CameraCheckContent />
      </Suspense>
    </ProtectedRoute>
  );
}
