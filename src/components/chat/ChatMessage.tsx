import React from 'react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { User, Bot, Copy, Volume2, ThumbsUp, ThumbsDown, Clock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface ChatMessage {
  id?: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: string;
  isStreaming?: boolean;
  metadata?: {
    tokens?: number;
    model?: string;
    confidence?: number;
  };
}

interface ChatMessageProps {
  message: ChatMessage;
  showAvatar?: boolean;
  showTimestamp?: boolean;
  showActions?: boolean;
  isStreaming?: boolean;
  className?: string;
  onFeedback?: (messageId: string, feedback: 'positive' | 'negative') => void;
  onTTS?: (text: string) => void;
}

const ChatMessage: React.FC<ChatMessageProps> = ({
  message,
  showAvatar = true,
  showTimestamp = true,
  showActions = true,
  isStreaming = false,
  className = "",
  onFeedback,
  onTTS
}) => {
  const { toast } = useToast();
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      toast({
        title: "Copiat!",
        description: "Textul a fost copiat în clipboard.",
      });
    } catch (err) {
      toast({
        title: "Eroare",
        description: "Nu s-a putut copia textul.",
        variant: "destructive",
      });
    }
  };

  const handleTTS = () => {
    if (onTTS) {
      onTTS(message.content);
    } else {
      toast({
        title: "Text-to-Speech",
        description: "Funcția nu este disponibilă.",
        variant: "destructive",
      });
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('ro-RO', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  return (
    <div className={cn("flex gap-3", isUser ? "flex-row-reverse" : "flex-row", className)}>
      {/* Avatar */}
      {showAvatar && (
        <Avatar className={cn("w-8 h-8", isUser ? "order-2" : "order-1")}>
          <AvatarFallback className={cn(
            isUser 
              ? "bg-medical-blue/10 text-medical-blue" 
              : "bg-medical-green/10 text-medical-green"
          )}>
            {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
          </AvatarFallback>
        </Avatar>
      )}

      {/* Message Content */}
      <div className={cn("flex-1 max-w-[80%]", isUser ? "order-1" : "order-2")}>
        <Card className={cn(
          "relative border transition-all duration-200",
          isUser 
            ? "bg-medical-blue/5 border-medical-blue/20 ml-auto" 
            : "bg-medical-green/5 border-medical-green/20",
          isStreaming && "animate-pulse border-medical-yellow/40"
        )}>
          <CardContent className="p-3">
            {/* Message Header */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Badge 
                  variant="secondary" 
                  className={cn(
                    "text-xs px-2 py-0.5",
                    isUser 
                      ? "bg-medical-blue/10 text-medical-blue border-medical-blue/20"
                      : "bg-medical-green/10 text-medical-green border-medical-green/20"
                  )}
                >
                  {isUser ? "Tu" : "MedMentor"}
                </Badge>
                
                {isStreaming && (
                  <Badge variant="outline" className="text-xs border-medical-yellow/30 text-medical-yellow">
                    <div className="flex items-center gap-1">
                      <div className="w-1 h-1 bg-current rounded-full animate-bounce" />
                      <div className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                      <div className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                    </div>
                  </Badge>
                )}

                {showTimestamp && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span>{formatTimestamp(message.timestamp)}</span>
                  </div>
                )}
              </div>

              {/* Message Actions */}
              {showActions && !isStreaming && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCopyText}
                    className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                  
                  {isAssistant && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleTTS}
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                    >
                      <Volume2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Message Text */}
            <div className={cn(
              "text-sm leading-relaxed whitespace-pre-wrap break-words",
              isUser ? "text-foreground" : "text-foreground"
            )}>
              {message.content}
            </div>

            {/* Message Metadata */}
            {message.metadata && (
              <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/30">
                {message.metadata.tokens && (
                  <span className="text-xs text-muted-foreground">
                    {message.metadata.tokens} tokens
                  </span>
                )}
                {message.metadata.confidence && (
                  <Badge 
                    variant="outline" 
                    className={cn(
                      "text-xs",
                      message.metadata.confidence > 0.8 
                        ? "border-medical-green/30 text-medical-green"
                        : message.metadata.confidence > 0.6
                        ? "border-medical-yellow/30 text-medical-yellow"
                        : "border-medical-red/30 text-medical-red"
                    )}
                  >
                    {Math.round(message.metadata.confidence * 100)}% încredere
                  </Badge>
                )}
              </div>
            )}

            {/* Feedback Actions (for assistant messages) */}
            {isAssistant && showActions && !isStreaming && onFeedback && message.id && (
              <div className="flex items-center justify-end gap-1 mt-2 pt-2 border-t border-border/30">
                <span className="text-xs text-muted-foreground mr-2">Util?</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onFeedback(message.id!, 'positive')}
                  className="h-6 w-6 p-0 text-muted-foreground hover:text-medical-green"
                >
                  <ThumbsUp className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onFeedback(message.id!, 'negative')}
                  className="h-6 w-6 p-0 text-muted-foreground hover:text-medical-red"
                >
                  <ThumbsDown className="h-3 w-3" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ChatMessage;