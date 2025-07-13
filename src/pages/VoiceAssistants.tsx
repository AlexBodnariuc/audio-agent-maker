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
import { ROMANIAN_TRANSLATIONS } from "@/components/medmentor/RomanianUI";

interface VoicePersonality {
  id: string;
  name: string;
  description: string;
  medical_specialty: string;
  agent_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export default function VoiceAssistants() {
  const [personalities, setPersonalities] = useState<VoicePersonality[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<VoicePersonality | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [operationInProgress, setOperationInProgress] = useState<string | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    fetchVoicePersonalities();
  }, []);

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
      
      setPersonalities(data || []);
      
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

  const handleAgentCreated = (newAgent: VoicePersonality) => {
    setPersonalities(prev => [newAgent, ...prev]);
    setShowCreateDialog(false);
    toast({
      title: "Succes!",
      description: "Asistentul vocal a fost creat cu succes",
    });
  };

  const handleAgentSelect = (agent: VoicePersonality) => {
    setSelectedAgent(agent);
  };

  const handleAgentUpdate = async (agentId: string, updates: Partial<VoicePersonality>) => {
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

        <Tabs defaultValue="manage" className="space-y-6">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="manage" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Gestionează
            </TabsTrigger>
            <TabsTrigger value="test" className="flex items-center gap-2">
              <Bot className="h-4 w-4" />
              Testează
            </TabsTrigger>
          </TabsList>

          <TabsContent value="manage" className="space-y-6">
            {personalities.length === 0 ? (
              <Card className="text-center py-12">
                <CardContent>
                  <Bot className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">
                    Niciun asistent vocal găsit
                  </h3>
                  <p className="text-muted-foreground mb-4">
                    Creează primul tău asistent vocal pentru a începe
                  </p>
                  <Button 
                    onClick={() => setShowCreateDialog(true)}
                    className="bg-medical-blue hover:bg-medical-blue/90"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Creează Primul Asistent
                  </Button>
                </CardContent>
              </Card>
            ) : (
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
            )}
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