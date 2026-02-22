import React from 'react';
import { Hand, SquareDashedMousePointer, Plus, Minus, Maximize } from 'lucide-react';

interface MapToolbarProps {
    mode: 'pan' | 'select';
    onModeChange: (mode: 'pan' | 'select') => void;
    onZoomIn: () => void;
    onZoomOut: () => void;
    onFitScreen: () => void;
}

export const MapToolbar: React.FC<MapToolbarProps> = ({
    mode, onModeChange, onZoomIn, onZoomOut, onFitScreen
}) => {
    const btnBase = 'flex items-center justify-center transition-all';
    const btnSize = 'w-10 h-10 md:w-9 md:h-9';

    const modeBtn = (m: 'pan' | 'select', icon: React.ReactNode) => (
        <button
            onClick={() => onModeChange(m)}
            className={`${btnBase} ${btnSize} rounded-lg ${
                mode === m
                    ? m === 'select'
                        ? 'bg-indigo-500 text-white shadow shadow-indigo-500/30'
                        : 'bg-white text-black shadow'
                    : 'text-white/60 hover:text-white hover:bg-white/10 active:bg-white/20'
            }`}
        >
            {icon}
        </button>
    );

    const actionBtn = (onClick: () => void, icon: React.ReactNode) => (
        <button
            onClick={onClick}
            className={`${btnBase} ${btnSize} rounded-lg text-white/60 hover:text-white hover:bg-white/10 active:bg-white/20`}
        >
            {icon}
        </button>
    );

    return (
        <div className="flex md:flex-col gap-1 bg-black/70 backdrop-blur-sm rounded-xl p-1.5 border border-[#333]">
            {modeBtn('pan', <Hand size={18} />)}
            {modeBtn('select', <SquareDashedMousePointer size={18} />)}
            <div className="md:w-full md:h-px w-px h-8 bg-[#333] self-center md:my-0.5 mx-0.5 md:mx-0" />
            {actionBtn(onZoomIn, <Plus size={18} />)}
            {actionBtn(onZoomOut, <Minus size={18} />)}
            <div className="md:w-full md:h-px w-px h-8 bg-[#333] self-center md:my-0.5 mx-0.5 md:mx-0" />
            {actionBtn(onFitScreen, <Maximize size={16} />)}
        </div>
    );
};
