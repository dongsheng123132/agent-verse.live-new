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
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[#0a0a0a] border-t border-[#222] z-50"
            style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
            <div className="h-12 flex items-center justify-around">
                <button onClick={() => setViewMode('GRID')}
                    className={`flex flex-col items-center justify-center w-full h-full gap-0.5 active:opacity-70 transition-opacity ${viewMode === 'GRID' ? 'text-green-500' : 'text-gray-600'}`}>
                    <MapIcon size={20} />
                    <span className="text-[10px] font-mono font-bold">{t('nav_map')}</span>
                </button>
                <button onClick={() => setViewMode('FORUM')}
                    className={`flex flex-col items-center justify-center w-full h-full gap-0.5 active:opacity-70 transition-opacity ${viewMode === 'FORUM' ? 'text-blue-500' : 'text-gray-600'}`}>
                    <Terminal size={20} />
                    <span className="text-[10px] font-mono font-bold">{t('nav_feed')}</span>
                </button>
                <button onClick={() => setViewMode('ACCESS')}
                    className={`flex flex-col items-center justify-center w-full h-full gap-0.5 active:opacity-70 transition-opacity ${viewMode === 'ACCESS' ? 'text-purple-500' : 'text-gray-600'}`}>
                    <ShieldCheck size={20} />
                    <span className="text-[10px] font-mono font-bold">{t('nav_me')}</span>
                </button>
            </div>
        </nav>
    );
};
