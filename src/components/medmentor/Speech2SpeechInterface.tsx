import React from 'react';
import { Mic, Square, Volume2, VolumeX, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useSpeech2Speech, Speech2SpeechOptions } from '@/hooks/useSpeech2Speech';

interface Speech2SpeechInterfaceProps extends Omit<Speech2SpeechOptions, 'onTranscription' | 'onAIResponse' | 'onError'> {
  onTranscription?: (text: string) => void;
  onAIResponse?: (text: string) => void;
  onError?: (error: string) => void;
  className?: string;
  showTranscriptions?: boolean;
}

export const Speech2SpeechInterface: React.FC<Speech2SpeechInterfaceProps> = ({
  conversationId,
  voice = 'alloy',
  language = 'ro',
  onTranscription,
  onAIResponse,
  onError,
  className = '',
  showTranscriptions = false
}) => {
  const speech2speech = useSpeech2Speech({
    conversationId,
    voice,
    language,
    onTranscription,
    onAIResponse,
    onError
  });

  const getRecordButtonContent = () => {
    if (speech2speech.isProcessing) {
      return (
        <>
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>Se procesează...</span>
        </>
      );
    }

    if (speech2speech.isRecording) {
      return (
        <>
          <Square className="h-6 w-6 text-destructive" />
          <span>Oprește înregistrarea</span>
        </>
      );
    }

    return (
      <>
        <Mic className="h-6 w-6" />
        <span>Ține apăsat pentru a vorbi</span>
      </>
    );
  };

  const getStatusMessage = () => {
    if (speech2speech.isRecording) {
      return "🎤 Vorbește acum...";
    }
    if (speech2speech.isProcessing) {
      return "🤖 Se procesează cererea...";
    }
    if (speech2speech.isPlaying) {
      return "🔊 Redare răspuns...";
    }
    return "Ține apăsat butonul pentru a începe";
  };

  return (
    <Card className={`w-full max-w-2xl mx-auto ${className}`}>
      <CardHeader>
        <CardTitle className="text-center flex items-center justify-center gap-2">
          <Volume2 className="h-5 w-5" />
          Chat Vocal
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Status Display */}
        <div className="text-center">
          <p className="text-sm text-muted-foreground mb-4">
            {getStatusMessage()}
          </p>
          
          {/* Visual Recording Indicator */}
          {speech2speech.isRecording && (
            <div className="flex justify-center mb-4">
              <div className="w-4 h-4 bg-destructive rounded-full animate-pulse" />
            </div>
          )}
        </div>

        {/* Main Push-to-Talk Button */}
        <div className="flex justify-center">
          <Button
            size="lg"
            className="h-20 w-20 rounded-full p-0 transition-all duration-200 hover:scale-105"
            variant={speech2speech.isRecording ? "destructive" : "default"}
            disabled={speech2speech.isProcessing}
            onMouseDown={speech2speech.startRecording}
            onMouseUp={speech2speech.stopRecording}
            onTouchStart={speech2speech.startRecording}
            onTouchEnd={speech2speech.stopRecording}
          >
            {getRecordButtonContent()}
          </Button>
        </div>

        {/* Control Buttons */}
        <div className="flex justify-center gap-2">
          {speech2speech.isPlaying && (
            <Button
              size="sm"
              variant="outline"
              onClick={speech2speech.stopAudio}
            >
              <VolumeX className="h-4 w-4 mr-2" />
              Oprește audio
            </Button>
          )}
          
          <Button
            size="sm"
            variant="outline"
            onClick={speech2speech.reset}
            disabled={speech2speech.isRecording || speech2speech.isProcessing}
          >
            Reset
          </Button>
        </div>

        {/* Error Display */}
        {speech2speech.error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex justify-between items-center">
              {speech2speech.error}
              <Button
                size="sm"
                variant="ghost"
                onClick={speech2speech.clearError}
              >
                Închide
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Transcriptions Display (Optional) */}
        {showTranscriptions && (
          <div className="space-y-4">
            {speech2speech.transcription && (
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm font-medium text-muted-foreground mb-1">
                  Cererea ta:
                </p>
                <p className="text-sm">{speech2speech.transcription}</p>
              </div>
            )}

            {speech2speech.aiResponse && (
              <div className="p-3 bg-primary/10 rounded-lg">
                <p className="text-sm font-medium text-muted-foreground mb-1">
                  Răspuns:
                </p>
                <p className="text-sm">{speech2speech.aiResponse}</p>
              </div>
            )}
          </div>
        )}

        {/* Instructions */}
        <div className="text-center text-xs text-muted-foreground">
          <p>Ține apăsat butonul și vorbește</p>
          <p>Eliberează pentru a trimite și primi răspuns vocal</p>
        </div>
      </CardContent>
    </Card>
  );
};