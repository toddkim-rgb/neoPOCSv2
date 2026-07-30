import React from 'react';
import { ScanLine } from 'lucide-react';

interface PdaFooterProps {
  onOpenScanner: () => void;
}

export const PdaFooter: React.FC<PdaFooterProps> = ({ onOpenScanner }) => {
  return (
    <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto z-20 p-2 bg-gradient-to-t from-slate-900/90 to-transparent pointer-events-none">
      <button
        onClick={onOpenScanner}
        className="pointer-events-auto w-full bg-[#1E3A5F] hover:bg-[#254A7A] active:scale-[0.99] text-white py-3.5 px-6 rounded-lg shadow-xl flex items-center justify-center space-x-2 border border-slate-600 transition-all font-bold tracking-wide text-base"
        id="pda-scan-footer-button"
      >
        <ScanLine className="w-6 h-6 text-blue-300 animate-pulse" />
        <span>스캔 / 촬영</span>
      </button>
    </div>
  );
};
