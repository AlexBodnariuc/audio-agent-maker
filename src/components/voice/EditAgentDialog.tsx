import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Edit, Save } from "lucide-react";
import { ROMANIAN_MEDICAL_SPECIALTIES } from "@/lib/validation";
import type { VoiceAgent } from "@/lib/validation";

interface EditAgentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent: VoiceAgent;
  onAgentUpdated: (updatedAgent: VoiceAgent) => void;
}

const medicalSpecialties = [
  "General Medicine",
  "Cardiology", 
  "Pediatrics",
  "Emergency Medicine",
  "Biology",
  "Chemistry",
  "Anatomy",
  "Physiology",
  "Pathology"
];

export default function EditAgentDialog({ open, onOpenChange, agent, onAgentUpdated }: EditAgentDialogProps) {
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    medical_specialty: ""
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (agent) {
      setFormData({
        name: agent.name,
        description: agent.description || "",
        medical_specialty: agent.medical_specialty || ""
      });
    }
  }, [agent]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    
    try {
      const updatedAgent: VoiceAgent = {
        ...agent,
        name: formData.name,
        description: formData.description || null,
        medical_specialty: formData.medical_specialty || null,
        updated_at: new Date().toISOString()
      };
      
      onAgentUpdated(updatedAgent);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit className="h-5 w-5 text-medical-blue" />
            Editează Asistent Vocal
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Nume Asistent</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-specialty">Specialitate</Label>
              <Select 
                value={formData.medical_specialty} 
                onValueChange={(value) => setFormData(prev => ({ ...prev, medical_specialty: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selectează specialitatea" />
                </SelectTrigger>
                <SelectContent>
                  {ROMANIAN_MEDICAL_SPECIALTIES.map((specialty) => (
                    <SelectItem key={specialty} value={specialty}>
                      {specialty.charAt(0).toUpperCase() + specialty.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-description">Descriere</Label>
              <Textarea
                id="edit-description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                rows={4}
                placeholder="Descriere opțională pentru asistent..."
              />
          </div>

          <div className="flex gap-3 justify-end">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => onOpenChange(false)}
            >
              Anulează
            </Button>
            <Button 
              type="submit" 
              disabled={isSaving}
              className="bg-medical-blue hover:bg-medical-blue/90"
            >
              {isSaving ? (
                <>
                  <div className="h-4 w-4 mr-2 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Salvez...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Salvează Modificările
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}