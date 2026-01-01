
import React, { useEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';

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
  const [isExpanded, setIsExpanded] = useState(false);

  // Initialize Quill
  useEffect(() => {
    if (!containerRef.current || !wrapperRef.current) return;
    if (quillRef.current) return; // Prevent double init

    // @ts-ignore
    const Quill = (window as any).Quill;
    if (!Quill) return;

    // Clear any artifacts from previous mounts (crucial for React dev mode)
    const existingToolbars = wrapperRef.current.querySelectorAll('.ql-toolbar');
    existingToolbars.forEach(tb => tb.remove());

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

    // Set initial content
    if (value) {
      quill.clipboard.dangerouslyPasteHTML(value);
    }

    // Capture user changes
    quill.on('text-change', (delta: any, oldDelta: any, source: string) => {
      if (source === 'user') {
        const html = quill.root.innerHTML;
        const normalizedHtml = html === '<p><br></p>' ? '' : html;
        onChange(normalizedHtml);
      }
    });

    quillRef.current = quill;

    // Proper Cleanup
    return () => {
       if (quillRef.current) {
          // No official destroy() in Quill 1.x, so we clear the ref and manually clean DOM
          quillRef.current = null;
       }
    };
  }, []);

  // Sync value from props when it changes externally
  useEffect(() => {
    if (quillRef.current) {
      const currentHtml = quillRef.current.root.innerHTML;
      const normalize = (h: string) => h.replace(/\s/g, '').replace(/&nbsp;/g, ' ').replace(/<p><br><\/p>/g, '');
      const incomingValue = value || '';
      
      if (normalize(incomingValue) !== normalize(currentHtml)) {
        // Only update if significantly different to avoid cursor jumping
        const selection = quillRef.current.getSelection();
        quillRef.current.clipboard.dangerouslyPasteHTML(incomingValue);
        if (selection) {
          quillRef.current.setSelection(selection);
        }
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
            <div 
              ref={containerRef} 
              className="bg-white text-slate-900" 
              style={{ height: isExpanded ? 'calc(100% - 42px)' : height }} 
            />
            
            <button 
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="absolute bottom-2 right-2 p-1.5 bg-slate-100 hover:bg-slate-200 rounded text-slate-500 hover:text-slate-900 z-10 border border-slate-300 shadow-sm"
              title={isExpanded ? "Collapse" : "Expand"}
            >
              {isExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
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
