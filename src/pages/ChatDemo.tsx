import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  ArrowLeft, 
  MessageSquare, 
  Bot, 
  Activity, 
  Play,
  Pause,
  RotateCcw,
  Code,
  Book,
  Info
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import LiveChatInterface from '@/components/chat/LiveChatInterface';
import ChatAnalytics from '@/components/chat/ChatAnalytics';

const ChatDemo: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDemoActive, setIsDemoActive] = useState(false);

  // Create a demo conversation on component mount
  useEffect(() => {
    createDemoConversation();
  }, []);

  const createDemoConversation = async () => {
    setIsLoading(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('create-conversation', {
        body: {
          specialtyFocus: 'Biologie și Chimie pentru Admiterea UMF',
          sessionType: 'demo_chat',
          userContext: {
            level: 'high_school',
            subjects: ['biology', 'chemistry'],
            goal: 'medical_admission'
          }
        }
      });

      if (error) throw error;

      if (data?.conversationId) {
        setConversationId(data.conversationId);
        setIsDemoActive(true);
        toast({
          title: "Demo Chat Activat",
          description: "Conversația demo a fost creată cu succes!",
        });
      } else {
        throw new Error("Nu s-a primit ID-ul conversației");
      }
    } catch (error) {
      console.error('Error creating demo conversation:', error);
      toast({
        title: "Eroare",
        description: "Nu s-a putut crea conversația demo. Încercați din nou.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const resetDemo = async () => {
    setIsDemoActive(false);
    setConversationId(null);
    await createDemoConversation();
  };

  return (
    <div className="min-h-screen bg-gradient-hero">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Button
            variant="outline"
            onClick={() => navigate('/')}
            className="border-medical-blue/30 text-medical-blue hover:bg-medical-blue/5"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Înapoi
          </Button>
          
          <div>
            <h1 className="text-3xl font-bold bg-gradient-primary bg-clip-text text-transparent">
              Demo Chat Live MedMentor
            </h1>
            <p className="text-muted-foreground mt-1">
              Testează funcționalitatea de chat streaming cu AI pentru pregătirea admiterii la UMF
            </p>
          </div>
        </div>

        {/* Demo Controls */}
        <Card className="mb-6 border-2 border-medical-blue/20 bg-gradient-quiz backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Play className="h-5 w-5 text-medical-blue" />
              Control Demo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-4">
              <Badge 
                variant={isDemoActive ? "default" : "secondary"} 
                className={isDemoActive ? "bg-medical-green text-white" : ""}
              >
                {isDemoActive ? "Demo Activ" : "Demo Inactiv"}
              </Badge>
              
              {conversationId && (
                <Badge variant="outline" className="font-mono text-xs">
                  ID: {conversationId.slice(0, 8)}...
                </Badge>
              )}
              
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={resetDemo}
                  disabled={isLoading}
                  className="border-medical-yellow/30 text-medical-yellow hover:bg-medical-yellow/5"
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Reset Demo
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Main Demo Area */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Chat Interface */}
          <div className="lg:col-span-3">
            {conversationId ? (
              <LiveChatInterface
                conversationId={conversationId}
                title="Chat Demo - MedMentor AI"
                maxHeight="500px"
                showHeader={true}
                onMessageSent={(message) => {
                  console.log('Message sent:', message);
                }}
                onTypingChange={(isTyping) => {
                  console.log('Typing state:', isTyping);
                }}
              />
            ) : (
              <Card className="h-[500px] flex items-center justify-center">
                <CardContent className="text-center">
                  <Bot className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Se încarcă demo-ul...</h3>
                  <p className="text-muted-foreground">
                    Se creează o conversație demo pentru testare.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar with Analytics and Info */}
          <div className="lg:col-span-1 space-y-6">
            {/* Analytics */}
            {conversationId && (
              <ChatAnalytics
                conversationId={conversationId}
                showRealtime={true}
              />
            )}

            {/* Demo Information */}
            <Card className="bg-card/80 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Info className="h-5 w-5 text-medical-blue" />
                  Despre Demo
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">Funcționalități testate:</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• Streaming AI responses</li>
                    <li>• Realtime message updates</li>
                    <li>• Rate limiting</li>
                    <li>• Error handling</li>
                    <li>• Analytics în timp real</li>
                  </ul>
                </div>

                <div className="space-y-2">
                  <h4 className="font-medium text-sm">Întrebări sugerate:</h4>
                  <div className="space-y-1 text-xs">
                    <div className="p-2 bg-medical-blue/5 rounded border border-medical-blue/20">
                      "Explică-mi ciclul cardiac"
                    </div>
                    <div className="p-2 bg-medical-green/5 rounded border border-medical-green/20">
                      "Care sunt organitele celulei?"
                    </div>
                    <div className="p-2 bg-medical-yellow/5 rounded border border-medical-yellow/20">
                      "Cum se calculează numerele de oxidare?"
                    </div>
                  </div>
                </div>

                <Alert>
                  <AlertDescription className="text-xs">
                    Acest demo utilizează API-ul real OpenAI și poate consuma tokens.
                    Pentru uzul în producție, configurați limitele corespunzătoare.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Technical Details */}
        <div className="mt-8">
          <Tabs defaultValue="features" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="features" className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Funcționalități
              </TabsTrigger>
              <TabsTrigger value="technical" className="flex items-center gap-2">
                <Code className="h-4 w-4" />
                Detalii Tehnice
              </TabsTrigger>
              <TabsTrigger value="integration" className="flex items-center gap-2">
                <Book className="h-4 w-4" />
                Integrare
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="features" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Funcționalități Live Chat</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-medium mb-3">Core Features</h4>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li>✅ Streaming responses în timp real</li>
                      <li>✅ Auto-scroll la mesaje noi</li>
                      <li>✅ Typing indicators</li>
                      <li>✅ Connection status monitoring</li>
                      <li>✅ Message copying</li>
                      <li>✅ Character count & limits</li>
                      <li>✅ Error handling & recovery</li>
                    </ul>
                  </div>
                  
                  <div>
                    <h4 className="font-medium mb-3">Advanced Features</h4>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li>🔧 Real-time analytics</li>
                      <li>🔧 Performance monitoring</li>
                      <li>🔧 Rate limiting</li>
                      <li>🔧 TTS integration</li>
                      <li>🔧 Feedback collection</li>
                      <li>🔧 Voice input (planned)</li>
                      <li>🔧 Multi-language support</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="technical" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Arhitectura Tehnică</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <h4 className="font-medium mb-3">Frontend Stack</h4>
                      <ul className="space-y-1 text-sm text-muted-foreground">
                        <li>• React 18 cu TypeScript</li>
                        <li>• Custom useChatStream hook</li>
                        <li>• Server-Sent Events (SSE)</li>
                        <li>• Shadcn/UI components</li>
                        <li>• Tailwind CSS pentru styling</li>
                      </ul>
                    </div>
                    
                    <div>
                      <h4 className="font-medium mb-3">Backend Stack</h4>
                      <ul className="space-y-1 text-sm text-muted-foreground">
                        <li>• Supabase Edge Functions</li>
                        <li>• OpenAI GPT-4o-mini API</li>
                        <li>• PostgreSQL pentru storage</li>
                        <li>• Real-time subscriptions</li>
                        <li>• Rate limiting & monitoring</li>
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="integration" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Ghid de Integrare</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-medium mb-2">1. Import Components</h4>
                      <div className="bg-muted p-3 rounded text-sm font-mono">
                        {`import { LiveChatInterface } from '@/components/chat';`}
                      </div>
                    </div>
                    
                    <div>
                      <h4 className="font-medium mb-2">2. Utilizare Simplă</h4>
                      <div className="bg-muted p-3 rounded text-sm font-mono">
                        {`<LiveChatInterface
  conversationId="your-conversation-id"
  title="Chat cu MedMentor"
  onMessageSent={(msg) => console.log(msg)}
/>`}
                      </div>
                    </div>
                    
                    <div>
                      <h4 className="font-medium mb-2">3. Customizare Avansată</h4>
                      <div className="bg-muted p-3 rounded text-sm font-mono">
                        {`<LiveChatInterface
  conversationId={id}
  showHeader={false}
  maxHeight="400px"
  className="custom-chat"
  onTypingChange={handleTyping}
/>`}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};

export default ChatDemo;