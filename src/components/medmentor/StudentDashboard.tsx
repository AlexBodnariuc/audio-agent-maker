import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Trophy, 
  Target, 
  BookOpen, 
  Brain, 
  Clock, 
  Star,
  Award,
  TrendingUp,
  Heart,
  Stethoscope,
  Microscope,
  GraduationCap,
  Calendar,
  Flame
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  xp_reward: number;
  earned?: boolean;
  earned_at?: string;
}

interface UserProgress {
  total_xp: number;
  current_level: number;
  current_streak: number;
  longest_streak: number;
  last_activity_date: string;
}

interface SubjectStats {
  biology_completed: number;
  chemistry_completed: number;
  total_sessions: number;
  average_score: number;
}

export default function StudentDashboard() {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [userProgress, setUserProgress] = useState<UserProgress | null>(null);
  const [subjectStats, setSubjectStats] = useState<SubjectStats>({
    biology_completed: 0,
    chemistry_completed: 0,
    total_sessions: 0,
    average_score: 0
  });
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setIsLoading(true);
      
      // Fetch achievements
      const { data: achievementsData, error: achievementsError } = await supabase
        .from('achievements')
        .select('*')
        .order('xp_reward', { ascending: true });

      if (achievementsError) throw achievementsError;

      // Fetch user progress
      const { data: progressData, error: progressError } = await supabase
        .from('user_progress')
        .select('*')
        .limit(1)
        .single();

      if (progressError && progressError.code !== 'PGRST116') {
        console.error('Progress error:', progressError);
      }

      // Mock some subject stats for demonstration
      const mockStats: SubjectStats = {
        biology_completed: Math.floor(Math.random() * 50) + 10,
        chemistry_completed: Math.floor(Math.random() * 40) + 5,
        total_sessions: Math.floor(Math.random() * 20) + 5,
        average_score: Math.floor(Math.random() * 30) + 70
      };

      setAchievements(achievementsData || []);
      setUserProgress(progressData);
      setSubjectStats(mockStats);

    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      toast({
        title: "Eroare",
        description: "Nu am putut încărca datele dashboard-ului",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const calculateLevel = (xp: number): { level: number; progress: number; nextLevelXp: number } => {
    // Each level requires 100 more XP than the previous
    let level = 1;
    let totalXpForLevel = 0;
    let xpForCurrentLevel = 100;

    while (totalXpForLevel + xpForCurrentLevel <= xp) {
      totalXpForLevel += xpForCurrentLevel;
      level++;
      xpForCurrentLevel += 50; // Increment increases each level
    }

    const currentLevelXp = xp - totalXpForLevel;
    const progress = (currentLevelXp / xpForCurrentLevel) * 100;

    return {
      level,
      progress,
      nextLevelXp: xpForCurrentLevel - currentLevelXp
    };
  };

  const getMotivationalMessage = () => {
    const messages = [
      "Fiecare pas te apropie de visul tău de a deveni medic! 🏥",
      "Perseverența ta de astăzi devine succesul de mâine! 💪",
      "Cunoștințele tale în biologie și chimie cresc zilnic! 🧬",
      "Ești pe drumul cel bun spre admiterea la UMF! 🎯",
      "Fiecare întrebare îți dezvoltă gândirea medicală! 🧠",
      "Viitorul tău în medicină începe cu fiecare lecție! ⚕️"
    ];
    return messages[Math.floor(Math.random() * messages.length)];
  };

  const getSubjectIcon = (subject: string) => {
    return subject === "biology" ? <Microscope className="h-4 w-4" /> : <Brain className="h-4 w-4" />;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen p-6 bg-gradient-to-br from-medical-blue/5 to-medical-green/5">
        <div className="max-w-7xl mx-auto space-y-6">
          <Card className="animate-pulse">
            <CardHeader>
              <div className="h-8 bg-muted rounded w-1/3"></div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="h-4 bg-muted rounded w-3/4"></div>
                <div className="h-4 bg-muted rounded w-1/2"></div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const levelInfo = userProgress ? calculateLevel(userProgress.total_xp) : { level: 1, progress: 0, nextLevelXp: 100 };

  return (
    <div className="min-h-screen p-6 bg-gradient-to-br from-medical-blue/5 to-medical-green/5">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header with Motivational Message */}
        <Card className="border-l-4 border-l-medical-blue bg-gradient-to-r from-card to-medical-blue/5">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-medical-blue/10 rounded-full">
                <Heart className="h-6 w-6 text-medical-blue" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-medical-blue mb-1">
                  Bună ziua, viitor medic! 👋
                </h2>
                <p className="text-muted-foreground">{getMotivationalMessage()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Progress Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Level & XP */}
          <Card className="relative overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Star className="h-4 w-4 text-yellow-500" />
                Nivelul Tău
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="text-2xl font-bold text-medical-blue">
                  Nivel {levelInfo.level}
                </div>
                <Progress value={levelInfo.progress} className="h-2" />
                <p className="text-xs text-muted-foreground">
                  {levelInfo.nextLevelXp} XP până la următorul nivel
                </p>
              </div>
            </CardContent>
            <div className="absolute top-0 right-0 p-2">
              <GraduationCap className="h-8 w-8 text-medical-blue/20" />
            </div>
          </Card>

          {/* Current Streak */}
          <Card className="relative overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Flame className="h-4 w-4 text-orange-500" />
                Seria Actuală
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="text-2xl font-bold text-medical-green">
                  {userProgress?.current_streak || 0} zile
                </div>
                <p className="text-xs text-muted-foreground">
                  Record: {userProgress?.longest_streak || 0} zile
                </p>
              </div>
            </CardContent>
            <div className="absolute top-0 right-0 p-2">
              <Calendar className="h-8 w-8 text-medical-green/20" />
            </div>
          </Card>

          {/* Subject Progress */}
          <Card className="relative overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <BookOpen className="h-4 w-4 text-medical-purple" />
                Progres Materii
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs flex items-center gap-1">
                    <Microscope className="h-3 w-3" />
                    Biologie
                  </span>
                  <Badge variant="secondary" className="text-xs">
                    {subjectStats.biology_completed}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs flex items-center gap-1">
                    <Brain className="h-3 w-3" />
                    Chimie
                  </span>
                  <Badge variant="secondary" className="text-xs">
                    {subjectStats.chemistry_completed}
                  </Badge>
                </div>
              </div>
            </CardContent>
            <div className="absolute top-0 right-0 p-2">
              <Stethoscope className="h-8 w-8 text-medical-purple/20" />
            </div>
          </Card>

          {/* Average Score */}
          <Card className="relative overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <TrendingUp className="h-4 w-4 text-medical-blue" />
                Scor Mediu
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="text-2xl font-bold text-medical-blue">
                  {subjectStats.average_score}%
                </div>
                <p className="text-xs text-muted-foreground">
                  din {subjectStats.total_sessions} sesiuni
                </p>
              </div>
            </CardContent>
            <div className="absolute top-0 right-0 p-2">
              <Target className="h-8 w-8 text-medical-blue/20" />
            </div>
          </Card>

        </div>

        {/* Achievements Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-yellow-500" />
              Realizări și Distincții
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Celebrează-ți progresul pe drumul spre medicina
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {achievements.map((achievement) => (
                <div
                  key={achievement.id}
                  className={`p-4 rounded-lg border transition-all duration-200 ${
                    achievement.earned
                      ? 'bg-gradient-to-br from-yellow-50 to-orange-50 border-yellow-200 shadow-sm'
                      : 'bg-muted/30 border-muted hover:border-muted-foreground/30'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`text-2xl ${achievement.earned ? '' : 'grayscale opacity-50'}`}>
                      {achievement.icon}
                    </div>
                    <div className="flex-1 space-y-1">
                      <h4 className={`font-medium ${achievement.earned ? 'text-foreground' : 'text-muted-foreground'}`}>
                        {achievement.name}
                      </h4>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {achievement.description}
                      </p>
                      <div className="flex items-center justify-between">
                        <Badge 
                          variant={achievement.earned ? "default" : "secondary"}
                          className="text-xs"
                        >
                          +{achievement.xp_reward} XP
                        </Badge>
                        {achievement.earned && (
                          <Badge variant="outline" className="text-xs text-green-600">
                            ✓ Obținut
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Continuă Pregătirea</CardTitle>
            <p className="text-sm text-muted-foreground">
              Alege-ți următoarea activitate de învățare
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Button variant="outline" className="h-20 flex-col gap-2 hover:bg-medical-blue/5">
                <Microscope className="h-6 w-6 text-medical-blue" />
                <span>Quiz Biologie</span>
              </Button>
              <Button variant="outline" className="h-20 flex-col gap-2 hover:bg-medical-green/5">
                <Brain className="h-6 w-6 text-medical-green" />
                <span>Quiz Chimie</span>
              </Button>
              <Button variant="outline" className="h-20 flex-col gap-2 hover:bg-medical-purple/5">
                <Stethoscope className="h-6 w-6 text-medical-purple" />
                <span>Asistent Vocal</span>
              </Button>
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}