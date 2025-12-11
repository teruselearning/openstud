
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
  const quillRef = useRef<any>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    if (!containerRef.current || quillRef.current) return;

    // @ts-ignore
    const Quill = (window as any).Quill;
    if (!Quill) return;

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

    quill.on('text-change', () => {
      onChange(quill.root.innerHTML);
    });

    quillRef.current = quill;
  }, []); // Mount only

  return (
    <>
      {isExpanded && (
        <div 
          className="fixed inset-0 bg-black/50 z-[40]" 
          onClick={() => setIsExpanded(false)} 
        />
      )}
      <div className={`bg-white border-slate-300 rounded-lg transition-all duration-200 flex flex-col ${isExpanded ? 'fixed inset-10 z-[50] shadow-2xl border' : 'relative border'}`}>
         {/* Wrapper for Toolbar + Editor. Quill injects toolbar as a sibling before the containerRef node, so we need a parent wrapper to hold them together for the expand button to work relative to the whole block. */}
         {/* Actually, with React refs, Quill modifies the DOM structure. We'll use a CSS hack to make sure the toolbar stays within our styling boundary if possible, or just wrap broadly. */}
         
         <div className="flex-1 relative flex flex-col overflow-hidden rounded-lg">
            {/* The containerRef will become .ql-container. The toolbar will be inserted before it. */}
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
           /* Scoped overrides for this component instance */
           .ql-toolbar { border-top: none !important; border-left: none !important; border-right: none !important; border-bottom: 1px solid #e2e8f0 !important; background: #f8fafc; }
           .ql-container { border: none !important; font-family: 'Inter', sans-serif; font-size: 0.875rem; }
           .ql-editor { overflow-y: auto; }
           ${isExpanded ? '.ql-editor { height: 100%; }' : ''}
         `}</style>
      </div>
    </>
  );
};

export default RichTextEditor;
