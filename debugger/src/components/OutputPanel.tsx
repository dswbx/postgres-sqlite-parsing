import { useState, useCallback, useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { sql } from "@codemirror/lang-sql";
import { json } from "@codemirror/lang-json";
import { vscodeDark } from "@uiw/codemirror-theme-vscode";
import { EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { convert } from "@poc/json-schema";
import { translate } from "@poc/deparser";
import { format } from "sql-formatter";

type Tab = "json-schema" | "sqlite";

interface OutputPanelProps {
   sql: string;
   fontSize: number;
   wordWrap: boolean;
}

type TabState = { result: string; error: string };

export default function OutputPanel({
   sql: inputSql,
   fontSize,
   wordWrap,
}: OutputPanelProps) {
   const [tab, setTab] = useState<Tab>("json-schema");
   const [tabStates, setTabStates] = useState<Record<Tab, TabState>>({
      "json-schema": { result: "", error: "" },
      sqlite: { result: "", error: "" },
   });
   const [loading, setLoading] = useState(false);

   const { result, error } = tabStates[tab];

   const generate = useCallback(async () => {
      setLoading(true);
      setTabStates((s) => ({ ...s, [tab]: { result: "", error: "" } }));
      try {
         let output: string;
         if (tab === "json-schema") {
            const schema = await convert(inputSql);
            output = JSON.stringify(schema, null, 2);
         } else {
            output = await translate(inputSql);
         }
         setTabStates((s) => ({ ...s, [tab]: { result: output, error: "" } }));
      } catch (e: any) {
         setTabStates((s) => ({
            ...s,
            [tab]: { result: "", error: e.message || String(e) },
         }));
      } finally {
         setLoading(false);
      }
   }, [tab, inputSql]);

   const handleFormat = () => {
      if (tab !== "sqlite" || !result) return;
      try {
         const formatted = format(result, { language: "sqlite" });
         setTabStates((s) => ({
            ...s,
            sqlite: { ...s.sqlite, result: formatted },
         }));
      } catch {
         // ignore format errors
      }
   };

   const extensions = useMemo(() => {
      const exts: Extension[] = [
         tab === "json-schema" ? json() : sql(),
         EditorView.theme({
            ".cm-content": { fontSize: `${fontSize}px` },
            ".cm-gutters": { fontSize: `${fontSize}px` },
         }),
      ];
      if (wordWrap) exts.push(EditorView.lineWrapping);
      return exts;
   }, [tab, wordWrap, fontSize]);

   const tabs: { id: Tab; label: string }[] = [
      { id: "json-schema", label: "JSON Schema" },
      { id: "sqlite", label: "SQLite DDL" },
   ];

   return (
      <div className="h-full flex flex-col">
         <div className="flex items-center bg-[#252526] border-b border-[#333]">
            {tabs.map((t) => (
               <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`px-3 py-1.5 text-xs transition-colors cursor-pointer border-b-2 ${
                     tab === t.id
                        ? "text-white border-[#0e639c]"
                        : "text-[#888] border-transparent hover:text-[#ccc]"
                  }`}
               >
                  {t.label}
               </button>
            ))}
            <button
               onClick={generate}
               disabled={loading}
               className="ml-auto mr-2 px-3 py-1 text-xs rounded bg-[#0e639c] text-white hover:bg-[#1177bb] disabled:opacity-50 transition-colors cursor-pointer"
            >
               {loading ? "Generating..." : "Generate"}
            </button>
         </div>

         <div className="flex-1 min-h-0 overflow-auto relative">
            {error ? (
               <pre className="p-4 text-red-400 text-sm whitespace-pre-wrap font-mono">
                  {error}
               </pre>
            ) : result ? (
               <>
                  <CodeMirror
                     value={result}
                     readOnly
                     theme={vscodeDark}
                     extensions={extensions}
                     basicSetup={{ lineNumbers: true, foldGutter: true }}
                     style={{ height: "100%" }}
                  />
                  {tab === "sqlite" && (
                     <button
                        onClick={handleFormat}
                        className="absolute bottom-3 right-3 px-2 py-1 text-xs text-[#888] hover:text-white bg-[#252526] hover:bg-[#333] border border-[#444] rounded cursor-pointer opacity-60 hover:opacity-100 transition-opacity"
                        title="Format SQL"
                     >
                        Format
                     </button>
                  )}
               </>
            ) : (
               <div className="flex items-center justify-center h-full text-[#555] text-sm">
                  Click "Generate" to convert
               </div>
            )}
         </div>
      </div>
   );
}
