// Romanian UI Components for MedMentor Platform
// Phase 2: MedMentor Alignment - Romanian Localization

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BookOpen, Target, Award, Users, Clock, Star } from "lucide-react";

// Romanian translations for common medical education terms
export const ROMANIAN_TRANSLATIONS = {
  // Medical subjects
  SUBJECTS: {
    biology: 'Biologie',
    chemistry: 'Chimie',
    anatomy: 'Anatomie',
    physiology: 'Fiziologie',
    pathology: 'Patologie',
    pharmacology: 'Farmacologie'
  },

  // High school levels
  GRADE_LEVELS: {
    grade_11: 'Clasa a XI-a',
    grade_12: 'Clasa a XII-a',
    admission_prep: 'Pregătire Admitere UMF'
  },

  // Quiz types
  QUIZ_TYPES: {
    multiple_choice: 'Întrebări cu răspunsuri multiple',
    true_false: 'Adevărat/Fals',
    fill_blank: 'Completează spațiile libere',
    case_study: 'Studiu de caz'
  },

  // UI Elements
  UI: {
    start_quiz: 'Începe Testul',
    next_question: 'Întrebarea următoare',
    previous_question: 'Întrebarea anterioară',
    submit_answer: 'Trimite Răspunsul',
    view_explanation: 'Vezi Explicația',
    ask_ai: 'Întreabă Asistentul AI',
    voice_assistant: 'Asistent Vocal',
    progress: 'Progresul tău',
    achievements: 'Realizări',
    leaderboard: 'Clasament',
    study_materials: 'Materiale de studiu',
    practice_tests: 'Teste de exercițiu',
    exam_simulation: 'Simulare examen'
  },

  // Status messages
  STATUS: {
    loading: 'Se încarcă...',
    success: 'Succes!',
    error: 'Eroare',
    warning: 'Atenție',
    info: 'Informație',
    completed: 'Completat',
    in_progress: 'În progres',
    not_started: 'Neînceput'
  },

  // Achievement levels
  ACHIEVEMENTS: {
    beginner: 'Începător',
    intermediate: 'Intermediar',
    advanced: 'Avansat',
    expert: 'Expert',
    master: 'Maestru'
  }
};

// Romanian Medical Universities for MedMentor context
export const UMF_UNIVERSITIES = [
  {
    id: 'umf_bucuresti',
    name: 'UMF "Carol Davila" București',
    city: 'București',
    founded: 1857,
    specialties: ['Medicină', 'Medicină Dentară', 'Farmacie'],
    admissionInfo: 'Concurs pe bază de test grilă - Biologie și Chimie'
  },
  {
    id: 'umf_cluj',
    name: 'UMF "Iuliu Hațieganu" Cluj-Napoca',
    city: 'Cluj-Napoca',
    founded: 1919,
    specialties: ['Medicină', 'Medicină Dentară', 'Farmacie'],
    admissionInfo: 'Concurs pe bază de test grilă - Biologie și Chimie'
  },
  {
    id: 'umf_iasi',
    name: 'UMF "Grigore T. Popa" Iași',
    city: 'Iași',
    founded: 1879,
    specialties: ['Medicină', 'Medicină Dentară', 'Farmacie'],
    admissionInfo: 'Concurs pe bază de test grilă - Biologie și Chimie'
  },
  {
    id: 'umf_timisoara',
    name: 'UMF "Victor Babeș" Timișoara',
    city: 'Timișoara',
    founded: 1945,
    specialties: ['Medicină', 'Medicină Dentară', 'Farmacie'],
    admissionInfo: 'Concurs pe bază de test grilă - Biologie și Chimie'
  },
  {
    id: 'umf_craiova',
    name: 'UMF Craiova',
    city: 'Craiova',
    founded: 1970,
    specialties: ['Medicină', 'Medicină Dentară', 'Farmacie'],
    admissionInfo: 'Concurs pe bază de test grilă - Biologie și Chimie'
  },
  {
    id: 'umf_targu_mures',
    name: 'UMF Târgu Mureș',
    city: 'Târgu Mureș',
    founded: 1945,
    specialties: ['Medicină', 'Medicină Dentară', 'Farmacie'],
    admissionInfo: 'Concurs pe bază de test grilă - Biologie și Chimie'
  }
];

// MedMentor Welcome Component in Romanian
interface MedMentorWelcomeProps {
  userName?: string;
  currentLevel?: string;
  totalXP?: number;
  streak?: number;
}

export function MedMentorWelcome({ 
  userName = "Elev", 
  currentLevel = "Începător",
  totalXP = 0,
  streak = 0 
}: MedMentorWelcomeProps) {
  return (
    <Card className="bg-gradient-to-r from-medical-blue/10 to-medical-green/10 border-medical-blue/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-medical-blue">
          <BookOpen className="h-6 w-6" />
          Bun venit la MedMentor, {userName}!
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground">
          Platforma ta de pregătire pentru admiterea la UMF. Învață biologie și chimie 
          cu asistența AI și pregătește-te pentru examenul de admitere.
        </p>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="flex items-center justify-center mb-2">
              <Target className="h-5 w-5 text-medical-blue" />
            </div>
            <div className="text-sm font-medium">Nivel</div>
            <Badge variant="secondary">{currentLevel}</Badge>
          </div>
          
          <div className="text-center">
            <div className="flex items-center justify-center mb-2">
              <Star className="h-5 w-5 text-medical-gold" />
            </div>
            <div className="text-sm font-medium">XP Total</div>
            <div className="text-lg font-bold text-medical-gold">{totalXP}</div>
          </div>
          
          <div className="text-center">
            <div className="flex items-center justify-center mb-2">
              <Award className="h-5 w-5 text-medical-green" />
            </div>
            <div className="text-sm font-medium">Streak</div>
            <div className="text-lg font-bold text-medical-green">{streak} zile</div>
          </div>
          
          <div className="text-center">
            <div className="flex items-center justify-center mb-2">
              <Clock className="h-5 w-5 text-medical-purple" />
            </div>
            <div className="text-sm font-medium">Studiu Azi</div>
            <div className="text-lg font-bold text-medical-purple">2h 15m</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Romanian Curriculum Progress Component
interface CurriculumProgressProps {
  subject: 'biology' | 'chemistry';
  gradeLevel: '11' | '12';
  completedTopics: string[];
  totalTopics: number;
}

export function CurriculumProgress({ 
  subject, 
  gradeLevel, 
  completedTopics, 
  totalTopics 
}: CurriculumProgressProps) {
  const subjectName = ROMANIAN_TRANSLATIONS.SUBJECTS[subject];
  const progress = (completedTopics.length / totalTopics) * 100;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>{subjectName} - Clasa a {gradeLevel === '11' ? 'XI' : 'XII'}-a</span>
          <Badge variant="outline">{Math.round(progress)}% completat</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="w-full bg-muted rounded-full h-2">
            <div 
              className="bg-medical-blue h-2 rounded-full transition-all duration-300" 
              style={{ width: `${progress}%` }}
            />
          </div>
          
          <div className="text-sm text-muted-foreground">
            {completedTopics.length} din {totalTopics} capitole completate
          </div>
          
          <Button variant="outline" size="sm" className="w-full">
            Continuă Studiul
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// UMF Information Component
export function UMFInfo() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5 text-medical-blue" />
          Universitățile de Medicină din România
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            6 universități de medicină și farmacie în România oferă programe de studii medicale.
          </p>
          
          <div className="grid gap-2">
            {UMF_UNIVERSITIES.slice(0, 3).map((umf) => (
              <div key={umf.id} className="p-3 border rounded-lg">
                <div className="font-medium text-sm">{umf.name}</div>
                <div className="text-xs text-muted-foreground">{umf.city} • Fondată în {umf.founded}</div>
                <div className="text-xs text-medical-blue mt-1">{umf.admissionInfo}</div>
              </div>
            ))}
          </div>
          
          <Button variant="outline" size="sm" className="w-full">
            Vezi toate UMF-urile
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// Study Statistics Component
interface StudyStatsProps {
  weeklyHours: number;
  questionsAnswered: number;
  averageScore: number;
  favoriteSubject: string;
}

export function StudyStats({ 
  weeklyHours, 
  questionsAnswered, 
  averageScore, 
  favoriteSubject 
}: StudyStatsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Statistici de Studiu</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center p-3 bg-muted/50 rounded-lg">
            <div className="text-2xl font-bold text-medical-blue">{weeklyHours}h</div>
            <div className="text-xs text-muted-foreground">Ore săptămâna aceasta</div>
          </div>
          
          <div className="text-center p-3 bg-muted/50 rounded-lg">
            <div className="text-2xl font-bold text-medical-green">{questionsAnswered}</div>
            <div className="text-xs text-muted-foreground">Întrebări rezolvate</div>
          </div>
          
          <div className="text-center p-3 bg-muted/50 rounded-lg">
            <div className="text-2xl font-bold text-medical-gold">{averageScore}%</div>
            <div className="text-xs text-muted-foreground">Scor mediu</div>
          </div>
          
          <div className="text-center p-3 bg-muted/50 rounded-lg">
            <div className="text-lg font-bold text-medical-purple">{favoriteSubject}</div>
            <div className="text-xs text-muted-foreground">Materia preferată</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Romanian Language Helper Functions
export class RomanianLocalization {
  static formatDate(date: Date): string {
    return date.toLocaleDateString('ro-RO', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  static formatTime(date: Date): string {
    return date.toLocaleTimeString('ro-RO', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  static pluralize(count: number, singular: string, plural: string): string {
    return count === 1 ? singular : plural;
  }

  static getGreeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'Bună dimineața';
    if (hour < 18) return 'Bună ziua';
    return 'Bună seara';
  }

  static getEncouragement(score: number): string {
    if (score >= 90) return 'Excelent! Ești foarte bine pregătit!';
    if (score >= 80) return 'Foarte bine! Continuă să exersezi!';
    if (score >= 70) return 'Bine! Mai ai puțin până la perfecțiune!';
    if (score >= 60) return 'Nu e rău! Continuă să studiezi!';
    return 'Nu te descuraja! Practica face pe magistrul!';
  }
}

export default {
  MedMentorWelcome,
  CurriculumProgress,
  UMFInfo,
  StudyStats,
  RomanianLocalization,
  ROMANIAN_TRANSLATIONS,
  UMF_UNIVERSITIES
};