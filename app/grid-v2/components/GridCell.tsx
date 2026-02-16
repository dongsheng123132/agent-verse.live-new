import React, { memo } from 'react';
import { GridCell as GridCellType } from '../types';

interface GridCellProps {
  cell: GridCellType;
  isSelected: boolean;
  onSelect: (cell: GridCellType) => void;
}

// Memoize to prevent re-renders on every state change
export const GridCell = memo(({ cell, isSelected, onSelect }: GridCellProps) => {
  const isOwned = !!cell.owner;
  const isGenesis = cell.x === 0 && cell.y === 0;
  
  let bgClass = "bg-[#080808]"; // Void black
  
  if (cell.status === 'LOCKED') {
      // Locked/Reserved look - maybe a striped pattern via CSS or just dark red/grey
      // Using a utility class combination to suggest restricted access
      bgClass = "bg-[#1a0505] opacity-80 cursor-not-allowed";
      if (cell.color === '#1a1a1a') bgClass = "bg-[#111] opacity-50"; // Diagonal grey
  } else if (isGenesis) {
      bgClass = "bg-purple-600 shadow-[0_0_10px_#9333ea] z-10";
  } else if (isOwned) {
      if (cell.status === 'HIRING') {
          bgClass = "bg-red-600 hover:bg-red-400";
      } else if (cell.status === 'HIRE_ME') {
          bgClass = "bg-green-500 hover:bg-green-300";
      } else if (cell.status === 'PROCESSING') {
          bgClass = "bg-blue-600 animate-pulse";
      } else if (cell.isForSale) {
          bgClass = "bg-yellow-500 hover:bg-yellow-300";
      } else {
          bgClass = "bg-[#222] hover:bg-gray-500";
      }
  }

  // Selection Glow
  const selectClass = isSelected 
    ? "ring-2 ring-white z-50 scale-[3.0] shadow-[0_0_15px_rgba(255,255,255,0.9)]" 
    : "";

  return (
    <div 
      className={`w-full h-full aspect-square cursor-pointer transition-none ${bgClass} ${selectClass}`}
      onClick={() => onSelect(cell)}
      title={cell.status === 'LOCKED' ? `[LOCKED] System Reserved` : (isOwned ? `[${cell.x},${cell.y}] ${cell.status}` : undefined)}
    />
  );
}, (prev, next) => {
    return prev.cell === next.cell && prev.isSelected === next.isSelected;
});