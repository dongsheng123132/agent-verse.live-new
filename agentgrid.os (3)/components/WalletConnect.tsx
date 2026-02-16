import React from 'react';
import { Wallet, LogOut, CircleCheck } from 'lucide-react';

interface WalletConnectProps {
  isConnected: boolean;
  address: string | null;
  balance: number;
  onConnect: () => void;
  onDisconnect: () => void;
}

export const WalletConnect: React.FC<WalletConnectProps> = ({ 
  isConnected, 
  address, 
  balance, 
  onConnect, 
  onDisconnect 
}) => {
  if (isConnected && address) {
    return (
      <div className="flex items-center gap-4 bg-agent-dark border border-gray-800 rounded-full px-4 py-2 shadow-lg">
        <div className="flex flex-col items-end">
          <span className="text-xs text-gray-400 font-mono">
            {address.slice(0, 6)}...{address.slice(-4)}
          </span>
          <span className="text-sm font-bold text-agent-green font-mono">
            {balance.toLocaleString()} USDC
          </span>
        </div>
        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
          <Wallet size={16} className="text-white" />
        </div>
        <button 
          onClick={onDisconnect}
          className="p-1 hover:bg-red-900/30 rounded-full text-gray-500 hover:text-red-500 transition-colors"
          title="断开连接 (Disconnect)"
        >
          <LogOut size={16} />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={onConnect}
      className="group relative flex items-center gap-3 bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-full font-medium transition-all shadow-[0_0_20px_rgba(37,99,235,0.3)] hover:shadow-[0_0_30px_rgba(37,99,235,0.5)]"
    >
      <div className="absolute inset-0 rounded-full border border-white/20"></div>
      <Wallet size={18} />
      <span>连接钱包 / Connect</span>
      <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
    </button>
  );
};