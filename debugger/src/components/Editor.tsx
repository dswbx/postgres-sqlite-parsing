import { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { PostgreSQL, sql } from "@codemirror/lang-sql";
import { vscodeDark } from "@uiw/codemirror-theme-vscode";
import { EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { format } from "sql-formatter";

interface EditorProps {
   value: string;
   onChange: (value: string) => void;
   fontSize: number;
   wordWrap: boolean;
}

export default function Editor({
   value,
   onChange,
   fontSize,
   wordWrap,
}: EditorProps) {
   const extensions = useMemo(() => {
      const exts: Extension[] = [
         sql({ dialect: PostgreSQL }),
         EditorView.theme({
            ".cm-content": { fontSize: `${fontSize}px` },
            ".cm-gutters": { fontSize: `${fontSize}px` },
         }),
      ];
      if (wordWrap) exts.push(EditorView.lineWrapping);
      return exts;
   }, [wordWrap, fontSize]);

   const handleFormat = () => {
      try {
         onChange(format(value, { language: "postgresql" }));
      } catch {
         // ignore format errors
      }
   };

   return (
      <div className="relative h-full">
         <CodeMirror
            value={value}
            onChange={onChange}
            theme={vscodeDark}
            extensions={extensions}
            basicSetup={{
               lineNumbers: true,
               foldGutter: true,
               highlightActiveLine: true,
            }}
            style={{ height: "100%" }}
         />
         <button
            onClick={handleFormat}
            className="absolute bottom-3 right-3 px-2 py-1 text-xs text-[#888] hover:text-white bg-[#252526] hover:bg-[#333] border border-[#444] rounded cursor-pointer opacity-60 hover:opacity-100 transition-opacity"
            title="Format SQL"
         >
            Format
         </button>
      </div>
   );
}
