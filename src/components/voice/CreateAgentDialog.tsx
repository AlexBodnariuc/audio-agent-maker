import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Bot, Sparkles } from "lucide-react";
import { ROMANIAN_MEDICAL_SPECIALTIES } from "@/lib/validation";
import type { VoiceAgent } from "@/lib/validation";

interface CreateAgentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAgentCreated: (agent: VoiceAgent) => void;
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

const agentTemplates = [
  {
    name: "Profesor de Biologie",
    description: "Asistent specializat în predarea biologiei pentru admiterea la UMF. Explică concepte complexe într-un mod simplu și oferă exemple concrete.",
    specialty: "Biology",
    instructions: "Ești un profesor de biologie pasionat și răbdător, specializat în pregătirea elevilor pentru admiterea la Universitatea de Medicină și Farmacie. Explici conceptele biologice într-un mod clar și accesibil, folosind analogii și exemple din viața reală. Răspunzi întotdeauna în română și te concentrezi pe curriculum-ul de clasa XI-XII."
  },
  {
    name: "Mentor Chimie",
    description: "Specialist în chimie pentru elevii care se pregătesc pentru UMF. Ajută la înțelegerea reacțiilor chimice și structurilor moleculare.",
    specialty: "Chemistry", 
    instructions: "Ești un mentor de chimie experimentat, dedicat să ajuți elevii să înțeleagă chimia pentru admiterea la UMF. Explici reacțiile chimice, structurile moleculare și conceptele fundamentale într-un mod logic și sistematic. Folosești exemple practice și aplici teoriile în contextul medical. Comunici exclusiv în română."
  },
  {
    name: "Ghid General UMF",
    description: "Asistent general pentru toate materiile de admitere la UMF. Oferă sprijin comprehensive pentru biologie și chimie.",
    specialty: "General Medicine",
    instructions: "Ești un ghid comprehensive pentru admiterea la UMF în România. Ajuți elevii cu toate aspectele pregătirii: biologie, chimie, strategie de învățare și motivație. Ești empatic, încurajator și oferă sfaturi practice. Cunoști curriculum-ul român pentru clasele XI-XII și cerințele specifice ale UMF-urilor din România."
  }
];

export default function CreateAgentDialog({ open, onOpenChange, onAgentCreated }: CreateAgentDialogProps) {
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    medical_specialty: "",
    instructions: ""
  });
  const [isCreating, setIsCreating] = useState(false);
  const { toast } = useToast();

  const validateForm = () => {
    const errors: string[] = [];
    
    if (!formData.name.trim()) errors.push("Numele asistentului este obligatoriu");
    if (formData.name.trim().length < 3) errors.push("Numele trebuie să aibă minim 3 caractere");
    if (formData.name.trim().length > 100) errors.push("Numele trebuie să aibă maxim 100 caractere");
    
    if (!formData.description.trim()) errors.push("Descrierea este obligatorie");
    if (formData.description.trim().length < 10) errors.push("Descrierea trebuie să aibă minim 10 caractere");
    if (formData.description.trim().length > 500) errors.push("Descrierea trebuie să aibă maxim 500 caractere");
    
    if (!formData.medical_specialty) errors.push("Specialitatea este obligatorie");
    
    if (formData.instructions && formData.instructions.length > 1000) {
      errors.push("Instrucțiunile trebuie să aibă maxim 1000 caractere");
    }
    
    return errors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Enhanced validation
    const validationErrors = validateForm();
    if (validationErrors.length > 0) {
      toast({
        title: "Date invalide",
        description: validationErrors[0],
        variant: "destructive",
      });
      return;
    }

    setIsCreating(true);
    
    try {
      // Generate a unique agent_id with better entropy
      const timestamp = Date.now();
      const randomStr = Math.random().toString(36).substring(2, 12);
      const agentId = `medmentor_${timestamp}_${randomStr}`;

      // Sanitize input data
      const sanitizedData = {
        name: formData.name.trim(),
        description: formData.description.trim(),
        medical_specialty: formData.medical_specialty,
        agent_id: agentId,
        is_active: true
      };

      const { data, error } = await supabase
        .from('voice_personalities')
        .insert(sanitizedData)
        .select()
        .single();

      if (error) {
        // Handle specific Supabase errors
        if (error.code === '23505') {
          throw new Error('Un asistent cu acest nume există deja');
        }
        throw new Error(`Eroare bază de date: ${error.message}`);
      }

      toast({
        title: "Succes!",
        description: `Asistentul "${data.name}" a fost creat cu succes`,
        variant: "default",
      });

      onAgentCreated(data);
      
      // Reset form
      setFormData({
        name: "",
        description: "",
        medical_specialty: "",
        instructions: ""
      });
      
      // Close dialog
      onOpenChange(false);
      
    } catch (error) {
      console.error('Error creating agent:', error);
      
      const errorMessage = error instanceof Error 
        ? error.message 
        : 'Nu am putut crea asistentul vocal. Te rog încearcă din nou.';
        
      toast({
        title: "Eroare la creare",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleTemplateSelect = (template: typeof agentTemplates[0]) => {
    setFormData({
      name: template.name,
      description: template.description,
      medical_specialty: template.specialty,
      instructions: template.instructions
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-medical-blue" />
            Creează Asistent Vocal Nou
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Template Selection */}
          <div className="space-y-3">
            <Label>Șabloane rapide (opțional)</Label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {agentTemplates.map((template, index) => (
                <Button
                  key={index}
                  type="button"
                  variant="outline"
                  className="h-auto p-3 text-left justify-start"
                  onClick={() => handleTemplateSelect(template)}
                >
                  <div>
                    <div className="font-medium text-sm">{template.name}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {template.specialty}
                    </div>
                  </div>
                </Button>
              ))}
            </div>
          </div>

          {/* Form Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nume Asistent *</Label>
              <Input
                id="name"
                placeholder="ex: Dr. Ana - Specialist Biologie"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                maxLength={100}
                required
                className={formData.name.length > 90 ? 'border-medical-yellow' : ''}
              />
              {formData.name.length > 90 && (
                <p className="text-xs text-medical-yellow">
                  {100 - formData.name.length} caractere rămase
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="specialty">Specialitate *</Label>
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
            <Label htmlFor="description">Descriere *</Label>
            <Textarea
              id="description"
              placeholder="Descrie personalitatea și expertiza asistentului..."
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              maxLength={500}
              required
              rows={3}
              className={formData.description.length > 450 ? 'border-medical-yellow' : ''}
            />
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Minim 10 caractere</span>
              <span className={formData.description.length > 450 ? 'text-medical-yellow' : 'text-muted-foreground'}>
                {formData.description.length}/500
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="instructions">Instrucțiuni Detaliate (opțional)</Label>
            <Textarea
              id="instructions"
              placeholder="Instrucțiuni specifice pentru comportamentul asistentului..."
              value={formData.instructions}
              onChange={(e) => setFormData(prev => ({ ...prev, instructions: e.target.value }))}
              maxLength={1000}
              rows={4}
              className={formData.instructions.length > 900 ? 'border-medical-yellow' : ''}
            />
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">
                Aceste instrucțiuni vor personaliza răspunsurile asistentului
              </span>
              <span className={formData.instructions.length > 900 ? 'text-medical-yellow' : 'text-muted-foreground'}>
                {formData.instructions.length}/1000
              </span>
            </div>
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
              disabled={isCreating}
              className="bg-medical-blue hover:bg-medical-blue/90"
            >
              {isCreating ? (
                <>
                  <Sparkles className="h-4 w-4 mr-2 animate-spin" />
                  Creez...
                </>
              ) : (
                <>
                  <Bot className="h-4 w-4 mr-2" />
                  Creează Asistent
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}