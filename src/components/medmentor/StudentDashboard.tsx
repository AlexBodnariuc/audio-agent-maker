import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { 
  Trophy, 
  Target, 
  Calendar, 
  BookOpen, 
  Brain, 
  Zap,
  TrendingUp,
  Clock,
  Award,
  ChevronRight
} from "lucide-react";

interface StudentStats {
  totalXP: number;
  currentLevel: number;
  currentStreak: number;
  longestStreak: number;
  quizzesCompleted: number;
  averageScore: number;
  subjectProgress: {
    biology: number;
    chemistry: number;
  };
}

interface StudentDashboardProps {
  studentName?: string;
  stats: StudentStats;
  onStartQuiz?: (subject: "biology" | "chemistry") => void;
}

export default function StudentDashboard({ 
  studentName = "Elev", 
  stats, 
  onStartQuiz 
}: StudentDashboardProps) {
  const [selectedSubject, setSelectedSubject] = useState<"biology" | "chemistry" | null>(null);

  const getXPForNextLevel = (level: number) => level * 1000;
  const getCurrentLevelXP = () => stats.totalXP % 1000;
  const getNextLevelProgress = () => (getCurrentLevelXP() / getXPForNextLevel(stats.currentLevel + 1)) * 100;

  const getStreakMessage = () => {
    if (stats.currentStreak === 0) return "Începe seria ta de învățare!";
    if (stats.currentStreak < 3) return "Bun început! Continuă!";
    if (stats.currentStreak < 7) return "Excelent! Ești pe drumul cel bun!";
    if (stats.currentStreak < 14) return "Fantastic! Ești foarte dedicat!";
    return "Incredibil! Ești un adevărat campion!";
  };

  const getPerformanceLevel = (score: number) => {
    if (score >= 90) return { text: "Excelent", color: "medical-green" };
    if (score >= 80) return { text: "Foarte bine", color: "medical-blue" };
    if (score >= 70) return { text: "Bine", color: "medical-yellow" };
    return { text: "În dezvoltare", color: "medical-red" };
  };

  const performance = getPerformanceLevel(stats.averageScore);

  const quickActions = [
    {
      title: "Quiz Biologie",
      description: "Practică concepte de biologie pentru admitere",
      icon: BookOpen,
      color: "medical-green",
      action: () => onStartQuiz?.("biology")
    },
    {
      title: "Quiz Chimie", 
      description: "Exersează chimia pentru examenul UMF",
      icon: Brain,
      color: "medical-blue",
      action: () => onStartQuiz?.("chemistry")
    }
  ];

  const achievements = [
    {
      title: "Prima Săptămână",
      description: "7 zile consecutive de învățare",
      earned: stats.currentStreak >= 7,
      icon: Calendar
    },
    {
      title: "Expert Biologie",
      description: "Medie peste 85% la biologie",
      earned: stats.subjectProgress.biology >= 85,
      icon: BookOpen
    },
    {
      title: "Maestru Chimie",
      description: "Medie peste 85% la chimie", 
      earned: stats.subjectProgress.chemistry >= 85,
      icon: Brain
    },
    {
      title: "Centru de Excelență",
      description: "100 de quiz-uri completate",
      earned: stats.quizzesCompleted >= 100,
      icon: Trophy
    }
  ];

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-6">
      {/* Welcome Header */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">
          Bună ziua, {studentName}! 🎓
        </h1>
        <p className="text-muted-foreground">
          Pregătește-te pentru admiterea la UMF cu MedMentor
        </p>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-2 border-primary/20 bg-gradient-primary/5">
          <CardContent className="p-6 text-center">
            <div className="flex items-center justify-center mb-3">
              <Trophy className="h-8 w-8 text-primary" />
            </div>
            <div className="text-2xl font-bold text-foreground mb-1">
              Nivel {stats.currentLevel}
            </div>
            <div className="text-sm text-muted-foreground mb-3">
              {stats.totalXP.toLocaleString()} XP total
            </div>
            <Progress value={getNextLevelProgress()} className="h-2" />
            <div className="text-xs text-muted-foreground mt-2">
              {getCurrentLevelXP()}/{getXPForNextLevel(stats.currentLevel + 1)} XP până la următorul nivel
            </div>
          </CardContent>
        </Card>

        <Card className="border-2 border-medical-green/20 bg-gradient-success/5">
          <CardContent className="p-6 text-center">
            <div className="flex items-center justify-center mb-3">
              <Zap className="h-8 w-8 text-medical-green" />
            </div>
            <div className="text-2xl font-bold text-foreground mb-1">
              {stats.currentStreak} zile
            </div>
            <div className="text-sm text-muted-foreground mb-2">
              Seria curentă
            </div>
            <Badge variant="outline" className="text-xs border-medical-green/30 text-medical-green">
              Record: {stats.longestStreak} zile
            </Badge>
          </CardContent>
        </Card>

        <Card className="border-2 border-medical-blue/20 bg-medical-blue/5">
          <CardContent className="p-6 text-center">
            <div className="flex items-center justify-center mb-3">
              <Target className="h-8 w-8 text-medical-blue" />
            </div>
            <div className="text-2xl font-bold text-foreground mb-1">
              {stats.averageScore.toFixed(0)}%
            </div>
            <div className="text-sm text-muted-foreground mb-2">
              Medie generală
            </div>
            <Badge className={`bg-${performance.color}/10 text-${performance.color} border-${performance.color}/20`}>
              {performance.text}
            </Badge>
          </CardContent>
        </Card>

        <Card className="border-2 border-medical-yellow/20 bg-medical-yellow/5">
          <CardContent className="p-6 text-center">
            <div className="flex items-center justify-center mb-3">
              <TrendingUp className="h-8 w-8 text-medical-yellow" />
            </div>
            <div className="text-2xl font-bold text-foreground mb-1">
              {stats.quizzesCompleted}
            </div>
            <div className="text-sm text-muted-foreground mb-2">
              Quiz-uri completate
            </div>
            <div className="text-xs text-muted-foreground">
              Ești pe drumul cel bun!
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Subject Progress */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-2 border-medical-green/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-medical-green">
              <BookOpen className="h-5 w-5" />
              Progres Biologie
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Înțelegere concepte</span>
                <span className="font-semibold">{stats.subjectProgress.biology}%</span>
              </div>
              <Progress value={stats.subjectProgress.biology} className="h-3" />
              <div className="text-xs text-muted-foreground">
                {stats.subjectProgress.biology >= 80 ? 
                  "Excelent! Continui să stăpânești biologia!" :
                  "Continuă să exersezi pentru a-ți îmbunătăți scorul!"}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-2 border-medical-blue/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-medical-blue">
              <Brain className="h-5 w-5" />
              Progres Chimie
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Înțelegere concepte</span>
                <span className="font-semibold">{stats.subjectProgress.chemistry}%</span>
              </div>
              <Progress value={stats.subjectProgress.chemistry} className="h-3" />
              <div className="text-xs text-muted-foreground">
                {stats.subjectProgress.chemistry >= 80 ? 
                  "Fantastic! Chimia nu mai are secrete pentru tine!" :
                  "Exersează mai mult pentru a-ți crește încrederea!"}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Începe să înveți acum
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {quickActions.map((action, index) => {
              const Icon = action.icon;
              return (
                <button
                  key={index}
                  onClick={action.action}
                  className="p-4 border-2 border-border rounded-lg hover:border-primary/30 transition-all duration-200 text-left group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg bg-${action.color}/10`}>
                        <Icon className={`h-6 w-6 text-${action.color}`} />
                      </div>
                      <div>
                        <div className="font-semibold text-foreground group-hover:text-primary transition-colors">
                          {action.title}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {action.description}
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Achievements */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Award className="h-5 w-5" />
            Realizări
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {achievements.map((achievement, index) => {
              const Icon = achievement.icon;
              return (
                <div
                  key={index}
                  className={`p-4 border-2 rounded-lg text-center transition-all duration-200 ${
                    achievement.earned
                      ? "border-medical-green/30 bg-medical-green/5"
                      : "border-border bg-muted/30"
                  }`}
                >
                  <div className={`p-3 rounded-full mx-auto mb-3 w-fit ${
                    achievement.earned ? "bg-medical-green/20" : "bg-muted"
                  }`}>
                    <Icon className={`h-6 w-6 ${
                      achievement.earned ? "text-medical-green" : "text-muted-foreground"
                    }`} />
                  </div>
                  <div className={`font-semibold mb-2 ${
                    achievement.earned ? "text-foreground" : "text-muted-foreground"
                  }`}>
                    {achievement.title}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {achievement.description}
                  </div>
                  {achievement.earned && (
                    <Badge className="mt-2 bg-medical-green/10 text-medical-green border-medical-green/20">
                      Câștigat!
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Motivation Message */}
      <Card className="bg-gradient-primary/5 border-2 border-primary/20">
        <CardContent className="p-6 text-center">
          <div className="text-lg font-semibold text-foreground mb-2">
            {getStreakMessage()}
          </div>
          <p className="text-muted-foreground">
            Fiecare zi de pregătire te apropie cu un pas de visul tău de a deveni medic. 
            Continuă să înveți constant și vei reuși!
          </p>
        </CardContent>
      </Card>
    </div>
  );
}