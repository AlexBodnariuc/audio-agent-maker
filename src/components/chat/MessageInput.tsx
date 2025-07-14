import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Send, Mic, MicOff, Loader2, Keyboard, Hash } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MessageInputProps {
  onSendMessage: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
  maxLength?: number;
  showCharCount?: boolean;
  showVoiceInput?: boolean;
  className?: string;
  autoFocus?: boolean;
  onTypingChange?: (isTyping: boolean) => void;
}

const MessageInput: React.FC<MessageInputProps> = ({
  onSendMessage,
  disabled = false,
  placeholder = "Scrie mesajul tău...",
  maxLength = 2000,
  showCharCount = true,
  showVoiceInput = false,
  className = "",
  autoFocus = false,
  onTypingChange
}) => {
  const [message, setMessage] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isVoiceSupported, setIsVoiceSupported] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Check voice support on mount
  useEffect(() => {
    setIsVoiceSupported('webkitSpeechRecognition' in window || 'SpeechRecognition' in window);
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [message]);

  // Handle typing indicator
  useEffect(() => {
    if (onTypingChange) {
      if (message.trim()) {
        onTypingChange(true);
        
        // Clear existing timeout
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
        }
        
        // Set new timeout to stop typing indicator
        typingTimeoutRef.current = setTimeout(() => {
          onTypingChange(false);
        }, 1000);
      } else {
        onTypingChange(false);
      }
    }

    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [message, onTypingChange]);

  const handleSendMessage = useCallback(() => {
    const trimmedMessage = message.trim();
    if (!trimmedMessage || disabled) return;

    onSendMessage(trimmedMessage);
    setMessage('');
    
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    // Stop typing indicator
    if (onTypingChange) {
      onTypingChange(false);
    }
  }, [message, disabled, onSendMessage, onTypingChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  }, [handleSendMessage]);

  const handleVoiceInput = useCallback(() => {
    if (!isVoiceSupported) return;

    if (isRecording) {
      // Stop recording logic would go here
      setIsRecording(false);
    } else {
      // Start recording logic would go here  
      setIsRecording(true);
      
      // Simulate voice recording for now
      setTimeout(() => {
        setIsRecording(false);
      }, 3000);
    }
  }, [isRecording, isVoiceSupported]);

  const remainingChars = maxLength - message.length;
  const isOverLimit = remainingChars < 0;
  const canSend = message.trim().length > 0 && !disabled && !isOverLimit;

  return (
    <Card className={cn("border-border/50 bg-background/50 backdrop-blur-sm", className)}>
      <div className="p-3">
        {/* Input Area */}
        <div className="flex gap-2 items-end">
          <div className="flex-1 relative">
            <Textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={disabled ? "Se generează răspunsul..." : placeholder}
              disabled={disabled}
              className={cn(
                "min-h-[40px] max-h-[120px] resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 pr-12",
                isOverLimit && "text-destructive"
              )}
              autoFocus={autoFocus}
              rows={1}
            />

            {/* Character Count */}
            {showCharCount && (
              <div className="absolute bottom-2 right-2">
                <Badge 
                  variant="secondary" 
                  className={cn(
                    "text-xs px-2 py-0.5",
                    isOverLimit 
                      ? "bg-destructive/10 text-destructive border-destructive/20"
                      : remainingChars < 100
                      ? "bg-medical-yellow/10 text-medical-yellow border-medical-yellow/20"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  <Hash className="h-3 w-3 mr-1" />
                  {remainingChars}
                </Badge>
              </div>
            )}
          </div>

          {/* Voice Input Button */}
          {showVoiceInput && isVoiceSupported && (
            <Button
              type="button"
              variant={isRecording ? "default" : "ghost"}
              size="sm"
              onClick={handleVoiceInput}
              disabled={disabled}
              className={cn(
                "h-10 w-10 p-0 shrink-0",
                isRecording && "bg-medical-red hover:bg-medical-red/90 text-white animate-pulse"
              )}
            >
              {isRecording ? (
                <MicOff className="h-4 w-4" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
            </Button>
          )}

          {/* Send Button */}
          <Button
            type="button"
            onClick={handleSendMessage}
            disabled={!canSend}
            size="sm"
            className={cn(
              "h-10 w-10 p-0 shrink-0 transition-all duration-200",
              canSend 
                ? "bg-medical-blue hover:bg-medical-blue/90 text-white shadow-md hover:shadow-lg" 
                : "bg-muted text-muted-foreground"
            )}
          >
            {disabled ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Input Hints */}
        <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <Keyboard className="h-3 w-3" />
              <span>Enter pentru trimitere</span>
            </div>
            <span>•</span>
            <span>Shift+Enter pentru linie nouă</span>
          </div>
          
          {isOverLimit && (
            <span className="text-destructive font-medium">
              Mesajul este prea lung cu {Math.abs(remainingChars)} caractere
            </span>
          )}
        </div>
      </div>
    </Card>
  );
};

export default MessageInput;