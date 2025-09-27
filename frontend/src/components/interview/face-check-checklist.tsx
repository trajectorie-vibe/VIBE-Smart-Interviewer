"use client";

import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2, XCircle, Camera, Mic } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface FaceCheckChecklistProps {
  onComplete: () => void;
}

const FaceCheckChecklist: React.FC<FaceCheckChecklistProps> = ({ onComplete }) => {
  const { t } = useTranslation();
  const [cameraOk, setCameraOk] = useState<boolean | null>(null);
  const [micOk, setMicOk] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);

  const runChecks = async () => {
    setChecking(true);
    try {
      // Check camera
      const cam = await navigator.mediaDevices.getUserMedia({ video: true });
      cam.getTracks().forEach((trk) => trk.stop());
      setCameraOk(true);
    } catch {
      setCameraOk(false);
    }
    try {
      // Check microphone
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      mic.getTracks().forEach((trk) => trk.stop());
      setMicOk(true);
    } catch {
      setMicOk(false);
    }
    setChecking(false);
  };

  useEffect(() => {
    runChecks();
  }, []);

  const allGood = cameraOk === true && micOk === true;

  return (
    <div className="w-full max-w-3xl mx-auto animate-fadeIn">
      <Card className="shadow-lg border border-gray-200">
        <CardContent className="p-6 space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold text-gray-900">{t('facecheck.title')}</h2>
            <p className="text-gray-600">{t('facecheck.description')}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-md border">
              <div className="flex items-center gap-3 mb-2">
                <Camera className="h-5 w-5 text-gray-700" />
                <span className="font-semibold">{t('facecheck.camera.title')}</span>
              </div>
              {cameraOk === true && (
                <div className="flex items-center text-green-700 gap-2">
                  <CheckCircle2 className="h-5 w-5" />
                  <span>{t('facecheck.camera.pass')}</span>
                </div>
              )}
              {cameraOk === false && (
                <div className="flex items-center text-red-700 gap-2">
                  <XCircle className="h-5 w-5" />
                  <span>{t('facecheck.camera.fail')}</span>
                </div>
              )}
              {cameraOk === null && (
                <div className="text-gray-500">...</div>
              )}
            </div>

            <div className="p-4 rounded-md border">
              <div className="flex items-center gap-3 mb-2">
                <Mic className="h-5 w-5 text-gray-700" />
                <span className="font-semibold">{t('facecheck.mic.title')}</span>
              </div>
              {micOk === true && (
                <div className="flex items-center text-green-700 gap-2">
                  <CheckCircle2 className="h-5 w-5" />
                  <span>{t('facecheck.mic.pass')}</span>
                </div>
              )}
              {micOk === false && (
                <div className="flex items-center text-red-700 gap-2">
                  <XCircle className="h-5 w-5" />
                  <span>{t('facecheck.mic.fail')}</span>
                </div>
              )}
              {micOk === null && (
                <div className="text-gray-500">...</div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Button variant="outline" onClick={runChecks} disabled={checking}>
              {t('facecheck.retry')}
            </Button>
            <Button onClick={onComplete} disabled={!allGood}>
              {t('facecheck.start')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default FaceCheckChecklist;
