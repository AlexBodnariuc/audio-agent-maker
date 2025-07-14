import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { MessageSquare, Users, Zap, Bot, Mic, MicOff } from 'lucide-react';
import { useChatStream } from '@/hooks/useChatStream';
import { useToast } from '@/hooks/use-toast';
import ChatMessage from './ChatMessage';
import MessageInput from './MessageInput';
import TypingIndicator from './TypingIndicator';
import ConnectionStatus from './ConnectionStatus';

interface LiveChatInterfaceProps {
  conversationId: string;
  title?: string;
  className?: string;
  showHeader?: boolean;
  maxHeight?: string;
  onMessageSent?: (message: string) => void;
  onTypingChange?: (isTyping: boolean) => void;
}

const LiveChatInterface: React.FC<LiveChatInterfaceProps> = ({
  conversationId,
  title = "Chat MedMentor",
  className = "",
  showHeader = true,
  maxHeight = "600px",
  onMessageSent,
  onTypingChange
}) => {
  const { messages, isStreaming, error, sendMessage, clearMessages } = useChatStream();
  const { toast } = useToast();
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [isConnected, setIsConnected] = useState(true);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollElement = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollElement) {
        scrollElement.scrollTop = scrollElement.scrollHeight;
      }
    }
  }, [messages]);

  // Notify parent of typing changes
  useEffect(() => {
    onTypingChange?.(isStreaming);
  }, [isStreaming, onTypingChange]);

  const handleSendMessage = async (text: string) => {
    if (!text.trim() || isStreaming) return;
    
    try {
      await sendMessage(conversationId, text);
      onMessageSent?.(text);
    } catch (err) {
      console.error('Failed to send message:', err);
      toast({
        title: "Eroare",
        description: "Nu s-a reușit trimiterea mesajului. Încercați din nou.",
        variant: "destructive",
      });
    }
  };

  const handleClearChat = () => {
    clearMessages();
    toast({
      title: "Chat Șters",
      description: "Conversația a fost ștearsă cu succes.",
    });
  };

  const messageCount = messages.length;
  const userMessages = messages.filter(m => m.role === 'user').length;
  const assistantMessages = messages.filter(m => m.role === 'assistant').length;

  return (
    <Card className={`flex flex-col bg-card/80 backdrop-blur-sm border-2 border-border/50 shadow-elegant ${className}`}>
      {showHeader && (
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-medical-blue/10">
                <MessageSquare className="h-5 w-5 text-medical-blue" />
              </div>
              <div>
                <CardTitle className="text-lg font-semibold">{title}</CardTitle>
                <div className="flex items-center gap-2 mt-1">
                  <ConnectionStatus isConnected={isConnected} />
                  <Badge variant="outline" className="text-xs border-medical-green/30 text-medical-green">
                    <Bot className="h-3 w-3 mr-1" />
                    AI Activ
                  </Badge>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                {messageCount} mesaje
              </Badge>
              {messageCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearChat}
                  className="text-muted-foreground hover:text-foreground"
                >
                  Șterge
                </Button>
              )}
            </div>
          </div>
          
          {/* Quick Stats */}
          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border/50">
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Users className="h-3 w-3" />
              <span>{userMessages}</span>
            </div>
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Bot className="h-3 w-3" />
              <span>{assistantMessages}</span>
            </div>
            {isStreaming && (
              <div className="flex items-center gap-1 text-sm text-medical-blue">
                <Zap className="h-3 w-3 animate-pulse" />
                <span>Se generează...</span>
              </div>
            )}
          </div>
        </CardHeader>
      )}

      <CardContent className="flex-1 flex flex-col p-0">
        {/* Messages */}
        <ScrollArea 
          ref={scrollAreaRef}
          className="flex-1 px-4"
          style={{ maxHeight }}
        >
          <div className="space-y-4 py-4">
            {messages.length === 0 ? (
              <div className="text-center py-8">
                <div className="p-4 rounded-full bg-medical-blue/10 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                  <MessageSquare className="h-8 w-8 text-medical-blue" />
                </div>
                <h3 className="font-medium text-foreground mb-2">
                  Începe conversația
                </h3>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                  Întreabă orice despre biologie, chimie sau pregătirea pentru admiterea la UMF. 
                  Sunt aici să te ajut!
                </p>
              </div>
            ) : (
              messages.map((message, index) => (
                <ChatMessage
                  key={`${message.id || index}-${message.timestamp}`}
                  message={message}
                  showAvatar
                  showTimestamp
                  isStreaming={message.isStreaming}
                />
              ))
            )}
            
            {/* Typing Indicator */}
            {isStreaming && (
              <TypingIndicator 
                className="ml-12" 
                message="MedMentor generează răspunsul..."
              />
            )}
          </div>
        </ScrollArea>

        <Separator />

        {/* Error Display */}
        {error && (
          <div className="px-4 py-2 bg-destructive/10 border-t border-destructive/20">
            <p className="text-sm text-destructive">
              Eroare: {error}
            </p>
          </div>
        )}

        {/* Message Input */}
        <div className="p-4">
          <MessageInput
            onSendMessage={handleSendMessage}
            disabled={isStreaming}
            placeholder="Întreabă despre biologie, chimie, sau admiterea la UMF..."
            maxLength={2000}
            showCharCount
          />
        </div>
      </CardContent>
    </Card>
  );
};

export default LiveChatInterface;