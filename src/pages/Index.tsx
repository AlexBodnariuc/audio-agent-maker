import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import QuizCard from "@/components/medmentor/QuizCard";
import StudentDashboard from "@/components/medmentor/StudentDashboard";
import EnhancedVoiceQuizAssistant from "@/components/medmentor/EnhancedVoiceQuizAssistant";
import { useAuth } from "@/hooks/useAuth";
import { 
  GraduationCap, 
  BookOpen, 
  Brain, 
  Trophy, 
  Users, 
  Target,
  Mic,
  MessageSquare,
  Zap,
  Star,
  CheckCircle,
  ArrowRight,
  Play,
  Heart,
  Clock,
  Globe,
  Bot,
  LogOut,
  LogIn,
  User
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

// Sample quiz data for Romanian medical school preparation
const sampleBiologyQuiz = [
  {
    id: "bio1",
    question: "Care dintre următoarele organite celulare este responsabilă pentru sinteza proteinelor?",
    options: [
      "Mitocondria",
      "Ribozomul", 
      "Aparatul Golgi",
      "Reticulul endoplasmic neted"
    ],
    correctAnswer: 1,
    explanation: "Ribozomii sunt organitele celulare responsabile pentru sinteza proteinelor prin procesul de translație. Ei citesc informația de pe ARN mesager și asamblează aminoacizii în proteine.",
    subject: "biology" as const,
    difficulty: "beginner" as const
  },
  {
    id: "bio2", 
    question: "În ciclul cardiac, care este ordinea corectă a fazelor?",
    options: [
      "Diastola atrială, sistola atrială, diastola ventriculară, sistola ventriculară",
      "Sistola atrială, diastola atrială, sistola ventriculară, diastola ventriculară", 
      "Diastola generală, sistola atrială, sistola ventriculară",
      "Sistola ventriculară, diastola ventriculară, sistola atrială"
    ],
    correctAnswer: 2,
    explanation: "Ciclul cardiac începe cu diastola generală (relaxarea), urmată de sistola atrială (contracția atriilor) și apoi sistola ventriculară (contracția ventriculilor). Aceasta este succesiunea normală care asigură circulația eficientă a sângelui.",
    subject: "biology" as const,
    difficulty: "intermediate" as const
  }
];

const sampleChemistryQuiz = [
  {
    id: "chem1",
    question: "Care este numărul de oxidare al carbonului în glucoză (C₆H₁₂O₆)?",
    options: [
      "+4",
      "0", 
      "-2",
      "+2"
    ],
    correctAnswer: 1,
    explanation: "În glucoză, numărul de oxidare al carbonului este 0. Aceasta se calculează considerând că hidrogenul are +1, oxigenul -2, și suma tuturor numerelor de oxidare într-o moleculă neutră este 0.",
    subject: "chemistry" as const,
    difficulty: "intermediate" as const
  }
];

// Sample student data
const sampleStudentStats = {
  totalXP: 2450,
  currentLevel: 3,
  currentStreak: 5,
  longestStreak: 12,
  quizzesCompleted: 47,
  averageScore: 78.5,
  subjectProgress: {
    biology: 82,
    chemistry: 75
  }
};

export default function Index() {
  const [currentView, setCurrentView] = useState<"landing" | "dashboard" | "quiz">("landing");
  const [selectedQuizType, setSelectedQuizType] = useState<"biology" | "chemistry" | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user, signOut, loading } = useAuth();

  const handleStartQuiz = (subject: "biology" | "chemistry") => {
    setSelectedQuizType(subject);
    setCurrentView("quiz");
  };

  const handleQuizComplete = (score: number, xpEarned: number) => {
    toast({
      title: "Quiz Finalizat!",
      description: `Ai obținut ${score.toFixed(0)}% și ai câștigat ${xpEarned} XP!`,
    });
    // Could update student stats here
  };

  const handleSignOut = async () => {
    const { error } = await signOut();
    if (error) {
      toast({
        title: "Eroare",
        description: "Nu s-a putut ieși din cont. Încearcă din nou.",
        variant: "destructive"
      });
    } else {
      toast({
        title: "Ieșire reușită",
        description: "Te-ai deconectat cu succes."
      });
    }
  };

  const features = [
    {
      icon: Brain,
      title: "Quiz-uri Inteligente",
      description: "Întrebări adaptive pentru admiterea la UMF, bazate pe curriculum-ul român",
      color: "medical-blue"
    },
    {
      icon: Mic,
      title: "Asistent Vocal AI",
      description: "Întreabă orice în română și primește explicații clare pentru concepte dificile",
      color: "medical-green"
    },
    {
      icon: Target,
      title: "Progres Personalizat",
      description: "Urmărește-ți progresul la biologie și chimie cu analytics detaliate",
      color: "medical-yellow"
    },
    {
      icon: Trophy,
      title: "Gamificare Motivantă",
      description: "Câștigă XP, ține-ți seria zilnică și deblochează realizări",
      color: "medical-purple"
    },
    {
      icon: BookOpen,
      title: "Căutare în Manuale",
      description: "Găsește instant informații din manualele Corint pentru clasa XI-XII",
      color: "medical-red"
    },
    {
      icon: Users,
      title: "Comunitate de Elevi",
      description: "Conectează-te cu alți elevi care se pregătesc pentru admiterea la medicină",
      color: "medical-blue"
    }
  ];

  const stats = [
    { label: "Elevi pregătiți", value: "2,000+", icon: Users },
    { label: "Quiz-uri disponibile", value: "5,000+", icon: Brain },
    { label: "Rata de succes", value: "89%", icon: Target },
    { label: "UMF-uri acoperite", value: "6", icon: GraduationCap }
  ];

  if (currentView === "dashboard") {
    return (
      <div className="min-h-screen bg-gradient-hero p-4">
        <div className="max-w-7xl mx-auto">
          <div className="mb-6">
            <Button 
              variant="outline" 
              onClick={() => setCurrentView("landing")}
              className="mb-4"
            >
              <ArrowRight className="h-4 w-4 mr-2 rotate-180" />
              Înapoi la Pagina Principală
            </Button>
          </div>
          <StudentDashboard />
        </div>
      </div>
    );
  }

  if (currentView === "quiz" && selectedQuizType) {
    const quizData = selectedQuizType === "biology" ? sampleBiologyQuiz : sampleChemistryQuiz;
    const quizTitle = selectedQuizType === "biology" ? "Quiz Biologie - Organite Celulare" : "Quiz Chimie - Numere de Oxidare";
    
    return (
      <div className="min-h-screen bg-gradient-hero p-4">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6">
            <Button 
              variant="outline" 
              onClick={() => setCurrentView("dashboard")}
              className="mb-4"
            >
              <ArrowRight className="h-4 w-4 mr-2 rotate-180" />
              Înapoi la Dashboard
            </Button>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <QuizCard
                title={quizTitle}
                questions={quizData}
                subject={selectedQuizType}
                difficulty="beginner"
                onComplete={handleQuizComplete}
              />
            </div>
            <div className="lg:col-span-1">
              <EnhancedVoiceQuizAssistant 
                question={quizData[0]?.question}
                subject={selectedQuizType}
                quizSessionId="demo-session"
                onTranscriptionReceived={(text) => console.log("Received:", text)}
                onAskForHelp={(question) => console.log("Help with:", question)}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-hero">
      {/* Navigation Header */}
      <div className="border-b border-border/50 bg-card/30 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <GraduationCap className="h-6 w-6 text-medical-blue" />
              <span className="font-bold text-lg">MedMentor</span>
            </div>
            <div className="flex items-center gap-4">
              {user ? (
                <>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <User className="h-4 w-4" />
                    <span>{user.email}</span>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={handleSignOut}
                    disabled={loading}
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    Ieși din cont
                  </Button>
                </>
              ) : (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => navigate("/auth")}
                >
                  <LogIn className="h-4 w-4 mr-2" />
                  Conectează-te
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-medical-blue/10 via-transparent to-medical-green/10" />
        
        <div className="relative container mx-auto px-4 py-16">
          <div className="text-center max-w-4xl mx-auto mb-16">
            <div className="flex justify-center mb-6">
              <Badge variant="secondary" className="px-4 py-2 text-sm font-medium border-medical-blue/30 text-medical-blue">
                <GraduationCap className="h-4 w-4 mr-2" />
                Platforma #1 pentru Admiterea la UMF
              </Badge>
            </div>
            
            <h1 className="text-4xl md:text-6xl font-bold mb-6 bg-gradient-primary bg-clip-text text-transparent">
              MedMentor
            </h1>
            
            <p className="text-xl md:text-2xl text-muted-foreground mb-8 max-w-3xl mx-auto">
              Pregătește-te pentru admiterea la Universitatea de Medicină și Farmacie cu 
              <span className="text-medical-blue font-semibold"> AI personalizat</span>, 
              quiz-uri adaptive și suport vocal în română.
            </p>
            
            <div className="flex flex-wrap justify-center gap-4 mb-12">
              <Badge variant="outline" className="px-3 py-1 border-medical-green/30 text-medical-green">
                <BookOpen className="h-3 w-3 mr-1" />
                Curriculum Român
              </Badge>
              <Badge variant="outline" className="px-3 py-1 border-medical-blue/30 text-medical-blue">
                <Brain className="h-3 w-3 mr-1" />
                AI în Română
              </Badge>
              <Badge variant="outline" className="px-3 py-1 border-medical-yellow/30 text-medical-yellow">
                <Mic className="h-3 w-3 mr-1" />
                Asistent Vocal
              </Badge>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                size="lg" 
                className="bg-medical-blue hover:bg-medical-blue/90 text-white shadow-elegant"
                onClick={() => setCurrentView("dashboard")}
              >
                <Play className="h-5 w-5 mr-2" />
                Începe Gratuit
              </Button>
              <Button 
                variant="outline" 
                size="lg"
                className="border-medical-green/30 text-medical-green hover:bg-medical-green/5"
                onClick={() => setCurrentView("quiz")}
              >
                <Brain className="h-5 w-5 mr-2" />
                Demo Quiz
              </Button>
            </div>
          </div>

          {/* Stats Section */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-16 max-w-4xl mx-auto">
            {stats.map((stat, index) => {
              const Icon = stat.icon;
              return (
                <Card key={index} className="text-center border-2 border-border/50 bg-card/80 backdrop-blur-sm">
                  <CardContent className="p-6">
                    <Icon className="h-8 w-8 text-medical-blue mx-auto mb-3" />
                    <div className="text-2xl font-bold text-foreground mb-1">
                      {stat.value}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {stat.label}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Features Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16 max-w-6xl mx-auto">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <Card key={index} className="bg-card/50 backdrop-blur-sm border-border/50 hover:bg-card/80 transition-all duration-300 group shadow-quiz">
                  <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                      <div className={`p-3 rounded-lg bg-${feature.color}/10 group-hover:bg-${feature.color}/20 transition-colors`}>
                        <Icon className={`h-6 w-6 text-${feature.color}`} />
                      </div>
                      <div>
                        <h3 className="font-semibold mb-2 text-foreground">
                          {feature.title}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {feature.description}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Quick Demo Section */}
          <div className="max-w-4xl mx-auto mb-16">
            <Card className="border-2 border-medical-blue/20 bg-gradient-quiz backdrop-blur-sm">
              <CardHeader className="text-center">
                <CardTitle className="flex items-center justify-center gap-2 text-2xl">
                  <Zap className="h-6 w-6 text-medical-yellow" />
                  Încearcă MedMentor Acum
                </CardTitle>
                <p className="text-muted-foreground">
                  Testează funcționalitățile noastre cu un quiz demo sau explorează dashboard-ul de student
                </p>
              </CardHeader>
              <CardContent className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button 
                  onClick={() => {
                    setSelectedQuizType("biology");
                    setCurrentView("quiz");
                  }}
                  className="bg-medical-green hover:bg-medical-green/90 text-white"
                >
                  <BookOpen className="h-4 w-4 mr-2" />
                  Quiz Demo Biologie
                </Button>
                <Button 
                  onClick={() => {
                    setSelectedQuizType("chemistry");
                    setCurrentView("quiz");
                  }}
                  className="bg-medical-blue hover:bg-medical-blue/90 text-white"
                >
                  <Brain className="h-4 w-4 mr-2" />
                  Quiz Demo Chimie
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => setCurrentView("dashboard")}
                  className="border-medical-yellow/30 text-medical-yellow hover:bg-medical-yellow/5"
                >
                  <Target className="h-4 w-4 mr-2" />
                  Dashboard Student
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => navigate("/voice-assistants")}
                  className="border-medical-purple/30 text-medical-purple hover:bg-medical-purple/5"
                >
                  <Bot className="h-4 w-4 mr-2" />
                  Asistenți Vocali
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => navigate("/chat-demo")}
                  className="border-medical-blue/30 text-medical-blue hover:bg-medical-blue/5"
                >
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Chat Demo
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Footer with Romanian Medical Schools */}
      <div className="border-t border-border/50 bg-muted/30 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center">
            <h3 className="font-semibold text-foreground mb-4 flex items-center justify-center gap-2">
              <Heart className="h-5 w-5 text-medical-red" />
              Pregătit pentru toate UMF-urile din România
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 text-sm text-muted-foreground">
              <div>UMF București</div>
              <div>UMF Cluj-Napoca</div>
              <div>UMF Iași</div>
              <div>UMF Timișoara</div>
              <div>UMF Târgu Mureș</div>
              <div>UMF Craiova</div>
            </div>
            <div className="mt-6 flex items-center justify-center gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4" />
                <span>Disponibil în română</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-medical-green" />
                <span>Verificat de profesori UMF</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                <span>Actualizat pentru 2025</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}