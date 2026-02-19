import CodeMirror from "@uiw/react-codemirror";
import { PostgreSQL, sql } from "@codemirror/lang-sql";
import { vscodeDark } from "@uiw/codemirror-theme-vscode";

interface EditorProps {
   value: string;
   onChange: (value: string) => void;
}

export default function Editor({ value, onChange }: EditorProps) {
   return (
      <CodeMirror
         value={value}
         onChange={onChange}
         theme={vscodeDark}
         extensions={[sql({ dialect: PostgreSQL })]}
         basicSetup={{
            lineNumbers: true,
            foldGutter: true,
            highlightActiveLine: true,
         }}
         style={{ height: "100%" }}
      />
   );
}
