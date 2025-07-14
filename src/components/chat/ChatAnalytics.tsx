import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { 
  BarChart, 
  MessageSquare, 
  Clock, 
  TrendingUp, 
  Users, 
  Zap,
  Activity,
  CheckCircle,
  XCircle,
  RefreshCw
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface ChatAnalyticsProps {
  conversationId?: string;
  showRealtime?: boolean;
  className?: string;
}

interface ConversationMetrics {
  messageCount: number;
  avgResponseTime: number;
  userSatisfaction: number;
  tokensUsed: number;
  errorRate: number;
  activeUsers: number;
  lastActive: string;
}

const ChatAnalytics: React.FC<ChatAnalyticsProps> = ({
  conversationId,
  showRealtime = true,
  className = ""
}) => {
  const [metrics, setMetrics] = useState<ConversationMetrics>({
    messageCount: 0,
    avgResponseTime: 0,
    userSatisfaction: 0,
    tokensUsed: 0,
    errorRate: 0,
    activeUsers: 0,
    lastActive: new Date().toISOString()
  });
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const { toast } = useToast();

  const fetchAnalytics = async () => {
    if (!conversationId) return;
    
    try {
      setIsLoading(true);
      
      // Fetch conversation messages
      const { data: messages, error: messagesError } = await supabase
        .from('conversation_messages')
        .select('id, message_type, created_at, processing_time, metadata')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false });

      if (messagesError) throw messagesError;

      // Calculate metrics
      const totalMessages = messages?.length || 0;
      const userMessages = messages?.filter(m => m.message_type === 'user').length || 0;
      const assistantMessages = messages?.filter(m => m.message_type === 'assistant').length || 0;
      
      const responseTimes = messages
        ?.filter(m => m.processing_time && m.processing_time > 0)
        .map(m => m.processing_time) || [];
      
      const avgResponseTime = responseTimes.length > 0 
        ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length 
        : 0;

      const tokensUsed = messages
        ?.reduce((total, msg) => {
          const tokens = (msg.metadata as any)?.tokens || 0;
          return total + tokens;
        }, 0) || 0;

      setMetrics({
        messageCount: totalMessages,
        avgResponseTime: Math.round(avgResponseTime),
        userSatisfaction: 85, // Mock data - would come from feedback
        tokensUsed,
        errorRate: 2.3, // Mock data - would calculate from error logs
        activeUsers: 1, // Mock data - would come from active sessions
        lastActive: messages?.[0]?.created_at || new Date().toISOString()
      });

      setLastUpdate(new Date());
      
    } catch (error) {
      console.error('Error fetching analytics:', error);
      toast({
        title: "Eroare Analytics",
        description: "Nu s-au putut încărca statisticile conversației.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
    
    if (showRealtime) {
      const interval = setInterval(fetchAnalytics, 30000); // Update every 30s
      return () => clearInterval(interval);
    }
  }, [conversationId, showRealtime]);

  const formatLastUpdate = () => {
    const now = new Date();
    const diff = Math.floor((now.getTime() - lastUpdate.getTime()) / 1000);
    
    if (diff < 60) return `${diff}s în urmă`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m în urmă`;
    return `${Math.floor(diff / 3600)}h în urmă`;
  };

  const getMetricColor = (value: number, thresholds: { good: number; warning: number }) => {
    if (value >= thresholds.good) return 'medical-green';
    if (value >= thresholds.warning) return 'medical-yellow'; 
    return 'medical-red';
  };

  return (
    <Card className={`bg-card/80 backdrop-blur-sm border-2 border-border/50 ${className}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-medical-blue" />
            Analytics Conversație
          </CardTitle>
          
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {formatLastUpdate()}
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchAnalytics}
              disabled={isLoading}
              className="h-8 w-8 p-0"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Key Metrics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="p-3 rounded-lg bg-medical-blue/10 mb-2">
              <MessageSquare className="h-6 w-6 text-medical-blue mx-auto" />
            </div>
            <div className="text-2xl font-bold text-foreground">{metrics.messageCount}</div>
            <div className="text-xs text-muted-foreground">Mesaje Totale</div>
          </div>

          <div className="text-center">
            <div className="p-3 rounded-lg bg-medical-green/10 mb-2">
              <Clock className="h-6 w-6 text-medical-green mx-auto" />
            </div>
            <div className="text-2xl font-bold text-foreground">{metrics.avgResponseTime}ms</div>
            <div className="text-xs text-muted-foreground">Timp Răspuns</div>
          </div>

          <div className="text-center">
            <div className="p-3 rounded-lg bg-medical-yellow/10 mb-2">
              <TrendingUp className="h-6 w-6 text-medical-yellow mx-auto" />
            </div>
            <div className="text-2xl font-bold text-foreground">{metrics.userSatisfaction}%</div>
            <div className="text-xs text-muted-foreground">Satisfacție</div>
          </div>

          <div className="text-center">
            <div className="p-3 rounded-lg bg-medical-purple/10 mb-2">
              <Zap className="h-6 w-6 text-medical-purple mx-auto" />
            </div>
            <div className="text-2xl font-bold text-foreground">{metrics.tokensUsed.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">Tokens Folosiți</div>
          </div>
        </div>

        {/* Performance Metrics */}
        <div className="space-y-3">
          <h4 className="font-medium text-foreground flex items-center gap-2">
            <BarChart className="h-4 w-4" />
            Performance
          </h4>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Timp de răspuns</span>
              <Badge 
                variant="outline" 
                className={`border-${getMetricColor(metrics.avgResponseTime < 1000 ? 100 : metrics.avgResponseTime < 2000 ? 70 : 30, { good: 80, warning: 50 })}/30 text-${getMetricColor(metrics.avgResponseTime < 1000 ? 100 : metrics.avgResponseTime < 2000 ? 70 : 30, { good: 80, warning: 50 })}`}
              >
                {metrics.avgResponseTime < 1000 ? 'Excelent' : metrics.avgResponseTime < 2000 ? 'Bun' : 'Îmbunătățire'}
              </Badge>
            </div>
            <Progress 
              value={Math.min(100, Math.max(0, 100 - (metrics.avgResponseTime / 30)))} 
              className="h-2"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Satisfacția utilizatorilor</span>
              <Badge 
                variant="outline" 
                className={`border-${getMetricColor(metrics.userSatisfaction, { good: 80, warning: 60 })}/30 text-${getMetricColor(metrics.userSatisfaction, { good: 80, warning: 60 })}`}
              >
                {metrics.userSatisfaction >= 80 ? 'Excelent' : metrics.userSatisfaction >= 60 ? 'Bun' : 'Îmbunătățire'}
              </Badge>
            </div>
            <Progress value={metrics.userSatisfaction} className="h-2" />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Rata de eroare</span>
              <Badge 
                variant="outline" 
                className={`border-${getMetricColor(100 - metrics.errorRate, { good: 95, warning: 90 })}/30 text-${getMetricColor(100 - metrics.errorRate, { good: 95, warning: 90 })}`}
              >
                {metrics.errorRate < 5 ? 'Excelent' : metrics.errorRate < 10 ? 'Bun' : 'Îmbunătățire'}
              </Badge>
            </div>
            <Progress value={Math.max(0, 100 - metrics.errorRate)} className="h-2" />
          </div>
        </div>

        {/* Status Indicators */}
        <div className="pt-3 border-t border-border/50">
          <h4 className="font-medium text-foreground mb-3 flex items-center gap-2">
            <Users className="h-4 w-4" />
            Stare Sistem
          </h4>
          
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Serviciu AI</span>
              <div className="flex items-center gap-1">
                <CheckCircle className="h-4 w-4 text-medical-green" />
                <span className="text-medical-green">Activ</span>
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Baza de date</span>
              <div className="flex items-center gap-1">
                <CheckCircle className="h-4 w-4 text-medical-green" />
                <span className="text-medical-green">Activ</span>
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">TTS Service</span>
              <div className="flex items-center gap-1">
                <CheckCircle className="h-4 w-4 text-medical-green" />
                <span className="text-medical-green">Activ</span>
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Rate Limiting</span>
              <div className="flex items-center gap-1">
                <CheckCircle className="h-4 w-4 text-medical-green" />
                <span className="text-medical-green">Activ</span>
              </div>
            </div>
          </div>
        </div>

        {showRealtime && (
          <div className="text-center pt-2 border-t border-border/50">
            <Badge variant="secondary" className="text-xs">
              <Activity className="h-3 w-3 mr-1 animate-pulse" />
              Actualizare automată activă
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ChatAnalytics;