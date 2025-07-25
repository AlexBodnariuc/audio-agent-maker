import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Bot, 
  Edit, 
  Trash2, 
  Play, 
  CheckCircle,
  Stethoscope,
  Brain,
  Heart,
  Users,
  Clock
} from "lucide-react";
import { format } from "date-fns";
import EditAgentDialog from "./EditAgentDialog";

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

interface VoiceAgentCardProps {
  agent: VoicePersonality;
  onSelect: (agent: VoicePersonality) => void;
  onUpdate: (agentId: string, updates: Partial<VoicePersonality>) => void;
  onDelete: (agentId: string) => void;
  isSelected?: boolean;
}

const getSpecialtyIcon = (specialty: string) => {
  switch (specialty.toLowerCase()) {
    case 'cardiology':
      return Heart;
    case 'pediatrics':
      return Users;
    case 'emergency medicine':
      return Clock;
    case 'general medicine':
    default:
      return Stethoscope;
  }
};

const getSpecialtyColor = (specialty: string) => {
  switch (specialty.toLowerCase()) {
    case 'cardiology':
      return 'medical-red';
    case 'pediatrics':
      return 'medical-blue';
    case 'emergency medicine':
      return 'medical-yellow';
    case 'general medicine':
    default:
      return 'medical-green';
  }
};

export default function VoiceAgentCard({ 
  agent, 
  onSelect, 
  onUpdate, 
  onDelete, 
  isSelected = false 
}: VoiceAgentCardProps) {
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  const SpecialtyIcon = getSpecialtyIcon(agent.medical_specialty);
  const specialtyColor = getSpecialtyColor(agent.medical_specialty);

  const handleSelect = () => {
    setIsLoading(true);
    onSelect(agent);
    setTimeout(() => setIsLoading(false), 500);
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowEditDialog(true);
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Enhanced confirmation with Romanian text
    const confirmMessage = `Ești sigur că vrei să ștergi asistentul "${agent.name}"?\n\nAceastă acțiune nu poate fi anulată.`;
    
    if (confirm(confirmMessage)) {
      try {
        setIsLoading(true);
        await onDelete(agent.id);
      } catch (error) {
        console.error('Error deleting agent:', error);
        // Error will be handled by parent component
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleUpdate = (updates: Partial<VoicePersonality>) => {
    onUpdate(agent.id, updates);
    setShowEditDialog(false);
  };

  return (
    <>
      <Card 
        className={`group cursor-pointer transition-all duration-300 hover:shadow-quiz ${
          isSelected 
            ? 'ring-2 ring-medical-blue shadow-elegant bg-card/90' 
            : 'hover:shadow-lg'
        }`}
        onClick={handleSelect}
      >
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg bg-${specialtyColor}/10`}>
                <SpecialtyIcon className={`h-5 w-5 text-${specialtyColor}`} />
              </div>
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  {agent.name}
                  {isSelected && (
                    <CheckCircle className="h-4 w-4 text-medical-blue" />
                  )}
                </CardTitle>
                <Badge 
                  variant="secondary" 
                  className={`text-xs bg-${specialtyColor}/10 text-${specialtyColor} border-${specialtyColor}/20`}
                >
                  {agent.medical_specialty}
                </Badge>
              </div>
            </div>
            
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button
                size="sm"
                variant="ghost"
                onClick={handleEdit}
                className="h-8 w-8 p-0"
              >
                <Edit className="h-4 w-4" />
              </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleDelete}
              disabled={isLoading}
              className="h-8 w-8 p-0 hover:text-destructive disabled:opacity-50"
              title="Șterge asistentul"
            >
              {isLoading ? (
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </Button>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground line-clamp-3">
            {agent.description || 'Fără descriere disponibilă'}
          </p>
          
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Creat: {format(new Date(agent.created_at), 'dd.MM.yyyy')}
            </div>
            <div className="flex items-center gap-1">
              <Bot className="h-3 w-3" />
              ID: {agent.agent_id.slice(-6)}
            </div>
          </div>
          
          <div className="flex gap-2">
            <Button 
              className={`flex-1 ${isSelected ? 'bg-medical-blue hover:bg-medical-blue/90' : ''}`}
              variant={isSelected ? "default" : "outline"}
              onClick={handleSelect}
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  {isSelected ? 'Selectat' : 'Selectează'}
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <EditAgentDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        agent={agent}
        onUpdate={handleUpdate}
      />
    </>
  );
}