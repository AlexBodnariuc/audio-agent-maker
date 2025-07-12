import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { MapPin, Target, CheckCircle2, BookOpen, TrendingUp } from 'lucide-react';

interface LearningPath {
  id: string;
  specialty_focus: string;
  current_level: string;
  recommended_topics: any;
  completed_topics: any;
  voice_preferences: any;
  learning_style: string;
  created_at: string;
  updated_at: string;
}

interface Props {
  className?: string;
  onPathSelect?: (path: LearningPath) => void;
}

const LearningPathManager: React.FC<Props> = ({ className, onPathSelect }) => {
  const { toast } = useToast();
  const [learningPaths, setLearningPaths] = useState<LearningPath[]>([]);
  const [selectedPath, setSelectedPath] = useState<LearningPath | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  const specialties = [
    'cardiology',
    'neurology',
    'oncology',
    'pediatrics',
    'surgery',
    'emergency',
    'psychiatry',
    'radiology',
    'pathology',
    'general'
  ];

  const levels = ['beginner', 'intermediate', 'advanced'];
  const learningStyles = ['audio', 'visual', 'mixed'];

  useEffect(() => {
    loadLearningPaths();
  }, []);

  const loadLearningPaths = async () => {
    try {
      const { data, error } = await supabase
        .from('learning_paths')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) throw error;

      setLearningPaths(data || []);
      if (data && data.length > 0) {
        setSelectedPath(data[0]);
        onPathSelect?.(data[0]);
      }
    } catch (error) {
      console.error('Error loading learning paths:', error);
      toast({
        title: "Error",
        description: "Failed to load learning paths",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const createLearningPath = async (specialty: string, level: string, style: string) => {
    setIsCreating(true);
    
    try {
      // Generate recommended topics based on specialty and level
      const recommendedTopics = generateRecommendedTopics(specialty, level);

      const { data, error } = await supabase
        .from('learning_paths')
        .insert({
          specialty_focus: specialty,
          current_level: level,
          recommended_topics: recommendedTopics,
          completed_topics: [],
          voice_preferences: {
            pace: 'medium',
            complexity: level,
            repetition: level === 'beginner'
          },
          learning_style: style
        })
        .select()
        .single();

      if (error) throw error;

      setLearningPaths(prev => [data, ...prev]);
      setSelectedPath(data);
      onPathSelect?.(data);

      toast({
        title: "Learning Path Created",
        description: `Created ${specialty} learning path at ${level} level`,
      });

    } catch (error) {
      console.error('Error creating learning path:', error);
      toast({
        title: "Error",
        description: "Failed to create learning path",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const updateProgress = async (pathId: string, completedTopic: string) => {
    try {
      const path = learningPaths.find(p => p.id === pathId);
      if (!path) return;

      const completedTopics = path.completed_topics || [];
      const updatedCompleted = [...completedTopics, completedTopic];

      const { error } = await supabase
        .from('learning_paths')
        .update({
          completed_topics: updatedCompleted,
          updated_at: new Date().toISOString()
        })
        .eq('id', pathId);

      if (error) throw error;

      // Update local state
      setLearningPaths(prev => 
        prev.map(p => 
          p.id === pathId 
            ? { ...p, completed_topics: updatedCompleted }
            : p
        )
      );

      toast({
        title: "Progress Updated",
        description: `Completed: ${completedTopic}`,
      });

    } catch (error) {
      console.error('Error updating progress:', error);
      toast({
        title: "Error",
        description: "Failed to update progress",
        variant: "destructive",
      });
    }
  };

  const generateRecommendedTopics = (specialty: string, level: string): any => {
    const topicMaps: Record<string, Record<string, string[]>> = {
      cardiology: {
        beginner: ['Heart anatomy', 'Basic ECG', 'Common heart conditions', 'Heart sounds'],
        intermediate: ['Advanced ECG interpretation', 'Cardiac medications', 'Heart failure management', 'Interventional procedures'],
        advanced: ['Complex arrhythmias', 'Advanced heart failure', 'Cardiac surgery', 'Research protocols']
      },
      neurology: {
        beginner: ['Brain anatomy', 'Basic neurological exam', 'Common symptoms', 'Seizure basics'],
        intermediate: ['Advanced examination', 'Stroke management', 'Movement disorders', 'Neurodegenerative diseases'],
        advanced: ['Complex cases', 'Advanced imaging', 'Research findings', 'Experimental treatments']
      },
      general: {
        beginner: ['Medical terminology', 'Basic anatomy', 'Vital signs', 'Patient communication'],
        intermediate: ['Diagnostic reasoning', 'Treatment planning', 'Medical ethics', 'Evidence-based medicine'],
        advanced: ['Complex cases', 'Leadership skills', 'Quality improvement', 'Medical education']
      }
    };

    return {
      topics: topicMaps[specialty]?.[level] || topicMaps.general[level],
      estimatedHours: level === 'beginner' ? 20 : level === 'intermediate' ? 30 : 40,
      difficulty: level
    };
  };

  const calculateProgress = (path: LearningPath): number => {
    const recommended = path.recommended_topics?.topics || [];
    const completed = path.completed_topics || [];
    
    if (recommended.length === 0) return 0;
    return Math.round((completed.length / recommended.length) * 100);
  };

  if (isLoading) {
    return (
      <div className={className}>
        <Card>
          <CardContent className="p-6">
            <div className="text-center">Loading learning paths...</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className={className}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Learning Paths
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Create New Path */}
          {learningPaths.length === 0 && (
            <div className="space-y-4">
              <div className="text-center text-muted-foreground">
                <BookOpen className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>Create your first learning path to get started.</p>
              </div>
              
              <CreatePathForm 
                onSubmit={createLearningPath}
                isCreating={isCreating}
                specialties={specialties}
                levels={levels}
                learningStyles={learningStyles}
              />
            </div>
          )}

          {/* Existing Paths */}
          {learningPaths.length > 0 && (
            <div className="space-y-4">
              {/* Path Selector */}
              <div className="flex items-center gap-2">
                <Select 
                  value={selectedPath?.id || ''} 
                  onValueChange={(id) => {
                    const path = learningPaths.find(p => p.id === id);
                    if (path) {
                      setSelectedPath(path);
                      onPathSelect?.(path);
                    }
                  }}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select a learning path" />
                  </SelectTrigger>
                  <SelectContent>
                    {learningPaths.map((path) => (
                      <SelectItem key={path.id} value={path.id}>
                        {path.specialty_focus} - {path.current_level}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    // Toggle showing create form
                  }}
                >
                  Add Path
                </Button>
              </div>

              {/* Selected Path Details */}
              {selectedPath && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="default">
                        {selectedPath.specialty_focus}
                      </Badge>
                      <Badge variant="secondary">
                        {selectedPath.current_level}
                      </Badge>
                      <Badge variant="outline">
                        {selectedPath.learning_style}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {calculateProgress(selectedPath)}% Complete
                    </div>
                  </div>

                  <Progress value={calculateProgress(selectedPath)} />

                  {/* Topics */}
                  <div className="space-y-3">
                    <h4 className="font-medium flex items-center gap-2">
                      <Target className="h-4 w-4" />
                      Learning Topics
                    </h4>
                    
                    <div className="grid gap-2">
                      {(selectedPath.recommended_topics?.topics || []).map((topic: string, index: number) => {
                        const isCompleted = (selectedPath.completed_topics || []).includes(topic);
                        
                        return (
                          <div 
                            key={index}
                            className="flex items-center justify-between p-2 border rounded-lg"
                          >
                            <div className="flex items-center gap-2">
                              {isCompleted ? (
                                <CheckCircle2 className="h-4 w-4 text-green-500" />
                              ) : (
                                <div className="h-4 w-4 border-2 border-muted rounded-full" />
                              )}
                              <span className={isCompleted ? 'line-through text-muted-foreground' : ''}>
                                {topic}
                              </span>
                            </div>
                            
                            {!isCompleted && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => updateProgress(selectedPath.id, topic)}
                              >
                                Mark Complete
                              </Button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Progress Stats */}
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <div className="text-2xl font-bold text-primary">
                        {(selectedPath.completed_topics || []).length}
                      </div>
                      <div className="text-xs text-muted-foreground">Completed</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-blue-500">
                        {(selectedPath.recommended_topics?.topics || []).length}
                      </div>
                      <div className="text-xs text-muted-foreground">Total Topics</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-green-500">
                        {selectedPath.recommended_topics?.estimatedHours || 0}h
                      </div>
                      <div className="text-xs text-muted-foreground">Est. Hours</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const CreatePathForm: React.FC<{
  onSubmit: (specialty: string, level: string, style: string) => void;
  isCreating: boolean;
  specialties: string[];
  levels: string[];
  learningStyles: string[];
}> = ({ onSubmit, isCreating, specialties, levels, learningStyles }) => {
  const [specialty, setSpecialty] = useState('');
  const [level, setLevel] = useState('');
  const [style, setStyle] = useState('');

  const handleSubmit = () => {
    if (specialty && level && style) {
      onSubmit(specialty, level, style);
      setSpecialty('');
      setLevel('');
      setStyle('');
    }
  };

  return (
    <Card className="border-dashed">
      <CardContent className="p-4 space-y-4">
        <div className="grid grid-cols-3 gap-2">
          <Select value={specialty} onValueChange={setSpecialty}>
            <SelectTrigger>
              <SelectValue placeholder="Specialty" />
            </SelectTrigger>
            <SelectContent>
              {specialties.map((s) => (
                <SelectItem key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={level} onValueChange={setLevel}>
            <SelectTrigger>
              <SelectValue placeholder="Level" />
            </SelectTrigger>
            <SelectContent>
              {levels.map((l) => (
                <SelectItem key={l} value={l}>
                  {l.charAt(0).toUpperCase() + l.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={style} onValueChange={setStyle}>
            <SelectTrigger>
              <SelectValue placeholder="Style" />
            </SelectTrigger>
            <SelectContent>
              {learningStyles.map((s) => (
                <SelectItem key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button 
          onClick={handleSubmit}
          disabled={!specialty || !level || !style || isCreating}
          className="w-full"
        >
          {isCreating ? 'Creating...' : 'Create Learning Path'}
        </Button>
      </CardContent>
    </Card>
  );
};

export default LearningPathManager;
