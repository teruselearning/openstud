
import React, { useEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2, Code } from 'lucide-react';

interface RichTextEditorProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  height?: string;
}

const RichTextEditor: React.FC<RichTextEditorProps> = ({ value, onChange, placeholder, height = '200px' }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const quillRef = useRef<any>(null);
  const quillInitialisedRef = useRef(false);
  const pendingHtmlRef = useRef<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showHtml, setShowHtml] = useState(false);
  const [rawHtml, setRawHtml] = useState(value || '');

  // Initialize Quill
  useEffect(() => {
    if (!containerRef.current || !wrapperRef.current) return;
    if (quillInitialisedRef.current) return;
    quillInitialisedRef.current = true;
    if (quillRef.current) return;

    // @ts-ignore
    const Quill = (window as any).Quill;
    if (!Quill) return;

    const existingToolbars = wrapperRef.current.querySelectorAll('.ql-toolbar');
    existingToolbars.forEach(tb => tb.remove());

    containerRef.current.innerHTML = '';

    const quill = new Quill(containerRef.current, {
      theme: 'snow',
      placeholder: placeholder || 'Write something...',
      modules: {
        toolbar: [
          [{ 'header': [1, 2, 3, false] }],
          ['bold', 'italic', 'underline', 'strike'],
          [{ 'list': 'ordered'}, { 'list': 'bullet' }],
          [{ 'color': [] }, { 'background': [] }],
          ['link', 'clean']
        ]
      }
    });

    if (value) {
      quill.clipboard.dangerouslyPasteHTML(value);
    }

    quill.on('text-change', (delta: any, oldDelta: any, source: string) => {
      if (source === 'user') {
        const html = quill.root.innerHTML;
        const normalizedHtml = html === '<p><br></p>' ? '' : html;
        onChange(normalizedHtml);
      }
    });

    quillRef.current = quill;

    return () => {
       if (quillRef.current) {
          quillRef.current = null;
       }
    };
  }, []);

  // After showHtml flips to false, apply any pending HTML content
  useEffect(() => {
    if (!showHtml && quillRef.current && pendingHtmlRef.current !== null) {
      quillRef.current.clipboard.dangerouslyPasteHTML(pendingHtmlRef.current);
      pendingHtmlRef.current = null;
    }
  }, [showHtml]);

  const handleToggleHtml = () => {
    if (!showHtml) {
      const currentHtml = quillRef.current ? quillRef.current.root.innerHTML : value || '';
      const normalized = currentHtml === '<p><br></p>' ? '' : currentHtml;
      setRawHtml(normalized);
      setShowHtml(true);
    } else {
      pendingHtmlRef.current = rawHtml;
      setShowHtml(false);
      onChange(rawHtml);
    }
  };

  const handleRawHtmlChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setRawHtml(e.target.value);
    onChange(e.target.value);
  };

  // Sync value from props when it changes externally (e.g. on reset or remote load), but only if NOT switching back from HTML mode
  useEffect(() => {
    if (quillRef.current && pendingHtmlRef.current === null && !showHtml) {
      const currentHtml = quillRef.current.root.innerHTML;
      const normalize = (h: string) => h.replace(/\s/g, '').replace(/&nbsp;/g, ' ').replace(/<p><br><\/p>/g, '');
      const incomingValue = value || '';

      if (normalize(incomingValue) !== normalize(currentHtml)) {
        quillRef.current.clipboard.dangerouslyPasteHTML(incomingValue || '');
      }
    }
  }, [value]);

  return (
    <>
      {isExpanded && (
        <div
          className="fixed inset-0 bg-black/50 z-[40]"
          onClick={() => setIsExpanded(false)}
        />
      )}
      <div className={`bg-white border-slate-300 rounded-lg transition-all duration-200 flex flex-col ${isExpanded ? 'fixed inset-10 z-[50] shadow-2xl border' : 'relative border'}`}>
         <div className="flex-1 relative flex flex-col overflow-hidden rounded-lg" ref={wrapperRef}>

            {/* Quill editor — hidden (not unmounted) when in HTML mode so it keeps its state */}
            <div style={{ display: showHtml ? 'none' : 'block' }}>
              <div
                ref={containerRef}
                className="bg-white text-slate-900"
                style={{ height: isExpanded ? 'calc(100% - 42px)' : height }}
              />
            </div>

            {/* Raw HTML textarea — hidden (not unmounted) to preserve scroll/cursor */}
            <div style={{ display: showHtml ? 'block' : 'none' }}>
              <textarea
                value={rawHtml}
                onChange={handleRawHtmlChange}
                spellCheck={false}
                className="w-full font-mono text-xs text-slate-800 bg-slate-50 border-0 resize-none outline-none p-3 rounded-b-lg"
                style={{ height: isExpanded ? 'calc(100% - 42px)' : height }}
                placeholder="Paste or type raw HTML here…"
              />
            </div>

            {/* Toolbar buttons (bottom-right) */}
            <div className="absolute bottom-2 right-2 flex items-center gap-1 z-10">
              <button
                type="button"
                onClick={handleToggleHtml}
                className={`p-1.5 rounded border shadow-sm text-xs font-bold transition-colors ${showHtml ? 'bg-emerald-600 text-white border-emerald-700' : 'bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-900 border-slate-300'}`}
                title={showHtml ? "Switch to visual editor" : "Edit raw HTML"}
              >
                <Code size={14} />
              </button>
              <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded text-slate-500 hover:text-slate-900 border border-slate-300 shadow-sm"
                title={isExpanded ? "Collapse" : "Expand"}
              >
                {isExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </button>
            </div>
         </div>

         <style>{`
           .ql-toolbar { border-top: none !important; border-left: none !important; border-right: none !important; border-bottom: 1px solid #e2e8f0 !important; background: #f8fafc; }
           .ql-container { border: none !important; font-family: 'Inter', sans-serif; font-size: 0.875rem; }
           .ql-editor { overflow-y: auto; padding: 12px 16px; }
           ${isExpanded ? '.ql-editor { height: 100%; }' : ''}
         `}</style>
      </div>
    </>
  );
};

export default RichTextEditor;
