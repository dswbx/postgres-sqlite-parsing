import { useState } from "react";
import Editor from "./components/Editor";
import OutputPanel from "./components/OutputPanel";
import Toolbar from "./components/Toolbar";
import { useLocalStorage } from "./hooks/useLocalStorage";

const SAMPLE_DDL = `-- Custom ENUM type
CREATE TYPE order_status AS ENUM('pending', 'processing', 'shipped', 'delivered');

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  tags TEXT[],
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE orders (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users (id) ON DELETE CASCADE,
  status order_status DEFAULT 'pending',
  total NUMERIC(10, 2) CHECK (total >= 0) NOT NULL,
  items JSONB,
  notes TEXT,
  ordered_at TIMESTAMP DEFAULT NOW()
);`;

export default function App() {
   const [sql, setSql] = useState(SAMPLE_DDL);
   const [fontSize, setFontSize] = useLocalStorage("editor-font-size", 14);
   const [wordWrap, setWordWrap] = useLocalStorage("editor-word-wrap", false);

   return (
      <div className="h-full flex flex-col">
         <header className="flex items-center gap-3 px-4 py-2 border-b border-[#333] bg-[#252526]">
            <h1 className="text-sm font-semibold text-[#ccc]">
               PG → SQLite / JSON Schema
            </h1>
            <Toolbar
               fontSize={fontSize}
               onFontSizeChange={setFontSize}
               wordWrap={wordWrap}
               onWordWrapChange={setWordWrap}
            />
            <a
               href="https://github.com/dswbx/postgres-sqlite-parsing"
               target="_blank"
               rel="noopener"
               className="ml-auto text-xs text-[#888] hover:text-[#ccc]"
            >
               GitHub
            </a>
         </header>
         <div className="flex-1 grid grid-cols-2 min-h-0">
            <div className="border-r border-[#333] min-h-0 overflow-hidden flex flex-col">
               <div className="flex items-center pl-4 px-2 py-1.5 bg-[#252526] border-b border-[#333] text-xs text-white">
                  Postgres DDL
               </div>
               <div className="flex-1 min-h-0">
                  <Editor
                     value={sql}
                     onChange={setSql}
                     fontSize={fontSize}
                     wordWrap={wordWrap}
                  />
               </div>
            </div>
            <div className="min-h-0 overflow-hidden">
               <OutputPanel sql={sql} fontSize={fontSize} wordWrap={wordWrap} />
            </div>
         </div>
      </div>
   );
}
