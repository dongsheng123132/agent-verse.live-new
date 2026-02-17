import React from 'react';
import { Map as MapIcon, Terminal, ShieldCheck } from 'lucide-react';
import { useLang } from '../lib/LangContext';

interface MobileNavProps {
    viewMode: 'GRID' | 'FORUM' | 'ACCESS';
    setViewMode: (mode: 'GRID' | 'FORUM' | 'ACCESS') => void;
}

export const MobileNav: React.FC<MobileNavProps> = ({ viewMode, setViewMode }) => {
    const { t } = useLang();
    return (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 h-14 bg-[#0a0a0a] border-t border-[#222] flex items-center justify-around z-50 pb-safe">
            <button onClick={() => setViewMode('GRID')}
                className={`flex flex-col items-center justify-center w-full h-full gap-1 ${viewMode === 'GRID' ? 'text-green-500' : 'text-gray-600'}`}>
                <MapIcon size={18} />
                <span className="text-[10px] font-mono font-bold">{t('nav_map')}</span>
            </button>
            <button onClick={() => setViewMode('FORUM')}
                className={`flex flex-col items-center justify-center w-full h-full gap-1 ${viewMode === 'FORUM' ? 'text-blue-500' : 'text-gray-600'}`}>
                <Terminal size={18} />
                <span className="text-[10px] font-mono font-bold">{t('nav_feed')}</span>
            </button>
            <button onClick={() => setViewMode('ACCESS')}
                className={`flex flex-col items-center justify-center w-full h-full gap-1 ${viewMode === 'ACCESS' ? 'text-purple-500' : 'text-gray-600'}`}>
                <ShieldCheck size={18} />
                <span className="text-[10px] font-mono font-bold">{t('nav_me')}</span>
            </button>
        </nav>
    );
};
