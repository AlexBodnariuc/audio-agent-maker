import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Bot, Plus, Users, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import VoiceAgentCard from "@/components/voice/VoiceAgentCard";
import CreateAgentDialog from "@/components/voice/CreateAgentDialog";
import AgentTestingPanel from "@/components/voice/AgentTestingPanel";

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
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    fetchVoicePersonalities();
  }, []);

  const fetchVoicePersonalities = async () => {
    try {
      const { data, error } = await supabase
        .from('voice_personalities')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPersonalities(data || []);
    } catch (error) {
      console.error('Error fetching voice personalities:', error);
      toast({
        title: "Eroare",
        description: "Nu am putut încărca asistenții vocali",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
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
      const { error } = await supabase
        .from('voice_personalities')
        .update(updates)
        .eq('id', agentId);

      if (error) throw error;

      setPersonalities(prev => 
        prev.map(p => p.id === agentId ? { ...p, ...updates } : p)
      );

      toast({
        title: "Actualizat!",
        description: "Asistentul vocal a fost actualizat cu succes",
      });
    } catch (error) {
      console.error('Error updating agent:', error);
      toast({
        title: "Eroare",
        description: "Nu am putut actualiza asistentul vocal",
        variant: "destructive",
      });
    }
  };

  const handleAgentDelete = async (agentId: string) => {
    try {
      const { error } = await supabase
        .from('voice_personalities')
        .update({ is_active: false })
        .eq('id', agentId);

      if (error) throw error;

      setPersonalities(prev => prev.filter(p => p.id !== agentId));
      if (selectedAgent?.id === agentId) {
        setSelectedAgent(null);
      }

      toast({
        title: "Șters!",
        description: "Asistentul vocal a fost șters cu succes",
      });
    } catch (error) {
      console.error('Error deleting agent:', error);
      toast({
        title: "Eroare",
        description: "Nu am putut șterge asistentul vocal",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-hero flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-medical-blue"></div>
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
          
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground mb-2">
                Asistenți Vocali AI
              </h1>
              <p className="text-muted-foreground">
                Gestionează și testează asistenții vocali pentru MedMentor
              </p>
            </div>
            <Button 
              onClick={() => setShowCreateDialog(true)}
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