import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Sparkles, Code, FileSearch, Bot } from "lucide-react";

interface AgentFormData {
  name: string;
  instructions: string;
  model: string;
  voice: string;
  description: string;
  tools: string[];
}

interface AgentFormProps {
  onSubmit: (data: AgentFormData) => void;
  isGenerating: boolean;
}

const models = [
  { value: "gpt-4o-mini", label: "GPT-4o Mini (Recommended)" },
  { value: "gpt-4o", label: "GPT-4o" },
  { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
];

const voices = [
  { value: "alloy", label: "Alloy (Neutral)" },
  { value: "echo", label: "Echo (Male)" },
  { value: "fable", label: "Fable (Female)" },
  { value: "onyx", label: "Onyx (Deep Male)" },
  { value: "nova", label: "Nova (Female)" },
  { value: "shimmer", label: "Shimmer (Soft Female)" },
];

const tools = [
  { id: "code_interpreter", label: "Code Interpreter", description: "Execute Python code and math", icon: Code },
  { id: "file_search", label: "File Search", description: "Search uploaded knowledge files", icon: FileSearch },
];

export default function AgentForm({ onSubmit, isGenerating }: AgentFormProps) {
  const [formData, setFormData] = useState<AgentFormData>({
    name: "",
    instructions: "",
    model: "gpt-4o-mini",
    voice: "alloy",
    description: "",
    tools: [],
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const handleToolChange = (toolId: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      tools: checked 
        ? [...prev.tools, toolId]
        : prev.tools.filter(t => t !== toolId)
    }));
  };

  const handleSampleAgent = () => {
    setFormData({
      name: "Python Tutor",
      instructions: "You are a friendly Python programming tutor. Explain concepts clearly with examples.",
      model: "gpt-4o-mini",
      voice: "fable",
      description: "Create a helpful tutor that teaches Python programming and reads explanations aloud in a friendly female voice",
      tools: ["code_interpreter"],
    });
  };

  return (
    <Card className="w-full max-w-2xl mx-auto animate-fade-in">
      <CardHeader className="text-center">
        <CardTitle className="flex items-center justify-center gap-2 text-2xl">
          <Bot className="h-6 w-6 text-primary" />
          Create Your TTS Agent
        </CardTitle>
        <p className="text-muted-foreground">
          Describe your AI agent and we'll generate the complete Python code
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex justify-center">
          <Button 
            variant="hero" 
            size="sm" 
            onClick={handleSampleAgent}
            className="mb-4"
          >
            <Sparkles className="h-4 w-4" />
            Try Sample Agent
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Agent Name</Label>
              <Input
                id="name"
                placeholder="e.g., Python Tutor"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="model">AI Model</Label>
              <Select value={formData.model} onValueChange={(value) => setFormData(prev => ({ ...prev, model: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select model" />
                </SelectTrigger>
                <SelectContent>
                  {models.map((model) => (
                    <SelectItem key={model.value} value={model.value}>
                      {model.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="instructions">Instructions</Label>
            <Textarea
              id="instructions"
              placeholder="e.g., You are a friendly tutor that explains programming concepts clearly"
              value={formData.instructions}
              onChange={(e) => setFormData(prev => ({ ...prev, instructions: e.target.value }))}
              required
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="voice">TTS Voice</Label>
            <Select value={formData.voice} onValueChange={(value) => setFormData(prev => ({ ...prev, voice: value }))}>
              <SelectTrigger>
                <SelectValue placeholder="Select voice" />
              </SelectTrigger>
              <SelectContent>
                {voices.map((voice) => (
                  <SelectItem key={voice.value} value={voice.value}>
                    {voice.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <Label>Tools (Optional)</Label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {tools.map((tool) => {
                const Icon = tool.icon;
                return (
                  <div key={tool.id} className="flex items-start space-x-3 p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors">
                    <Checkbox
                      id={tool.id}
                      checked={formData.tools.includes(tool.id)}
                      onCheckedChange={(checked) => handleToolChange(tool.id, !!checked)}
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-primary" />
                        <Label htmlFor={tool.id} className="font-medium">
                          {tool.label}
                        </Label>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {tool.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Custom Description</Label>
            <Textarea
              id="description"
              placeholder="Describe what you want your agent to do and how it should behave..."
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              rows={4}
            />
          </div>

          <Button 
            type="submit" 
            className="w-full" 
            size="lg"
            disabled={isGenerating || !formData.name || !formData.instructions}
            variant={isGenerating ? "glow" : "default"}
          >
            {isGenerating ? (
              <>
                <Sparkles className="h-4 w-4 animate-spin" />
                Generating Agent Code...
              </>
            ) : (
              <>
                <Bot className="h-4 w-4" />
                Generate TTS Agent
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}