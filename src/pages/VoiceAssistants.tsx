import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Bot, Plus, Users, Sparkles, RefreshCw, AlertCircle, Wifi } from "lucide-react";
import { useNavigate } from "react-router-dom";
import VoiceAgentCard from "@/components/voice/VoiceAgentCard";
import CreateAgentDialog from "@/components/voice/CreateAgentDialog";
import AgentTestingPanel from "@/components/voice/AgentTestingPanel";
import VoiceTutorPanel from "@/components/VoiceTutorPanel";
import VoiceAgentManagement from "@/components/voice/VoiceAgentManagement";
import { Speech2SpeechInterface } from "@/components/medmentor/Speech2SpeechInterface";
import { ROMANIAN_TRANSLATIONS } from "@/components/medmentor/RomanianUI";
import type { VoiceAgent } from "@/lib/validation";

// Helper function to convert database result to VoiceAgent type
function transformToVoiceAgent(dbResult: any): VoiceAgent {
  return {
    ...dbResult,
    persona_json: dbResult.persona_json as Record<string, any> | null,
    limits_json: dbResult.limits_json as Record<string, any> | null,
  };
}

// Helper function to transform array of database results
function transformToVoiceAgents(dbResults: any[]): VoiceAgent[] {
  return dbResults.map(transformToVoiceAgent);
}

export default function VoiceAssistants() {
  const [personalities, setPersonalities] = useState<VoiceAgent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<VoiceAgent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [operationInProgress, setOperationInProgress] = useState<string | null>(null);
  const [testConversationId, setTestConversationId] = useState<string>('');
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    fetchVoicePersonalities();
    // Create a test conversation ID for realtime voice testing
    createTestConversation();
  }, []);

  const createTestConversation = async () => {
    try {
      console.log('Creating test conversation via edge function...');
      const { data, error } = await supabase.functions.invoke('create-conversation', {
        body: {
          specialtyFocus: 'biologie',
          sessionType: 'realtime_voice_test',
          quizSessionId: null
        }
      });

      if (error) {
        console.error('Edge function error:', error);
        toast({
          title: "Eroare Edge Function",
          description: `Nu s-a putut crea conversația prin edge function: ${error.message}`,
          variant: "destructive",
        });
        
        // Fallback: try creating conversation directly via Supabase client
        console.log('Attempting fallback: creating conversation directly...');
        return await createConversationFallback();
      }

      if (data?.conversationId) {
        setTestConversationId(data.conversationId);
        console.log('Test conversation created successfully:', data.conversationId);
        toast({
          title: "Succes!",
          description: "Conversația de test a fost creată cu succes.",
        });
      } else {
        console.error('No conversation ID returned:', data);
        toast({
          title: "Eroare",
          description: "Nu s-a primit ID-ul conversației.",
          variant: "destructive",
        });
        return await createConversationFallback();
      }
    } catch (error) {
      console.error('Error creating test conversation:', error);
      toast({
        title: "Eroare de rețea",
        description: `Eroare la crearea conversației: ${error instanceof Error ? error.message : 'Eroare necunoscută'}`,
        variant: "destructive",
      });
      
      // Fallback mechanism
      return await createConversationFallback();
    }
  };

  const createConversationFallback = async () => {
    try {
      console.log('Creating conversation via fallback method...');
      
      // First get an active voice personality
      const { data: personality, error: personalityError } = await supabase
        .from('voice_personalities')
        .select('id')
        .eq('is_active', true)
        .limit(1)
        .single();

      if (personalityError || !personality) {
        console.error('No active voice personality found:', personalityError);
        toast({
          title: "Eroare Configurare",
          description: "Nu există personalități vocale active configurate.",
          variant: "destructive",
        });
        return;
      }

      // Create conversation directly
      const conversationData = {
        voice_personality_id: personality.id,
        voice_session_type: 'realtime_voice_test',
        specialty_focus: 'biologie',
        quiz_session_id: null,
        user_id: null,
        email_session_id: null,
        status: 'active',
        title: 'Voice Session - Biologie (Test)',
        learning_context: {
          sessionType: 'realtime_voice_test',
          startTime: new Date().toISOString(),
          specialtyFocus: 'biologie'
        }
      };

      const { data: conversation, error: conversationError } = await supabase
        .from('conversations')
        .insert(conversationData)
        .select()
        .single();

      if (conversationError) {
        console.error('Fallback conversation creation failed:', conversationError);
        toast({
          title: "Eroare Fallback",
          description: `Nu s-a putut crea conversația prin fallback: ${conversationError.message}`,
          variant: "destructive",
        });
        return;
      }

      if (conversation?.id) {
        setTestConversationId(conversation.id);
        console.log('Fallback conversation created successfully:', conversation.id);
        toast({
          title: "Succes (Fallback)!",
          description: "Conversația de test a fost creată prin metoda de rezervă.",
        });
      }
    } catch (fallbackError) {
      console.error('Fallback method also failed:', fallbackError);
      toast({
        title: "Eroare Critică",
        description: "Toate metodele de creare a conversației au eșuat. Verifică configurația.",
        variant: "destructive",
      });
    }
  };

  const fetchVoicePersonalities = async (showRetryToast = false) => {
    try {
      setError(null);
      if (showRetryToast) {
        setRetrying(true);
      }
      
      const { data, error } = await supabase
        .from('voice_personalities')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) {
        // Handle specific database errors
        if (error.code === 'PGRST116') {
          throw new Error('Tabelul pentru asistenți vocali nu există');
        } else if (error.message.includes('connection')) {
          throw new Error('Probleme de conexiune cu baza de date');
        }
        throw new Error(`Eroare bază de date: ${error.message}`);
      }
      
      // Transform the data to match VoiceAgent type
      const transformedData = data ? transformToVoiceAgents(data) : [];
      setPersonalities(transformedData);
      
      if (showRetryToast && data) {
        toast({
          title: ROMANIAN_TRANSLATIONS.STATUS.success,
          description: `Încărcat ${data.length} asistenți vocali`,
        });
      }
      
    } catch (error) {
      console.error('Error fetching voice personalities:', error);
      const errorMessage = error instanceof Error 
        ? error.message 
        : 'Nu am putut încărca asistenții vocali';
      
      setError(errorMessage);
      
      if (!showRetryToast) {
        toast({
          title: ROMANIAN_TRANSLATIONS.STATUS.error,
          description: errorMessage,
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
      setRetrying(false);
    }
  };

  const handleAgentCreated = (newAgent: VoiceAgent) => {
    setPersonalities(prev => [newAgent, ...prev]);
    setShowCreateDialog(false);
    toast({
      title: "Succes!",
      description: "Asistentul vocal a fost creat cu succes",
    });
  };

  const handleAgentSelect = (agent: VoiceAgent) => {
    setSelectedAgent(agent);
  };

  const handleAgentUpdate = async (agentId: string, updates: Partial<VoiceAgent>) => {
    try {
      setOperationInProgress(`update-${agentId}`);
      
      const { error } = await supabase
        .from('voice_personalities')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', agentId);

      if (error) {
        if (error.code === '23505') {
          throw new Error('Un asistent cu aceste date există deja');
        }
        throw new Error(`Eroare la actualizare: ${error.message}`);
      }

      setPersonalities(prev => 
        prev.map(p => p.id === agentId ? { ...p, ...updates, updated_at: new Date().toISOString() } : p)
      );

      // Update selected agent if it's the one being updated
      if (selectedAgent?.id === agentId) {
        setSelectedAgent(prev => prev ? { ...prev, ...updates, updated_at: new Date().toISOString() } : null);
      }

      toast({
        title: ROMANIAN_TRANSLATIONS.STATUS.success,
        description: "Asistentul vocal a fost actualizat cu succes",
      });
    } catch (error) {
      console.error('Error updating agent:', error);
      
      const errorMessage = error instanceof Error 
        ? error.message 
        : 'Nu am putut actualiza asistentul vocal';
        
      toast({
        title: ROMANIAN_TRANSLATIONS.STATUS.error,
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setOperationInProgress(null);
    }
  };

  const handleAgentDelete = async (agentId: string) => {
    try {
      setOperationInProgress(`delete-${agentId}`);
      
      const agentToDelete = personalities.find(p => p.id === agentId);
      
      const { error } = await supabase
        .from('voice_personalities')
        .update({ 
          is_active: false, 
          updated_at: new Date().toISOString()
        })
        .eq('id', agentId);

      if (error) {
        throw new Error(`Eroare la ștergere: ${error.message}`);
      }

      setPersonalities(prev => prev.filter(p => p.id !== agentId));
      
      if (selectedAgent?.id === agentId) {
        setSelectedAgent(null);
      }

      toast({
        title: ROMANIAN_TRANSLATIONS.STATUS.success,
        description: `Asistentul "${agentToDelete?.name || 'Unknown'}" a fost șters cu succes`,
      });
    } catch (error) {
      console.error('Error deleting agent:', error);
      
      const errorMessage = error instanceof Error 
        ? error.message 
        : 'Nu am putut șterge asistentul vocal';
        
      toast({
        title: ROMANIAN_TRANSLATIONS.STATUS.error,
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setOperationInProgress(null);
    }
  };

  const handleRetry = () => {
    setLoading(true);
    fetchVoicePersonalities(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-hero flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-medical-blue mx-auto"></div>
          <p className="text-muted-foreground">
            {retrying ? 'Reîncărcare...' : ROMANIAN_TRANSLATIONS.STATUS.loading}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-hero">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <Button 
            variant="outline" 
            onClick={() => navigate("/")}
            className="mb-6"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Înapoi la Pagina Principală
          </Button>
          
          {error && (
            <Alert variant="destructive" className="mb-6">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="flex items-center justify-between">
                <span>{error}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRetry}
                  disabled={retrying}
                  className="ml-4"
                >
                  {retrying ? (
                    <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <Wifi className="h-3 w-3 mr-1" />
                  )}
                  Reîncearcă
                </Button>
              </AlertDescription>
            </Alert>
          )}
          
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground mb-2">
                Asistenți Vocali AI MedMentor
              </h1>
              <p className="text-muted-foreground">
                Gestionează și testează asistenții vocali pentru pregătirea la UMF
              </p>
              {personalities.length > 0 && (
                <p className="text-sm text-medical-blue mt-1">
                  {personalities.length} asistenți activi
                </p>
              )}
            </div>
            <Button 
              onClick={() => setShowCreateDialog(true)}
              disabled={operationInProgress !== null}
              className="bg-medical-blue hover:bg-medical-blue/90"
            >
              <Plus className="h-4 w-4 mr-2" />
              Creează Asistent
            </Button>
          </div>
        </div>

        <Tabs defaultValue="speech2speech" className="space-y-6">
          <TabsList className="grid w-full max-w-2xl grid-cols-4">
            <TabsTrigger value="speech2speech" className="flex items-center gap-2">
              🎤 Chat Vocal
            </TabsTrigger>
            <TabsTrigger value="realtime" className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              🎙️ Voce Real-Time
            </TabsTrigger>
            <TabsTrigger value="manage" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Gestionează
            </TabsTrigger>
            <TabsTrigger value="test" className="flex items-center gap-2">
              <Bot className="h-4 w-4" />
              Testează
            </TabsTrigger>
          </TabsList>

          <TabsContent value="speech2speech" className="space-y-6">
            <div className="max-w-4xl mx-auto">
              <Speech2SpeechInterface
                conversationId={testConversationId || "demo-conversation-123"}
                voice="alloy"
                language="ro"
                showTranscriptions={true}
                onTranscription={(text) => console.log('Transcription:', text)}
                onAIResponse={(text) => console.log('AI Response:', text)}
                onError={(error) => console.error('Speech2Speech Error:', error)}
              />
            </div>
          </TabsContent>

          <TabsContent value="realtime" className="space-y-6">
            {testConversationId ? (
              <div className="space-y-4">
                <Alert className="border-primary/20 bg-primary/5">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <AlertDescription>
                    <strong>🚀 Test Real-Time Voice:</strong> Testează conversația vocală cu OpenAI Realtime API. 
                    Vorbește în română și primești răspunsuri instantanee!
                  </AlertDescription>
                </Alert>
                
                <VoiceTutorPanel 
                  conversationId={testConversationId}
                  specialtyFocus="biologie"
                  voice="alloy"
                  onSessionEnd={() => {
                    toast({
                      title: "Sesiune Închisă",
                      description: "Poți începe o nouă sesiune oricând!",
                    });
                  }}
                />
              </div>
            ) : (
              <Card className="text-center py-12">
                <CardContent>
                  <RefreshCw className="h-16 w-16 text-muted-foreground mx-auto mb-4 animate-pulse" />
                  <h3 className="text-lg font-semibold mb-2">
                    Pregătire Sesiune Vocală...
                  </h3>
                  <p className="text-muted-foreground">
                    Se creează o conversație de test pentru funcționalitatea vocală
                  </p>
                  <Button 
                    onClick={createTestConversation}
                    variant="outline"
                    className="mt-4"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Reîncearcă
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="manage" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {personalities.map((personality) => (
                <VoiceAgentCard
                  key={personality.id}
                  agent={personality}
                  onSelect={handleAgentSelect}
                  onUpdate={handleAgentUpdate}
                  onDelete={handleAgentDelete}
                  isSelected={selectedAgent?.id === personality.id}
                />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="test" className="space-y-6">
            {selectedAgent ? (
              <AgentTestingPanel 
                agent={selectedAgent}
                personalities={personalities}
                onAgentChange={setSelectedAgent}
              />
            ) : (
              <Card className="text-center py-12">
                <CardContent>
                  <Sparkles className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">
                    Selectează un asistent pentru testare
                  </h3>
                  <p className="text-muted-foreground">
                    Alege un asistent vocal din tab-ul "Gestionează" pentru a-l testa
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        <CreateAgentDialog
          open={showCreateDialog}
          onOpenChange={setShowCreateDialog}
          onAgentCreated={handleAgentCreated}
        />
      </div>
    </div>
  );
}
