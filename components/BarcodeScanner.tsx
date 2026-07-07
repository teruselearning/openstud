import React, { useEffect, useRef } from 'react';
import { BrowserMultiFormatReader } from '@zxing/library';
import { X } from 'lucide-react';

interface BarcodeScannerProps {
  onScan: (result: string) => void;
  onClose: () => void;
  t?: (key: string) => string;
}

const BarcodeScanner: React.FC<BarcodeScannerProps> = ({ onScan, onClose, t }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);

  useEffect(() => {
    const codeReader = new BrowserMultiFormatReader();
    readerRef.current = codeReader;

    codeReader.decodeFromVideoDevice(undefined, videoRef.current!, (result, err) => {
      if (result) {
        const text = result.getText();
        codeReader.reset();
        onScan(text);
      }
    });

    return () => {
      codeReader.reset();
    };
  }, [onScan]);

  return (
    <div className="fixed inset-0 z-[6000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center">
          <h3 className="font-bold text-slate-900">{t ? t('scanBarcode') : 'Scan Barcode'}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-200 rounded-full transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="p-4">
          <video ref={videoRef} className="w-full aspect-video rounded-xl bg-black" />
          <p className="text-xs text-slate-500 text-center mt-3">
            {t ? t('scannerInstruction') : 'Point your camera at a QR code, Data Matrix, Code 128, or other barcode'}
          </p>
        </div>
      </div>
    </div>
  );
};

export default BarcodeScanner;