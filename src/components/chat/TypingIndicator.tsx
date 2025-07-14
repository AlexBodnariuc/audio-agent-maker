import React from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Bot, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TypingIndicatorProps {
  message?: string;
  showAvatar?: boolean;
  className?: string;
  variant?: 'dots' | 'pulse' | 'wave';
}

const TypingIndicator: React.FC<TypingIndicatorProps> = ({
  message = "Se scrie...",
  showAvatar = true,
  className = "",
  variant = 'dots'
}) => {
  const renderTypingAnimation = () => {
    switch (variant) {
      case 'pulse':
        return (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-medical-green rounded-full animate-pulse" />
            <span className="text-medical-green font-medium">{message}</span>
          </div>
        );
      
      case 'wave':
        return (
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-1 h-4 bg-medical-green rounded-full animate-pulse"
                  style={{
                    animationDelay: `${i * 0.2}s`,
                    animationDuration: '1s'
                  }}
                />
              ))}
            </div>
            <span className="text-medical-green font-medium">{message}</span>
          </div>
        );
      
      case 'dots':
      default:
        return (
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-2 h-2 bg-medical-green rounded-full animate-bounce"
                  style={{
                    animationDelay: `${i * 0.15}s`,
                    animationDuration: '0.6s'
                  }}
                />
              ))}
            </div>
            <span className="text-medical-green font-medium">{message}</span>
          </div>
        );
    }
  };

  return (
    <div className={cn("flex gap-3 items-start", className)}>
      {/* Avatar */}
      {showAvatar && (
        <Avatar className="w-8 h-8">
          <AvatarFallback className="bg-medical-green/10 text-medical-green">
            <Bot className="h-4 w-4" />
          </AvatarFallback>
        </Avatar>
      )}

      {/* Typing Indicator Card */}
      <Card className="bg-medical-green/5 border-medical-green/20 border max-w-xs">
        <CardContent className="p-3">
          <div className="flex items-center justify-between mb-2">
            <Badge 
              variant="secondary"
              className="text-xs px-2 py-0.5 bg-medical-green/10 text-medical-green border-medical-green/20"
            >
              <Zap className="h-3 w-3 mr-1" />
              MedMentor
            </Badge>
          </div>
          
          {renderTypingAnimation()}
        </CardContent>
      </Card>
    </div>
  );
};

export default TypingIndicator;