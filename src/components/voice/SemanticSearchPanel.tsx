import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Search, Clock, User, Tag, MessageSquare } from 'lucide-react';

interface SearchResult {
  conversation_id: string;
  message_content: string;
  similarity: number;
  specialty_context: string;
  medical_keywords: string[];
  conversation_title?: string;
  session_type?: string;
  personality_name?: string;
  personality_specialty?: string;
  created_at?: string;
}

interface Props {
  className?: string;
}

const SemanticSearchPanel: React.FC<Props> = ({ className }) => {
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [specialtyFilter, setSpecialtyFilter] = useState<string>('all');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [totalResults, setTotalResults] = useState(0);

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

  const handleSearch = async () => {
    if (!query.trim()) {
      toast({
        title: "Search Query Required",
        description: "Please enter a search query",
        variant: "destructive",
      });
      return;
    }

    setIsSearching(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('semantic-search', {
        body: {
          query: query.trim(),
          specialtyFilter: specialtyFilter === 'all' ? undefined : specialtyFilter,
          matchThreshold: 0.7,
          matchCount: 20
        }
      });

      if (error) throw error;

      setResults(data.results || []);
      setTotalResults(data.totalResults || 0);

      toast({
        title: "Search Complete",
        description: `Found ${data.totalResults || 0} relevant conversations`,
      });

    } catch (error) {
      console.error('Search error:', error);
      toast({
        title: "Search Error",
        description: "Failed to perform semantic search",
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isSearching) {
      handleSearch();
    }
  };

  const formatDate = (dateString?: string): string => {
    if (!dateString) return 'Unknown';
    return new Date(dateString).toLocaleDateString();
  };

  const getSimilarityColor = (similarity: number): string => {
    if (similarity >= 0.9) return 'bg-green-500';
    if (similarity >= 0.8) return 'bg-blue-500';
    if (similarity >= 0.7) return 'bg-yellow-500';
    return 'bg-gray-500';
  };

  const truncateText = (text: string, maxLength: number): string => {
    if (text.length <= maxLength) return text;
    return text.substr(0, maxLength) + '...';
  };

  return (
    <div className={className}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Semantic Search
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search Input */}
          <div className="flex gap-2">
            <Input
              placeholder="Search conversations by meaning, e.g., 'heart problems in elderly patients'"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyPress={handleKeyPress}
              className="flex-1"
            />
            <Button 
              onClick={handleSearch} 
              disabled={isSearching}
              className="px-6"
            >
              {isSearching ? 'Searching...' : 'Search'}
            </Button>
          </div>

          {/* Specialty Filter */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Filter by specialty:</span>
            <Select value={specialtyFilter} onValueChange={setSpecialtyFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="All specialties" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All specialties</SelectItem>
                {specialties.map((specialty) => (
                  <SelectItem key={specialty} value={specialty}>
                    {specialty.charAt(0).toUpperCase() + specialty.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Results Summary */}
          {totalResults > 0 && (
            <div className="text-sm text-muted-foreground">
              Found {totalResults} relevant conversations
            </div>
          )}

          {/* Search Results */}
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {results.map((result, index) => (
              <Card key={`${result.conversation_id}-${index}`} className="border-l-4 border-l-primary/20">
                <CardContent className="p-4">
                  <div className="space-y-3">
                    {/* Header with similarity and metadata */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div 
                          className={`w-3 h-3 rounded-full ${getSimilarityColor(result.similarity)}`}
                          title={`Similarity: ${(result.similarity * 100).toFixed(1)}%`}
                        />
                        <Badge variant="outline" className="text-xs">
                          {result.specialty_context}
                        </Badge>
                        {result.session_type && (
                          <Badge variant="secondary" className="text-xs">
                            {result.session_type}
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDate(result.created_at)}
                      </div>
                    </div>

                    {/* Message Content */}
                    <div className="space-y-2">
                      {result.conversation_title && (
                        <h4 className="font-medium text-sm">
                          {truncateText(result.conversation_title, 60)}
                        </h4>
                      )}
                      <p className="text-sm text-muted-foreground">
                        {truncateText(result.message_content, 150)}
                      </p>
                    </div>

                    {/* Medical Keywords */}
                    {result.medical_keywords && result.medical_keywords.length > 0 && (
                      <div className="flex items-center gap-1">
                        <Tag className="h-3 w-3 text-muted-foreground" />
                        <div className="flex flex-wrap gap-1">
                          {result.medical_keywords.slice(0, 3).map((keyword, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs px-1 py-0">
                              {keyword}
                            </Badge>
                          ))}
                          {result.medical_keywords.length > 3 && (
                            <Badge variant="outline" className="text-xs px-1 py-0">
                              +{result.medical_keywords.length - 3} more
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Voice Personality Info */}
                    {result.personality_name && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <User className="h-3 w-3" />
                        <span>{result.personality_name}</span>
                        {result.personality_specialty && (
                          <span>• {result.personality_specialty}</span>
                        )}
                      </div>
                    )}

                    {/* Similarity Score */}
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        Relevance: {(result.similarity * 100).toFixed(1)}%
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => {
                          // This could navigate to the full conversation
                          toast({
                            title: "Feature Coming Soon",
                            description: "Full conversation view will be available soon",
                          });
                        }}
                      >
                        <MessageSquare className="h-3 w-3 mr-1" />
                        View
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* No Results */}
          {!isSearching && query && results.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <Search className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No conversations found matching your search.</p>
              <p className="text-sm">Try different keywords or adjust the specialty filter.</p>
            </div>
          )}

          {/* Empty State */}
          {!query && results.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <Search className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>Enter a search query to find relevant conversations.</p>
              <p className="text-sm">Search by medical topics, symptoms, or learning concepts.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SemanticSearchPanel;