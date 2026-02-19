interface ToolbarProps {
   fontSize: number;
   onFontSizeChange: (size: number) => void;
   wordWrap: boolean;
   onWordWrapChange: (wrap: boolean) => void;
}

export default function Toolbar({
   fontSize,
   onFontSizeChange,
   wordWrap,
   onWordWrapChange,
}: ToolbarProps) {
   return (
      <div className="flex items-center gap-1.5">
         <button
            onClick={() => onFontSizeChange(Math.max(10, fontSize - 1))}
            className="px-1.5 py-0.5 text-xs text-[#888] hover:text-[#ccc] bg-[#333] rounded cursor-pointer"
            title="Decrease font size"
         >
            A-
         </button>
         <span className="text-xs text-[#888] min-w-[2ch] text-center tabular-nums">
            {fontSize}
         </span>
         <button
            onClick={() => onFontSizeChange(Math.min(24, fontSize + 1))}
            className="px-1.5 py-0.5 text-xs text-[#888] hover:text-[#ccc] bg-[#333] rounded cursor-pointer"
            title="Increase font size"
         >
            A+
         </button>
         <button
            onClick={() => onWordWrapChange(!wordWrap)}
            className={`ml-1 px-2 py-0.5 text-xs rounded cursor-pointer ${
               wordWrap
                  ? "text-white bg-[#0e639c]"
                  : "text-[#888] hover:text-[#ccc] bg-[#333]"
            }`}
            title="Toggle word wrap"
         >
            Wrap
         </button>
      </div>
   );
}
