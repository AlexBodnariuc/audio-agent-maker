import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Copy, Download, CheckCircle, Code2, FileText, Github } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface CodeViewerProps {
  agentCode: string;
  agentName: string;
  isVisible: boolean;
}

export default function CodeViewer({ agentCode, agentName, isVisible }: CodeViewerProps) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(agentCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({
        title: "Code copied!",
        description: "Agent code has been copied to your clipboard.",
      });
    } catch (err) {
      toast({
        title: "Copy failed",
        description: "Please try again or copy manually.",
        variant: "destructive",
      });
    }
  };

  const handleDownload = () => {
    const fileName = `${agentName.toLowerCase().replace(/\s+/g, '_')}_agent.py`;
    const blob = new Blob([agentCode], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast({
      title: "Download started!",
      description: `${fileName} is being downloaded.`,
    });
  };

  const handleExportToGitHub = () => {
    toast({
      title: "GitHub Export",
      description: "Connect Supabase to enable GitHub integration.",
    });
  };

  const requirements = `openai>=1.3.0
python-dotenv>=1.0.0`;

  const readme = `# ${agentName} TTS Agent

## Setup

1. Install dependencies:
\`\`\`bash
pip install -r requirements.txt
\`\`\`

2. Set your OpenAI API key:
\`\`\`bash
export OPENAI_API_KEY="your-api-key-here"
\`\`\`

3. Run the agent:
\`\`\`bash
python agent.py
\`\`\`

## Features

- OpenAI Assistant integration
- Text-to-Speech (TTS) responses
- Interactive conversation

## Cost Optimization

- Uses GPT-4o Mini for cost efficiency
- Estimated cost: ~$0.01-0.05 per conversation

## Next Steps

- Add Streamlit UI for web interface
- Implement speech-to-text for voice input
- Add conversation history storage
`;

  if (!isVisible) {
    return null;
  }

  return (
    <Card className="w-full animate-fade-in">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Code2 className="h-5 w-5 text-primary" />
              Generated Agent Code
            </CardTitle>
            <p className="text-muted-foreground mt-1">
              Ready-to-use Python code for your TTS agent
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="font-mono">
              Python 3.8+
            </Badge>
            <Badge variant="outline">
              OpenAI SDK
            </Badge>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        <Tabs defaultValue="agent" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="agent">agent.py</TabsTrigger>
            <TabsTrigger value="requirements">requirements.txt</TabsTrigger>
            <TabsTrigger value="readme">README.md</TabsTrigger>
          </TabsList>
          
          <TabsContent value="agent" className="mt-4">
            <div className="relative">
              <pre className="bg-muted/50 p-4 rounded-lg overflow-x-auto text-sm border">
                <code className="font-mono text-foreground whitespace-pre">
                  {agentCode}
                </code>
              </pre>
            </div>
          </TabsContent>
          
          <TabsContent value="requirements" className="mt-4">
            <div className="relative">
              <pre className="bg-muted/50 p-4 rounded-lg overflow-x-auto text-sm border">
                <code className="font-mono text-foreground whitespace-pre">
                  {requirements}
                </code>
              </pre>
            </div>
          </TabsContent>
          
          <TabsContent value="readme" className="mt-4">
            <div className="relative">
              <pre className="bg-muted/50 p-4 rounded-lg overflow-x-auto text-sm border">
                <code className="font-mono text-foreground whitespace-pre">
                  {readme}
                </code>
              </pre>
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex flex-col sm:flex-row gap-3 mt-6">
          <Button 
            onClick={handleCopy}
            variant="default"
            className="flex-1"
          >
            {copied ? (
              <>
                <CheckCircle className="h-4 w-4" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                Copy Code
              </>
            )}
          </Button>
          
          <Button 
            onClick={handleDownload}
            variant="secondary"
            className="flex-1"
          >
            <Download className="h-4 w-4" />
            Download Files
          </Button>
          
          <Button 
            onClick={handleExportToGitHub}
            variant="outline"
            className="flex-1"
          >
            <Github className="h-4 w-4" />
            Export to GitHub
          </Button>
        </div>

        <div className="mt-6 p-4 bg-muted/30 rounded-lg border border-border">
          <div className="flex items-start gap-3">
            <FileText className="h-5 w-5 text-primary mt-0.5" />
            <div>
              <h4 className="font-medium text-foreground">Ready to Run</h4>
              <p className="text-sm text-muted-foreground mt-1">
                Your agent code is ready to use! Install dependencies with <code className="bg-muted px-1 rounded font-mono">pip install -r requirements.txt</code> and run with <code className="bg-muted px-1 rounded font-mono">python agent.py</code>
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}