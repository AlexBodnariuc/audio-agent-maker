import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Search, Plus, Edit, Trash2, RefreshCw, ChevronLeft, ChevronRight, AlertCircle } from "lucide-react";
import VoiceAgentCard from "./VoiceAgentCard";
import CreateAgentDialog from "./CreateAgentDialog";
import EditAgentDialog from "./EditAgentDialog";
import { ROMANIAN_MEDICAL_SPECIALTIES } from "@/lib/validation";
import type { VoiceAgent, ListVoiceAgentsResponse, PaginationInfo } from "@/lib/validation";

interface VoiceAgentManagementProps {
  onAgentSelect?: (agent: VoiceAgent) => void;
  selectedAgentId?: string;
}

export default function VoiceAgentManagement({ 
  onAgentSelect, 
  selectedAgentId 
}: VoiceAgentManagementProps) {
  const [agents, setAgents] = useState<VoiceAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingAgent, setEditingAgent] = useState<VoiceAgent | null>(null);
  const [operationInProgress, setOperationInProgress] = useState<string | null>(null);
  
  // Filters and pagination
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSpecialty, setSelectedSpecialty] = useState<string>("");
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 9,
    total: 0,
    totalPages: 0,
    hasNext: false,
    hasPrev: false,
  });
  
  const { toast } = useToast();

  useEffect(() => {
    fetchAgents();
  }, [pagination.page, searchQuery, selectedSpecialty]);

  const fetchAgents = async () => {
    try {
      setError(null);
      setLoading(true);
      
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
      });
      
      if (searchQuery.trim()) {
        params.append('search', searchQuery.trim());
      }
      
      if (selectedSpecialty) {
        params.append('specialty', selectedSpecialty);
      }

      const { data, error } = await supabase.functions.invoke('manage-voice-agents', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (error) {
        throw new Error(error.message || 'Failed to fetch agents');
      }

      const response = data as ListVoiceAgentsResponse;
      setAgents(response.data);
      setPagination(response.pagination);
      
    } catch (error) {
      console.error('Error fetching voice agents:', error);
      const errorMessage = error instanceof Error 
        ? error.message 
        : 'Nu am putut încărca asistenții vocali';
      
      setError(errorMessage);
      toast({
        title: "Eroare",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAgent = (newAgent: VoiceAgent) => {
    setAgents(prev => [newAgent, ...prev]);
    setShowCreateDialog(false);
    // Refresh to get updated pagination
    fetchAgents();
    toast({
      title: "Succes!",
      description: "Asistentul vocal a fost creat cu succes",
    });
  };

  const handleUpdateAgent = async (agentId: string, updates: Partial<VoiceAgent>) => {
    try {
      setOperationInProgress(`update-${agentId}`);
      
      const { data, error } = await supabase.functions.invoke(`manage-voice-agents/${agentId}`, {
        method: 'PATCH',
        body: updates,
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (error) {
        throw new Error(error.message || 'Failed to update agent');
      }

      const updatedAgent = data.data as VoiceAgent;
      setAgents(prev => 
        prev.map(agent => agent.id === agentId ? updatedAgent : agent)
      );

      setEditingAgent(null);
      toast({
        title: "Succes!",
        description: "Asistentul vocal a fost actualizat cu succes",
      });
    } catch (error) {
      console.error('Error updating agent:', error);
      const errorMessage = error instanceof Error 
        ? error.message 
        : 'Nu am putut actualiza asistentul vocal';
        
      toast({
        title: "Eroare",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setOperationInProgress(null);
    }
  };

  const handleDeleteAgent = async (agentId: string) => {
    try {
      setOperationInProgress(`delete-${agentId}`);
      
      const agentToDelete = agents.find(a => a.id === agentId);
      
      const { data, error } = await supabase.functions.invoke(`manage-voice-agents/${agentId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (error) {
        throw new Error(error.message || 'Failed to delete agent');
      }

      setAgents(prev => prev.filter(agent => agent.id !== agentId));
      
      // Refresh to get updated pagination
      fetchAgents();
      
      toast({
        title: "Succes!",
        description: `Asistentul "${agentToDelete?.name || 'Unknown'}" a fost șters cu succes`,
      });
    } catch (error) {
      console.error('Error deleting agent:', error);
      const errorMessage = error instanceof Error 
        ? error.message 
        : 'Nu am putut șterge asistentul vocal';
        
      toast({
        title: "Eroare",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setOperationInProgress(null);
    }
  };

  const handleSearch = (value: string) => {
    setSearchQuery(value);
    setPagination(prev => ({ ...prev, page: 1 })); // Reset to first page
  };

  const handleSpecialtyFilter = (specialty: string) => {
    setSelectedSpecialty(specialty === "all" ? "" : specialty);
    setPagination(prev => ({ ...prev, page: 1 })); // Reset to first page
  };

  const handlePageChange = (newPage: number) => {
    setPagination(prev => ({ ...prev, page: newPage }));
  };

  if (loading && agents.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="text-muted-foreground">Se încarcă asistenții vocali...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Create Button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Asistenți Vocali</h2>
          <p className="text-muted-foreground">
            Gestionează și configurează asistenții vocali AI
          </p>
        </div>
        <Button 
          onClick={() => setShowCreateDialog(true)}
          disabled={operationInProgress !== null}
          className="bg-primary hover:bg-primary/90"
        >
          <Plus className="h-4 w-4 mr-2" />
          Creează Asistent
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filtre și Căutare</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Caută după nume sau descriere..."
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={selectedSpecialty || "all"} onValueChange={handleSpecialtyFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Filtrează după specialitate" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toate specialitățile</SelectItem>
                {ROMANIAN_MEDICAL_SPECIALTIES.map((specialty) => (
                  <SelectItem key={specialty} value={specialty}>
                    {specialty.charAt(0).toUpperCase() + specialty.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {pagination.total} asistenți găsiți
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchAgents}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Reîncarcă
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>{error}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchAgents}
              disabled={loading}
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Reîncearcă
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Agents Grid */}
      {agents.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <div className="text-6xl mb-4">🤖</div>
            <h3 className="text-lg font-semibold mb-2">
              Niciun asistent vocal găsit
            </h3>
            <p className="text-muted-foreground mb-4">
              {searchQuery || selectedSpecialty 
                ? "Încearcă să modifici filtrele de căutare"
                : "Creează primul tău asistent vocal pentru a începe"
              }
            </p>
            {!searchQuery && !selectedSpecialty && (
              <Button 
                onClick={() => setShowCreateDialog(true)}
                className="bg-primary hover:bg-primary/90"
              >
                <Plus className="h-4 w-4 mr-2" />
                Creează Primul Asistent
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {agents.map((agent) => (
            <VoiceAgentCard
              key={agent.id}
              agent={agent}
              isSelected={selectedAgentId === agent.id}
              onSelect={onAgentSelect}
              onUpdate={handleUpdateAgent}
              onDelete={handleDeleteAgent}
              onEdit={(agent) => setEditingAgent(agent)}
              disabled={operationInProgress !== null}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Pagina {pagination.page} din {pagination.totalPages}
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(pagination.page - 1)}
              disabled={!pagination.hasPrev || loading}
            >
              <ChevronLeft className="h-4 w-4" />
              Anterior
            </Button>
            
            {/* Page numbers */}
            <div className="flex space-x-1">
              {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                const pageNum = Math.max(1, pagination.page - 2) + i;
                if (pageNum > pagination.totalPages) return null;
                
                return (
                  <Button
                    key={pageNum}
                    variant={pageNum === pagination.page ? "default" : "outline"}
                    size="sm"
                    onClick={() => handlePageChange(pageNum)}
                    disabled={loading}
                    className="w-8 h-8 p-0"
                  >
                    {pageNum}
                  </Button>
                );
              })}
            </div>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(pagination.page + 1)}
              disabled={!pagination.hasNext || loading}
            >
              Următorul
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Dialogs */}
      <CreateAgentDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onAgentCreated={handleCreateAgent}
      />
      
      {editingAgent && (
        <EditAgentDialog
          open={!!editingAgent}
          onOpenChange={(open) => !open && setEditingAgent(null)}
          agent={editingAgent}
          onAgentUpdated={(updatedAgent) => {
            setAgents(prev => 
              prev.map(agent => agent.id === updatedAgent.id ? updatedAgent : agent)
            );
            setEditingAgent(null);
          }}
        />
      )}
    </div>
  );
}