"use client";

import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useTranslation } from 'react-i18next';

interface GDPRConsentProps {
  onAccept: () => void;
}

const GDPRConsent: React.FC<GDPRConsentProps> = ({ onAccept }) => {
  const [checked, setChecked] = useState(false);
  const { t } = useTranslation();

  return (
    <div className="w-full max-w-5xl mx-auto p-4 animate-fadeIn">
      <Card className="shadow-lg border border-gray-200">
        <CardContent className="p-6 space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900">{t('gdpr.title')}</h1>
          </div>

          <div className="prose max-w-none text-gray-700 space-y-4">
            <p>{t('gdpr.p1')}</p>
            <p>{t('gdpr.p2')}</p>
            <h2 className="text-xl font-semibold text-gray-900">{t('gdpr.dataTitle')}</h2>
            <p>{t('gdpr.p3')}</p>
            <p>{t('gdpr.p4')}</p>
            <p>{t('gdpr.p5')}</p>
            <h2 className="text-xl font-semibold text-gray-900">{t('gdpr.consentTitle')}</h2>
            <p>{t('gdpr.p6')}</p>
            <p>{t('gdpr.p7')}</p>
          </div>

          <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-md border">
            <Checkbox id="gdpr-accept" checked={checked} onCheckedChange={(v) => setChecked(!!v)} />
            <label htmlFor="gdpr-accept" className="text-sm text-gray-800 leading-relaxed cursor-pointer">
              {t('gdpr.checkbox')}
            </label>
          </div>

          <div className="flex justify-end">
            <Button disabled={!checked} onClick={onAccept} className="px-6">
              {t('gdpr.continue')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default GDPRConsent;
