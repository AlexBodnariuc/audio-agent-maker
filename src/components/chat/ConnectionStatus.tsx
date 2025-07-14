import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Wifi, WifiOff, AlertCircle, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConnectionStatusProps {
  isConnected: boolean;
  isReconnecting?: boolean;
  latency?: number;
  className?: string;
}

const ConnectionStatus: React.FC<ConnectionStatusProps> = ({
  isConnected,
  isReconnecting = false,
  latency,
  className = ""
}) => {
  const getStatusColor = () => {
    if (isReconnecting) return 'medical-yellow';
    if (!isConnected) return 'medical-red';
    if (latency && latency > 1000) return 'medical-yellow';
    return 'medical-green';
  };

  const getStatusIcon = () => {
    if (isReconnecting) return AlertCircle;
    if (!isConnected) return WifiOff;
    return isConnected ? CheckCircle : Wifi;
  };

  const getStatusText = () => {
    if (isReconnecting) return 'Se reconectează...';
    if (!isConnected) return 'Deconectat';
    if (latency) {
      if (latency < 200) return 'Excelent';
      if (latency < 500) return 'Bun';
      if (latency < 1000) return 'Mediu';
      return 'Încet';
    }
    return 'Conectat';
  };

  const getLatencyInfo = () => {
    if (!latency || !isConnected) return null;
    return `${latency}ms`;
  };

  const statusColor = getStatusColor();
  const StatusIcon = getStatusIcon();
  const statusText = getStatusText();
  const latencyInfo = getLatencyInfo();

  return (
    <Badge 
      variant="outline" 
      className={cn(
        "text-xs border transition-all duration-200",
        `border-${statusColor}/30 text-${statusColor}`,
        isReconnecting && "animate-pulse",
        className
      )}
    >
      <StatusIcon className="h-3 w-3 mr-1" />
      <span>{statusText}</span>
      {latencyInfo && (
        <>
          <span className="mx-1">•</span>
          <span className="font-mono">{latencyInfo}</span>
        </>
      )}
    </Badge>
  );
};

export default ConnectionStatus;