"use client";

import { DynamicWidget } from "@dynamic-labs/sdk-react-core";

export default function WalletConnectButton() {
  return (
    <DynamicWidget 
      buttonClassName="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white py-2 px-4 rounded-lg transition-all hover:scale-105 shadow-md"
    />
  );
} 