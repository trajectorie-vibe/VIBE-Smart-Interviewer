"use client";

import React, { useState } from "react";
import { motion } from 'framer-motion';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useTranslation } from 'react-i18next';
import { Shield, CheckCircle2 } from 'lucide-react';

interface GDPRConsentProps {
  onAccept: () => void;
}

const GDPRConsent: React.FC<GDPRConsentProps> = ({ onAccept }) => {
  const [checked, setChecked] = useState(false);
  const { t } = useTranslation();

  return (
    <div className="flex min-h-screen flex-col bg-white text-gray-900">
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-6 py-8">
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          <Card className="border-gray-200 bg-white shadow-sm">
            <CardContent className="p-8 space-y-6">
              {/* Header Section */}
              <div className="text-center pb-4">
                <div className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium uppercase tracking-wider text-gray-700 mb-4">
                  <Shield className="h-3 w-3" /> Privacy & Consent
                </div>
                <h1 className="text-3xl font-semibold leading-tight text-gray-900">{t('gdpr.title')}</h1>
              </div>

              {/* Content Section */}
              <div className="prose max-w-none text-gray-600 space-y-4">
                <p className="text-base">{t('gdpr.p1')}</p>
                <p className="text-base">{t('gdpr.p2')}</p>
                
                <h2 className="text-lg font-semibold text-gray-900 mt-6">{t('gdpr.dataTitle')}</h2>
                <p className="text-base">{t('gdpr.p3')}</p>
                <p className="text-base">{t('gdpr.p4')}</p>
                <p className="text-base">{t('gdpr.p5')}</p>
                
                <h2 className="text-lg font-semibold text-gray-900 mt-6">{t('gdpr.consentTitle')}</h2>
                <p className="text-base">{t('gdpr.p6')}</p>
                <p className="text-base">{t('gdpr.p7')}</p>
              </div>

              {/* Checkbox Section */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3, duration: 0.4 }}
                className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg border border-gray-200 mt-6"
              >
                <Checkbox 
                  id="gdpr-accept" 
                  checked={checked} 
                  onCheckedChange={(v) => setChecked(!!v)}
                  className="mt-0.5"
                />
                <label htmlFor="gdpr-accept" className="text-sm text-gray-900 leading-relaxed cursor-pointer flex-1">
                  {t('gdpr.checkbox')}
                </label>
                {checked && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 200 }}
                  >
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  </motion.div>
                )}
              </motion.div>

              {/* Action Button */}
              <div className="flex justify-end pt-4">
                <Button 
                  disabled={!checked} 
                  onClick={onAccept} 
                  className="px-8 bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50"
                  size="lg"
                >
                  {t('gdpr.continue')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Footer Tip */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.4 }}
          className="text-center text-xs text-gray-600"
        >
          Please review and accept the terms above to proceed with your assessment.
        </motion.div>
      </main>
    </div>
  );
};

export default GDPRConsent;

{/* PRESERVED ORIGINAL CODE FOR REFERENCE
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
*/}
