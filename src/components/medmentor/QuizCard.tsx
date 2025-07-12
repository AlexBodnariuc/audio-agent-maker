import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, XCircle, HelpCircle, Play, Trophy, Clock } from "lucide-react";

interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctAnswer: number;
  explanation?: string;
  subject: "biology" | "chemistry";
  difficulty: "beginner" | "intermediate" | "advanced";
}

interface QuizCardProps {
  title: string;
  questions: QuizQuestion[];
  subject: "biology" | "chemistry";
  difficulty: "beginner" | "intermediate" | "advanced";
  onComplete?: (score: number, xpEarned: number) => void;
}

export default function QuizCard({ title, questions, subject, difficulty, onComplete }: QuizCardProps) {
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [userAnswers, setUserAnswers] = useState<number[]>([]);
  const [isStarted, setIsStarted] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);
  const [score, setScore] = useState(0);

  const currentQ = questions[currentQuestion];
  const progress = ((currentQuestion + 1) / questions.length) * 100;

  const getSubjectColor = (subj: string) => {
    return subj === "biology" ? "medical-green" : "medical-blue";
  };

  const getDifficultyBadge = (diff: string) => {
    const colors = {
      beginner: "bg-medical-green/10 text-medical-green border-medical-green/20",
      intermediate: "bg-medical-yellow/10 text-medical-yellow border-medical-yellow/20",
      advanced: "bg-medical-red/10 text-medical-red border-medical-red/20"
    };
    return colors[diff as keyof typeof colors] || colors.beginner;
  };

  const handleStartQuiz = () => {
    setIsStarted(true);
  };

  const handleAnswerSelect = (answerIndex: number) => {
    setSelectedAnswer(answerIndex);
  };

  const handleNextQuestion = () => {
    if (selectedAnswer === null) return;

    const newAnswers = [...userAnswers, selectedAnswer];
    setUserAnswers(newAnswers);

    if (selectedAnswer === currentQ.correctAnswer) {
      setScore(score + 1);
    }

    if (currentQuestion + 1 < questions.length) {
      setCurrentQuestion(currentQuestion + 1);
      setSelectedAnswer(null);
      setShowExplanation(false);
    } else {
      // Quiz complete
      const finalScore = selectedAnswer === currentQ.correctAnswer ? score + 1 : score;
      const percentage = (finalScore / questions.length) * 100;
      const xpEarned = Math.floor(percentage * 0.1 * questions.length); // XP based on performance
      
      setScore(finalScore);
      setIsComplete(true);
      onComplete?.(percentage, xpEarned);
    }
  };

  const handleShowExplanation = () => {
    setShowExplanation(true);
  };

  const handleRetryQuiz = () => {
    setCurrentQuestion(0);
    setSelectedAnswer(null);
    setUserAnswers([]);
    setIsStarted(false);
    setIsComplete(false);
    setShowExplanation(false);
    setScore(0);
  };

  if (!isStarted) {
    return (
      <Card className="w-full max-w-2xl mx-auto shadow-quiz border-2 hover:shadow-elegant transition-all duration-300">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-4 mb-4">
            <Badge className={getDifficultyBadge(difficulty)}>
              {difficulty === "beginner" ? "Începător" : difficulty === "intermediate" ? "Intermediar" : "Avansat"}
            </Badge>
            <Badge variant="outline" className={`border-${getSubjectColor(subject)}/30 text-${getSubjectColor(subject)}`}>
              {subject === "biology" ? "Biologie" : "Chimie"}
            </Badge>
          </div>
          <CardTitle className="text-2xl font-bold text-foreground">{title}</CardTitle>
          <div className="flex items-center justify-center gap-6 mt-4 text-muted-foreground">
            <div className="flex items-center gap-2">
              <HelpCircle className="h-4 w-4" />
              <span>{questions.length} întrebări</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              <span>~{Math.ceil(questions.length * 1.5)} min</span>
            </div>
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4" />
              <span>Până la {questions.length * 10} XP</span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="text-center">
          <Button 
            onClick={handleStartQuiz}
            size="lg" 
            className={`bg-${getSubjectColor(subject)} hover:bg-${getSubjectColor(subject)}/90 text-white shadow-lg`}
          >
            <Play className="h-5 w-5 mr-2" />
            Începe Quiz-ul
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (isComplete) {
    const percentage = (score / questions.length) * 100;
    const xpEarned = Math.floor(percentage * 0.1 * questions.length);
    
    return (
      <Card className="w-full max-w-2xl mx-auto shadow-quiz border-2">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Quiz Finalizat!</CardTitle>
          <div className="mt-4">
            <div className="text-4xl font-bold text-primary mb-2">
              {score}/{questions.length}
            </div>
            <div className="text-lg text-muted-foreground">
              {percentage.toFixed(0)}% corect
            </div>
            <div className="flex items-center justify-center gap-2 mt-2">
              <Trophy className="h-5 w-5 text-medical-yellow" />
              <span className="font-semibold text-medical-yellow">+{xpEarned} XP câștigat</span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <div className="text-muted-foreground">
            {percentage >= 80 ? "Excelent! Continui să înveți fantastic!" :
             percentage >= 60 ? "Bună treabă! Mai exersează puțin." :
             "Continuă să înveți! Reîncearcă când te simți pregătit."}
          </div>
          <div className="flex gap-4 justify-center">
            <Button onClick={handleRetryQuiz} variant="outline">
              Încearcă Din Nou
            </Button>
            <Button onClick={() => window.location.reload()}>
              Quiz Nou
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-2xl mx-auto shadow-quiz border-2">
      <CardHeader>
        <div className="flex items-center justify-between mb-4">
          <Badge className={getDifficultyBadge(difficulty)}>
            {subject === "biology" ? "Biologie" : "Chimie"}
          </Badge>
          <div className="text-sm text-muted-foreground">
            Întrebarea {currentQuestion + 1} din {questions.length}
          </div>
        </div>
        <Progress value={progress} className="mb-4" />
        <CardTitle className="text-lg font-semibold leading-relaxed">
          {currentQ.question}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          {currentQ.options.map((option, index) => (
            <button
              key={index}
              onClick={() => handleAnswerSelect(index)}
              className={`w-full p-4 text-left rounded-lg border-2 transition-all duration-200 ${
                selectedAnswer === index
                  ? `border-${getSubjectColor(subject)} bg-${getSubjectColor(subject)}/5`
                  : "border-border hover:border-muted-foreground/30"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-sm font-semibold ${
                  selectedAnswer === index
                    ? `border-${getSubjectColor(subject)} bg-${getSubjectColor(subject)} text-white`
                    : "border-muted-foreground/30"
                }`}>
                  {String.fromCharCode(65 + index)}
                </div>
                <span className="flex-1">{option}</span>
              </div>
            </button>
          ))}
        </div>

        {showExplanation && currentQ.explanation && (
          <div className="mt-6 p-4 bg-muted/50 rounded-lg border">
            <div className="flex items-start gap-3">
              {selectedAnswer === currentQ.correctAnswer ? (
                <CheckCircle className="h-5 w-5 text-medical-green mt-0.5" />
              ) : (
                <XCircle className="h-5 w-5 text-medical-red mt-0.5" />
              )}
              <div>
                <div className="font-semibold mb-2">
                  {selectedAnswer === currentQ.correctAnswer ? "Corect!" : "Incorect"}
                </div>
                <div className="text-sm text-muted-foreground">
                  {currentQ.explanation}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-3 pt-4">
          {selectedAnswer !== null && !showExplanation && currentQ.explanation && (
            <Button
              onClick={handleShowExplanation}
              variant="outline"
              className="flex-1"
            >
              <HelpCircle className="h-4 w-4 mr-2" />
              De ce?
            </Button>
          )}
          <Button
            onClick={handleNextQuestion}
            disabled={selectedAnswer === null}
            className={`flex-1 bg-${getSubjectColor(subject)} hover:bg-${getSubjectColor(subject)}/90`}
          >
            {currentQuestion + 1 === questions.length ? "Finalizează" : "Următoarea"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}