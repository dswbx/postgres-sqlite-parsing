import { useState, useCallback, useMemo, useRef } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { sql } from "@codemirror/lang-sql";
import { json } from "@codemirror/lang-json";
import { vscodeDark } from "@uiw/codemirror-theme-vscode";
import { EditorView } from "@codemirror/view";
import type { Extension } from "@codemirror/state";
import { convert, jsonSchemaToSqlite } from "@poc/json-schema";
import { translate } from "@poc/deparser";
import { parse } from "pgsql-parser";
import { format } from "sql-formatter";

type Tab = "json-schema" | "sqlite" | "parser-ast";

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
   const [tab, setTab] = useState<Tab>("sqlite");
   const [tabStates, setTabStates] = useState<Record<Tab, TabState>>({
      sqlite: { result: "", error: "" },
      "json-schema": { result: "", error: "" },
      "parser-ast": { result: "", error: "" },
   });
   const [loading, setLoading] = useState(false);
   const [sqliteFromSchema, setSqliteFromSchema] = useState("");
   const schemaRef = useRef<any>(null);

   const { result, error } = tabStates[tab];

   const generate = useCallback(async () => {
      setLoading(true);
      setTabStates((s) => ({ ...s, [tab]: { result: "", error: "" } }));
      if (tab === "json-schema") setSqliteFromSchema("");
      try {
         let output: string;
         if (tab === "parser-ast") {
            const ast = await parse(inputSql);
            output = JSON.stringify(ast, null, 2);
         } else if (tab === "json-schema") {
            const schema = await convert(inputSql);
            schemaRef.current = schema;
            output = JSON.stringify(schema, null, 2);
            try {
               setSqliteFromSchema(jsonSchemaToSqlite(schema));
            } catch {
               // ignore sqlite derivation errors
            }
         } else {
            output = await translate(inputSql);
            try {
               output = format(output, { language: "sqlite" });
            } catch {
               // ignore format errors
            }
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

   const jsonExtensions = useMemo(() => {
      const exts: Extension[] = [
         json(),
         EditorView.theme({
            ".cm-content": { fontSize: `${fontSize}px` },
            ".cm-gutters": { fontSize: `${fontSize}px` },
         }),
      ];
      if (wordWrap) exts.push(EditorView.lineWrapping);
      return exts;
   }, [wordWrap, fontSize]);

   const sqlExtensions = useMemo(() => {
      const exts: Extension[] = [
         sql(),
         EditorView.theme({
            ".cm-content": { fontSize: `${fontSize}px` },
            ".cm-gutters": { fontSize: `${fontSize}px` },
         }),
      ];
      if (wordWrap) exts.push(EditorView.lineWrapping);
      return exts;
   }, [wordWrap, fontSize]);

   const tabs: { id: Tab; label: string }[] = [
      { id: "sqlite", label: "SQLite DDL" },
      { id: "json-schema", label: "JSON Schema" },
      { id: "parser-ast", label: "Parser AST" },
   ];

   return (
      <div className="h-full flex flex-col">
         <div className="flex items-center bg-[#252526] border-b border-[#333]">
            {tabs.map((t) => (
               <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`px-3 pt-1.5 pb-1 text-xs transition-colors cursor-pointer border-b-2 ${
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
            ) : (tab === "json-schema" || tab === "parser-ast") && result ? (
               <div className="flex flex-col h-full">
                  <div className="flex-1 min-h-0 overflow-auto">
                     <CodeMirror
                        value={result}
                        readOnly
                        theme={vscodeDark}
                        extensions={jsonExtensions}
                        basicSetup={{ lineNumbers: true, foldGutter: true }}
                        style={{ height: "100%" }}
                     />
                  </div>
                  {tab === "json-schema" && sqliteFromSchema && (
                     <>
                        <div className="px-3 py-1 text-xs text-white bg-[#252526] border-y border-[#333]">
                           SQLite DDL
                        </div>
                        <div className="flex-1 min-h-0 overflow-auto">
                           <CodeMirror
                              value={sqliteFromSchema}
                              readOnly
                              theme={vscodeDark}
                              extensions={sqlExtensions}
                              basicSetup={{
                                 lineNumbers: true,
                                 foldGutter: true,
                              }}
                              style={{ height: "100%" }}
                           />
                        </div>
                     </>
                  )}
               </div>
            ) : result ? (
               <>
                  <CodeMirror
                     value={result}
                     readOnly
                     theme={vscodeDark}
                     extensions={sqlExtensions}
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
