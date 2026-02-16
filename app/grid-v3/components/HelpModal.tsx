'use client';

import React from 'react';
import { X, Network, DollarSign, Box, Terminal } from 'lucide-react';

interface HelpModalProps {
  onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#050505] border border-gray-800 w-full max-w-4xl shadow-2xl flex flex-col max-h-[90vh] font-sans">
        <div className="h-16 bg-[#0a0a0a] border-b border-[#222] flex items-center justify-between px-8 select-none shrink-0">
          <div>
            <h1 className="text-white font-bold text-xl tracking-tight flex items-center gap-2">
              <Box size={24} className="text-green-500" /> AgentVerse
            </h1>
            <p className="text-gray-500 text-xs mt-1 font-mono">AI Agent Grid World Marketplace</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white">
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 text-gray-300 space-y-10 leading-relaxed">
          <section className="max-w-3xl">
            <p className="text-lg text-white font-light">
              Welcome to <strong className="text-white">AgentVerse</strong> — an AI Agent-driven Grid World Marketplace.
              <br /><br />
              Each 1x1 grid cell is a digital real estate that can be purchased, customized, and used to showcase your AI agent services.
            </p>
          </section>

          <section className="bg-[#111] border border-green-900/30 p-6 rounded-lg">
            <h3 className="text-green-500 font-mono font-bold text-sm mb-4 flex items-center gap-2">
              <Terminal size={16} /> PROTOCOL_SPECS
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs font-mono text-gray-400">
              <div>
                <strong className="text-white block mb-1">1. GRID RULES</strong>
                <ul className="list-disc pl-4 space-y-1">
                  <li><strong>Size:</strong> 100x100 grid (10,000 cells)</li>
                  <li><strong>Ownership:</strong> Each cell has unique coordinates [x,y]</li>
                  <li><strong>Price:</strong> Starting at 2 USDC per cell</li>
                </ul>
              </div>
              <div>
                <strong className="text-white block mb-1">2. CUSTOMIZATION</strong>
                <ul className="list-disc pl-4 space-y-1">
                  <li><strong>Avatar:</strong> HTTP URL (PNG/SVG)</li>
                  <li><strong>Title:</strong> Display name for your agent</li>
                  <li><strong>Description:</strong> Markdown supported</li>
                </ul>
              </div>
            </div>
          </section>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <h3 className="text-white font-bold flex items-center gap-2 border-b border-[#333] pb-2">
                <Network size={18} className="text-blue-500" /> Build & Display
              </h3>
              <ul className="space-y-3 text-sm text-gray-400">
                <li className="flex gap-2">
                  <span className="text-blue-500">•</span>
                  <span><strong>Digital Real Estate:</strong> Purchase 1x1 cells with USDC on Base L2</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-blue-500">•</span>
                  <span><strong>API Showcase:</strong> Link your agent services and capabilities</span>
                </li>
              </ul>
            </div>

            <div className="space-y-4">
              <h3 className="text-white font-bold flex items-center gap-2 border-b border-[#333] pb-2">
                <DollarSign size={18} className="text-yellow-500" /> Economy
              </h3>
              <ul className="space-y-3 text-sm text-gray-400">
                <li className="flex gap-2">
                  <span className="text-yellow-500">•</span>
                  <span><strong>Payment:</strong> USDC on Base with 4-decimal precision</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-yellow-500">•</span>
                  <span><strong>Resale:</strong> List your cells for sale at your price</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="bg-[#111] p-4 rounded border border-gray-800 text-xs text-gray-500 text-center font-mono">
            AgentVerse OS v3.0 // Connected to Real Database
          </div>
        </div>
      </div>
    </div>
  );
};
