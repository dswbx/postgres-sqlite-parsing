import { useState, useCallback } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { sql } from '@codemirror/lang-sql';
import { json } from '@codemirror/lang-json';
import { vscodeDark } from '@uiw/codemirror-theme-vscode';
import { convert } from '@poc/json-schema';
import { translate } from '@poc/deparser';

type Tab = 'json-schema' | 'sqlite';

interface OutputPanelProps {
  sql: string;
}

export default function OutputPanel({ sql: inputSql }: OutputPanelProps) {
  const [tab, setTab] = useState<Tab>('json-schema');
  const [result, setResult] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const generate = useCallback(async () => {
    setLoading(true);
    setError('');
    setResult('');
    try {
      if (tab === 'json-schema') {
        const schema = await convert(inputSql);
        setResult(JSON.stringify(schema, null, 2));
      } else {
        const sqliteResult = await translate(inputSql);
        setResult(sqliteResult);
      }
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [tab, inputSql]);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'json-schema', label: 'JSON Schema' },
    { id: 'sqlite', label: 'SQLite DDL' },
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
                ? 'text-white border-[#0e639c]'
                : 'text-[#888] border-transparent hover:text-[#ccc]'
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
          {loading ? 'Generating...' : 'Generate'}
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        {error ? (
          <pre className="p-4 text-red-400 text-sm whitespace-pre-wrap font-mono">
            {error}
          </pre>
        ) : result ? (
          <CodeMirror
            value={result}
            readOnly
            theme={vscodeDark}
            extensions={[tab === 'json-schema' ? json() : sql()]}
            basicSetup={{ lineNumbers: true, foldGutter: true }}
            style={{ height: '100%' }}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-[#555] text-sm">
            Click "Generate" to convert
          </div>
        )}
      </div>
    </div>
  );
}
