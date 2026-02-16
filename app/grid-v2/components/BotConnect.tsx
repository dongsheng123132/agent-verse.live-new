
import React, { useState } from 'react';
import { Terminal, Copy, X, Globe, Cpu, Link } from 'lucide-react';

interface AccessGuideProps {
    t: any;
    mode?: 'BUTTON' | 'EMBED';
}

export const BotConnect: React.FC<AccessGuideProps> = ({ t, mode = 'BUTTON' }) => {
  const [showModal, setShowModal] = useState(false);
  const skillCmd = `npx skills add coinbase/agentic-wallet-skills`;

  const Content = () => (
    <div className={`relative ${mode === 'EMBED' ? '' : 'bg-[#0a0a0a] border border-[#333] w-full max-w-lg rounded-xl shadow-2xl overflow-hidden'} font-mono text-sm`}>
        {/* Header only if modal */}
        {mode === 'BUTTON' && (
            <div className="bg-[#111] p-4 border-b border-[#333] flex justify-between items-center">
                <span className="text-white font-bold flex items-center gap-2">
                    <Globe size={16} className="text-green-500"/> {t.BTN_GUIDE}
                </span>
                <button onClick={() => setShowModal(false)}><X size={18} className="text-gray-500 hover:text-white"/></button>
            </div>
        )}

        <div className={mode === 'BUTTON' ? 'p-6 space-y-6' : 'space-y-6'}>
            
            {/* Status Block */}
            <div className="bg-blue-900/10 border border-blue-800/30 p-3 rounded text-blue-300 leading-relaxed text-xs font-mono">
                <span className="block font-bold mb-1 opacity-50 text-[10px]">CURRENT_MODE</span>
                {t.MODE_READ_ONLY || "READ ONLY"}
            </div>

            {/* Step 1 */}
            <div className="space-y-2">
                <h3 className="text-white font-bold flex items-center gap-2 text-xs uppercase tracking-wider text-gray-500">
                    <Terminal size={12}/> STEP_01 // INIT_ENV
                </h3>
                <div className="relative group">
                    <div className="bg-black border border-gray-800 p-3 rounded text-green-400 font-mono text-[10px] md:text-xs break-all">
                        {skillCmd}
                    </div>
                    <button 
                        className="absolute top-2 right-2 p-1.5 bg-[#222] rounded hover:bg-[#333] text-gray-400 hover:text-white transition-colors"
                        onClick={() => navigator.clipboard.writeText(skillCmd)}
                    >
                        <Copy size={12} />
                    </button>
                </div>
            </div>

            {/* Step 2 */}
            <div className="space-y-2">
                <h3 className="text-white font-bold flex items-center gap-2 text-xs uppercase tracking-wider text-gray-500">
                    <Cpu size={12}/> STEP_02 // EXECUTE_TASK
                </h3>
                <div className="text-gray-400 text-xs leading-relaxed space-y-2 pl-2 border-l-2 border-[#222]">
                    <p>1. SELECT_TARGET <span className="text-yellow-500">[GRID_CELL]</span></p>
                    <p>2. COPY_PROMPT <span className="text-gray-600">[CLIPBOARD]</span></p>
                    <p>3. PASTE_TO_AGENT <span className="text-purple-400">[OPENCLAW / CDP]</span></p>
                </div>
            </div>

            {mode === 'BUTTON' && (
                <div className="pt-4 border-t border-[#222] text-center">
                    <button 
                        onClick={() => setShowModal(false)}
                        className="text-gray-500 hover:text-white text-xs underline decoration-gray-700 hover:decoration-white transition-all"
                    >
                        [ACKNOWLEDGED]
                    </button>
                </div>
            )}
        </div>
    </div>
  );

  if (mode === 'EMBED') return <Content />;

  return (
    <>
        <button
        onClick={() => setShowModal(true)}
        className="group relative flex items-center gap-2 bg-[#1a1a1a] hover:bg-[#222] border border-gray-700 hover:border-white text-gray-300 hover:text-white px-3 py-1.5 rounded font-mono text-[10px] md:text-xs transition-all"
        >
        <Link size={12} className="text-green-500" />
        <span className="hidden md:inline">{t.BTN_GUIDE}</span>
        <span className="md:hidden">ACCESS</span>
        </button>

        {showModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm">
                <Content />
            </div>
        )}
    </>
  );
};
