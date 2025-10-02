"use client";

import { motion } from "framer-motion";
import { Headphones, Timer, ArrowRightCircle, Globe2 } from "lucide-react";
import Link from "next/link";

export interface AssignedTestCardProps {
  assignmentId: string;
  assignmentCode?: string;
  name: string;
  testType?: string;
  languageCode?: string | null;
  allowLanguageSwitch?: boolean;
  openAt?: string | null;
  deadlineAt?: string | null;
  canStart?: boolean;
}

export function AssignedTestCard(props: AssignedTestCardProps) {
  const {
    assignmentId,
    assignmentCode,
    name,
    testType,
    languageCode,
    allowLanguageSwitch,
    openAt,
    deadlineAt,
    canStart,
  } = props;

  const href = `/interview?assignment_id=${encodeURIComponent(assignmentId)}`;

  const windowText = (() => {
    const parts: string[] = [];
    if (openAt) parts.push(`Opens ${new Date(openAt).toLocaleString()}`);
    if (deadlineAt) parts.push(`Due ${new Date(deadlineAt).toLocaleString()}`);
    return parts.join(" • ");
  })();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="rounded-xl border border-gray-200 bg-white shadow-sm hover:shadow-md transition-shadow"
    >
      <div className="p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-xl font-semibold text-gray-900">{name}</h3>
            <p className="text-sm text-gray-500 mt-1">
              {assignmentCode ? `${assignmentCode}` : null}
              {assignmentCode && testType ? " • " : null}
              {testType ? `${testType}` : null}
            </p>
          </div>
          <div className="flex items-center gap-2 text-gray-600">
            <Headphones className="h-4 w-4" />
            <span className="text-sm">Headphones recommended</span>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-gray-600">
          {languageCode ? (
            <span className="inline-flex items-center gap-1">
              <Globe2 className="h-4 w-4" />
              UI: {languageCode.toUpperCase()}
            </span>
          ) : null}
          {allowLanguageSwitch ? (
            <span className="inline-flex items-center gap-1 text-emerald-700">
              <Globe2 className="h-4 w-4" />
              Language switch allowed
            </span>
          ) : null}
          {windowText ? (
            <span className="inline-flex items-center gap-1">
              <Timer className="h-4 w-4" />
              {windowText}
            </span>
          ) : null}
        </div>
      </div>

      <div className="px-5 pb-5">
        {canStart ? (
          <Link href={href} className="block">
            <button className="w-full bg-green-600 text-white font-semibold rounded-lg py-2.5 flex items-center justify-center gap-2 hover:bg-green-700 transition-colors">
              Start assessment <ArrowRightCircle className="h-5 w-5" />
            </button>
          </Link>
        ) : (
          <button disabled className="w-full bg-gray-200 text-gray-600 font-semibold rounded-lg py-2.5 cursor-not-allowed">
            Not available yet
          </button>
        )}
      </div>
    </motion.div>
  );
}

export default AssignedTestCard;
