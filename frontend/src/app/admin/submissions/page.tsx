'use client';

import React, { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { ProtectedRoute, useAuth } from '@/contexts/auth-context';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FileSearch, ArrowLeft, Eye, Trash2, AlertTriangle, Download, Video, Mic, Type, Loader2, FileText } from 'lucide-react';
import Link from 'next/link';
import Header from '@/components/header';
import type { Submission } from '@/types';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { extractAudioFromVideo } from '@/lib/audio-extractor';
import apiService from '@/lib/api-service';
import CompetencySelect from '@/components/common/CompetencySelect';

/**
 * Download blob from URL (simplified version without Firebase)
 */
async function downloadFromStorage(storageUrl: string): Promise<Blob> {
  console.log(`🚀 [DEBUG] Starting download for URL: ${storageUrl}`);
  
  try {
    // Validate URL format first
    if (!storageUrl || typeof storageUrl !== 'string' || storageUrl.length < 10) {
      console.error(`❌ [DEBUG] Invalid URL format:`, { storageUrl, type: typeof storageUrl, length: storageUrl?.length });
      throw new Error(`Invalid URL format: ${storageUrl}`);
    }
    
    // Simple direct fetch for data URIs and regular URLs
    if (storageUrl.startsWith('data:')) {
      console.log(`📊 [DEBUG] Processing data URI (${storageUrl.length} characters)`);
      const response = await fetch(storageUrl);
      const blob = await response.blob();
      console.log(`✅ [DEBUG] Data URI conversion successful (${blob.size} bytes)`);
      return blob;
    }
    
    // For other URLs, attempt direct fetch
    console.log(`🔗 [DEBUG] Attempting direct fetch`);
    const response = await fetch(storageUrl, {
      method: 'GET',
      headers: {
        'Accept': '*/*',
      },
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const blob = await response.blob();
    console.log(`✅ [DEBUG] Download successful (${blob.size} bytes)`);
    return blob;
    
  } catch (error) {
    console.error(`❌ [DEBUG] Download failed:`, error);
    throw error;
  }
}

/**
 * Simplified download helper without Firebase Storage dependencies
 */
async function downloadVideoBlob(storageUrl: string): Promise<Blob> {
  try {
    console.log(`📥 Starting video download: ${storageUrl.substring(0, 100)}...`);
    
    // Handle data URIs directly
    if (storageUrl.startsWith('data:')) {
      return await downloadFromStorage(storageUrl);
    }
    
    // For other URLs, use direct fetch
    return await downloadFromStorage(storageUrl);
    
  } catch (error) {
    console.error('❌ Video download error:', error);
    throw new Error(`Failed to download video: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Simplified submission management without Firebase
export default function AdminSubmissionsPage() {
  const pathname = usePathname();
  const basePath = pathname?.startsWith('/superadmin') ? '/superadmin' : '/admin';
  const { user, loading, getSubmissions, deleteSubmission } = useAuth();
  const { toast } = useToast();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [filteredSubmissions, setFilteredSubmissions] = useState<Submission[]>([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [downloading, setDownloading] = useState<Record<string, boolean>>({});
  const [downloadFormats, setDownloadFormats] = useState<{ text: boolean; video: boolean; audio: boolean }>({
    text: true,
    video: true,
    audio: false
  });
  const [extractingAudio, setExtractingAudio] = useState<Record<string, boolean>>({});
  const [competencyFilter, setCompetencyFilter] = useState<string[]>([]);
  const [prefilterCandidateId, setPrefilterCandidateId] = useState<string | null>(null);

  // Load submissions from FastAPI
  useEffect(() => {
    const loadSubmissions = async () => {
      try {
        setLoadingSubmissions(true);
        const list = await getSubmissions();
        setSubmissions(list as Submission[]);
        setFilteredSubmissions(list as Submission[]);
        
      } catch (error) {
        console.error('Error loading submissions:', error);
        toast({
          title: "Error",
          description: "Failed to load submissions. Please try again.",
          variant: "destructive",
        });
      } finally {
        setLoadingSubmissions(false);
      }
    };

    if (user) {
      loadSubmissions();
    }
  }, [user, toast]);

  // Read candidate filter from query string on first mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const cid = params.get('candidateId') || params.get('user_id') || params.get('candidate_id');
    if (cid) setPrefilterCandidateId(cid);
  }, []);

  // When a specific candidateId is supplied, fetch directly from backend filtered by user_id
  useEffect(() => {
    const fetchByCandidate = async () => {
      if (!prefilterCandidateId || !user) {
        console.log('[Submissions] Skipping candidate fetch:', { prefilterCandidateId, hasUser: !!user });
        return;
      }
      try {
        setLoadingSubmissions(true);
        console.log('[Submissions] Fetching for candidateId:', prefilterCandidateId);
        const res = await apiService.getSubmissions({ user_id: prefilterCandidateId, candidate_id: prefilterCandidateId as any, limit: 1000 } as any);
        const raw = res.data || [];
        console.log('[Submissions] Raw API response:', { count: raw.length, data: raw });
        const mapped: Submission[] = raw.map((s: any) => {
          const created = s.created_at || s.createdAt || s.date || null;
          const report = s.analysis_result ?? s.report ?? null;
          let status: string = (s.status || '').toString().toLowerCase();
          if (report && status !== 'completed') status = 'completed';
          const mappedSubmission = {
            id: s.id,
            candidateName: s.candidate_name || s.candidateName,
            testType: s.test_type || s.testType,
            date: created,
            createdAt: created,
            report,
            history: s.conversation_history || s.history || [],
            status,
            candidateId: s.candidate_id || s.candidateId || s.user_id,
            candidateLanguage: s.candidate_language || s.candidateLanguage,
            uiLanguage: s.ui_language || s.uiLanguage,
            competencies: s.competencies || [],
          } as Submission;
          console.log('[Submissions] Mapped submission:', {
            id: mappedSubmission.id,
            candidateId: mappedSubmission.candidateId,
            rawFields: { candidate_id: s.candidate_id, candidateId: s.candidateId, user_id: s.user_id }
          });
          return mappedSubmission;
        });
        console.log('[Submissions] Final mapped submissions:', mapped.map(m => ({ id: m.id, candidateId: m.candidateId })));
        setSubmissions(mapped);
        // Apply current search/competency UI filters immediately
        setFilteredSubmissions(mapped);
      } catch (error) {
        console.error('Error fetching candidate submissions:', error);
        toast({ title: 'Error', description: 'Failed to load candidate submissions.', variant: 'destructive' });
      } finally {
        setLoadingSubmissions(false);
      }
    };
    fetchByCandidate();
  }, [prefilterCandidateId, user, toast]);

  // Filter submissions based on search and competency selection
  useEffect(() => {
    const search = searchTerm.trim().toLowerCase();
    const hasSearch = search.length > 0;
    const hasComp = competencyFilter.length > 0;
    
    console.log('[Submissions Filter] Starting filter:', { 
      hasSearch, 
      hasComp, 
      prefilterCandidateId,
      submissionsCount: submissions.length 
    });
    
    const next = submissions.filter((submission) => {
      // Search filter
      const matchesSearch = !hasSearch ||
        submission.id.toLowerCase().includes(search) ||
        (submission.candidateName || '').toLowerCase().includes(search) ||
        (submission.competencies || []).some((comp) => comp.toLowerCase().includes(search));

      if (!matchesSearch) {
        console.log('[Submissions Filter] Filtered out by search:', submission.id);
        return false;
      }

      // NOTE: We do NOT apply candidateId filter here because if prefilterCandidateId exists,
      // the submissions were ALREADY filtered by the backend API call with user_id parameter.
      // Double-filtering would incorrectly exclude valid submissions.

      if (!hasComp) return true;
      const comps = (submission.competencies || []).map((c) => c.toLowerCase());
      return competencyFilter.every((code) => comps.includes(code.toLowerCase()));
    });

    setFilteredSubmissions(next);
  }, [searchTerm, competencyFilter.join('|'), submissions, prefilterCandidateId]);

  // Delete submission
  const handleDelete = async (submissionId: string) => {
    try {
      await deleteSubmission(submissionId);

      // Remove from local state
      setSubmissions(prev => prev.filter(sub => sub.id !== submissionId));
      setFilteredSubmissions(prev => prev.filter(sub => sub.id !== submissionId));

      toast({
        title: "Success",
        description: "Submission deleted successfully",
        variant: "default",
      });

    } catch (error) {
      console.error('Delete error:', error);
      toast({
        title: "Error", 
        description: `Failed to delete submission: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive",
      });
    }
  };

  // Download submission with multiple format support
  const handleDownload = async (submission: Submission) => {
    const submissionId = submission.id;
    
    if (!downloadFormats.text && !downloadFormats.video && !downloadFormats.audio) {
      toast({
        title: "No Format Selected",
        description: "Please select at least one download format (Text, Video, or Audio).",
        variant: "destructive",
      });
      return;
    }

    try {
      setDownloading(prev => ({ ...prev, [submissionId]: true }));
      
      console.log(`📥 Starting multi-format download for submission: ${submissionId}`);
      const downloads: { name: string; blob: Blob; extension: string }[] = [];

      // 1. Download text report if selected
      if (downloadFormats.text) {
        try {
          const textContent = JSON.stringify({
            submissionId: submission.id,
            candidateName: submission.candidateName,
            testType: submission.testType,
            createdAt: submission.createdAt,
            report: submission.report,
            history: submission.history?.map(entry => ({
              question: entry.question,
              answer: entry.answer,
              // Don't include media data URIs in text export for size
            })),
            competencies: submission.competencies
          }, null, 2);
          
          const textBlob = new Blob([textContent], { type: 'application/json' });
          downloads.push({
            name: `submission_${submissionId}_report`,
            blob: textBlob,
            extension: '.json'
          });
          console.log(`✅ Text report prepared (${textBlob.size} bytes)`);
        } catch (textError) {
          console.warn('Failed to prepare text report:', textError);
        }
      }

      // 2. Download video/audio media if selected
      if (downloadFormats.video || downloadFormats.audio) {
        try {
          let videoBlob: Blob | null = null;
          let sourceHint = '';

          // Try backend media list
          try {
            const mediaRes = await apiService.listSubmissionMedia(submissionId);
            const files = mediaRes.data || [];
            const videoFile = [...files].reverse().find((f: any) => (f.file_type || '').toLowerCase().includes('video'))
              || [...files].reverse().find((f: any) => (f.file_type || '').toLowerCase().includes('webm'))
              || null;
            const audioFile = [...files].reverse().find((f: any) => (f.file_type || '').toLowerCase().includes('audio')) || null;
            
            const chosen = videoFile || audioFile;
            if (chosen) {
              const url = chosen.storage_url || chosen.file_path || chosen.url;
              if (url) {
                sourceHint = 'storage';
                videoBlob = await downloadFromStorage(url);
              }
            }
          } catch (e) {
            console.warn('Media list fetch failed, falling back to history:', e);
          }

          // Fallback to history
          if (!videoBlob) {
            if (!submission.history || submission.history.length === 0) {
              throw new Error('No media found for this submission');
            }
            const latestEntry = submission.history[submission.history.length - 1];
            if (!latestEntry.videoDataUri) {
              throw new Error('No media URL or data URI in submission history');
            }
            const videoDataUri = latestEntry.videoDataUri;
            console.log(`📥 Using history ${videoDataUri.startsWith('data:') ? 'data URI' : 'URL'}`);
            sourceHint = videoDataUri.startsWith('data:') ? 'data-uri' : 'url';
            if (videoDataUri.startsWith('data:')) {
              const response = await fetch(videoDataUri);
              videoBlob = await response.blob();
            } else {
              videoBlob = await downloadFromStorage(videoDataUri);
            }
          }
          
          if (!videoBlob) {
            throw new Error('Unable to obtain media blob');
          }
          console.log(`✅ Media blob obtained from ${sourceHint}: ${videoBlob.size} bytes, type: ${videoBlob.type}`);

          // Add video if selected
          if (downloadFormats.video) {
            downloads.push({
              name: `submission_${submissionId}_video`,
              blob: videoBlob,
              extension: '.webm'
            });
          }

          // Add audio if selected
          if (downloadFormats.audio) {
            try {
              setExtractingAudio(prev => ({ ...prev, [submissionId]: true }));
              console.log(`🎵 Extracting audio from video blob (${videoBlob.size} bytes)`);
              
              const audioBlob = await extractAudioFromVideo(videoBlob);
              downloads.push({
                name: `submission_${submissionId}_audio`,
                blob: audioBlob,
                extension: '.wav'
              });
              
              console.log(`✅ Audio extraction completed: ${audioBlob.size} bytes`);
            } catch (audioError) {
              console.error('❌ Audio extraction failed:', audioError);
              throw new Error(`Failed to extract audio: ${audioError instanceof Error ? audioError.message : 'Unknown error'}`);
            } finally {
              setExtractingAudio(prev => ({ ...prev, [submissionId]: false }));
            }
          }
        } catch (mediaError) {
          console.warn('Failed to download media:', mediaError);
          // Don't fail completely if media fails but text succeeded
          if (!downloadFormats.text) {
            throw mediaError;
          }
        }
      }

      // 3. Create downloads
      if (downloads.length === 0) {
        throw new Error('No content could be prepared for download');
      }

      // If single download, download directly
      if (downloads.length === 1) {
        const download = downloads[0];
        const url = URL.createObjectURL(download.blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = download.name + download.extension;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        console.log(`✅ Single download completed: ${download.name}${download.extension}`);
      } else {
        // Multiple downloads - create a ZIP file
        const JSZip = (await import('jszip')).default;
        const zip = new JSZip();
        
        for (const download of downloads) {
          zip.file(download.name + download.extension, download.blob);
        }
        
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(zipBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `submission_${submissionId}_bundle.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        console.log(`✅ Multi-format ZIP download completed: ${downloads.map(d => d.name + d.extension).join(', ')}`);
      }

      const formatsList = [];
      if (downloadFormats.text) formatsList.push('Text Report');
      if (downloadFormats.video) formatsList.push('Video');
      if (downloadFormats.audio) formatsList.push('Audio');

      toast({
        title: "Success",
        description: `${formatsList.join(' + ')} downloaded successfully`,
        variant: "default",
      });

    } catch (error) {
      console.error('❌ Download error:', error);
      toast({
        title: "Download Failed",
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
        variant: "destructive",
      });
    } finally {
      setDownloading(prev => ({ ...prev, [submissionId]: false }));
      setExtractingAudio(prev => ({ ...prev, [submissionId]: false }));
    }
  };

  const handleGenerateAnalysis = async (submissionId: string) => {
    try {
      console.log('[AdminSubmissions] Generating analysis for submission:', submissionId);
      const response = await apiService.generateAnalysis(submissionId);
      if (response.error) {
        toast({
          title: "Generation Failed",
          description: response.error,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Success",
          description: "Analysis generation started! Refresh in a few moments to see the results.",
          variant: "default",
        });
        // Refresh submissions to update status
        const list = await getSubmissions();
        setSubmissions(list as Submission[]);
        setFilteredSubmissions(list as Submission[]);
      }
    } catch (error) {
      console.error('[AdminSubmissions] Error generating analysis:', error);
      toast({
        title: "Error",
        description: "Failed to generate analysis. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleDownloadAnalysis = async (submissionId: string) => {
    try {
      console.log('[AdminSubmissions] Downloading analysis for submission:', submissionId);
      await apiService.downloadAnalysis(submissionId);
      toast({
        title: "Success",
        description: "Analysis report downloaded successfully",
        variant: "default",
      });
    } catch (error) {
      console.error('[AdminSubmissions] Error downloading analysis:', error);
      toast({
        title: "Download Failed",
        description: "Failed to download analysis. Please try again.",
        variant: "destructive",
      });
    }
  };


  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <ProtectedRoute allowedRoles={['superadmin', 'admin']}>
      <div className="min-h-screen bg-gray-50">
        <Header />
        
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center gap-4 mb-6">
            <Link href={basePath}>
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Dashboard
              </Button>
            </Link>
            <h1 className="text-2xl font-bold">Submission Management</h1>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSearch className="h-5 w-5" />
                Submission Library
              </CardTitle>
              <CardDescription>
                Manage and download candidate submissions
              </CardDescription>
            </CardHeader>
            
            <CardContent>
              {/* Search and Controls */}
              <div className="flex flex-col gap-4 mb-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <input
                      type="text"
                      placeholder="Search by ID, candidate name, or competency..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                  <div>
                    <CompetencySelect value={competencyFilter} onChange={setCompetencyFilter} placeholder="Filter by competencies" />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Label htmlFor="format">Download as:</Label>
                  <div className="flex items-center gap-4">
                    <Label className="flex items-center gap-2">
                      <Checkbox 
                        checked={downloadFormats.text}
                        onCheckedChange={(checked) => 
                          setDownloadFormats(prev => ({ ...prev, text: checked === true }))
                        }
                      />
                      <FileText className="h-4 w-4" />
                      Text Report
                    </Label>
                    <Label className="flex items-center gap-2">
                      <Checkbox 
                        checked={downloadFormats.video}
                        onCheckedChange={(checked) => 
                          setDownloadFormats(prev => ({ ...prev, video: checked === true }))
                        }
                      />
                      <Video className="h-4 w-4" />
                      Video
                    </Label>
                    <Label className="flex items-center gap-2">
                      <Checkbox 
                        checked={downloadFormats.audio}
                        onCheckedChange={(checked) => 
                          setDownloadFormats(prev => ({ ...prev, audio: checked === true }))
                        }
                      />
                      <Mic className="h-4 w-4" />
                      Audio
                    </Label>
                  </div>
                </div>
              </div>

              {/* Submissions Table */}
              {loadingSubmissions ? (
                <div className="text-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
                  <p>Loading submissions...</p>
                </div>
              ) : filteredSubmissions.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  {searchTerm ? 'No submissions match your search.' : 'No submissions found.'}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Submission ID</TableHead>
                      <TableHead>Candidate</TableHead>
                      <TableHead>Competencies</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSubmissions.map((submission) => (
                      <TableRow key={submission.id}>
                        <TableCell className="font-mono text-sm">
                          {submission.id}
                        </TableCell>
                        <TableCell>
                          {submission.candidateName || 'Anonymous'}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {submission.competencies?.map((comp, index) => (
                              <span 
                                key={index}
                                className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded"
                              >
                                {comp}
                              </span>
                            )) || <span className="text-gray-500">None</span>}
                          </div>
                        </TableCell>
                        <TableCell>
                          {submission.createdAt || (submission as any).date
                            ? new Date((submission.createdAt || (submission as any).date) as any).toLocaleDateString()
                            : 'Unknown'}
                        </TableCell>
                        <TableCell>
                          <span className={`px-2 py-1 text-xs rounded ${
                            (submission.status || '').toLowerCase() === 'completed'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {(submission.status || '').toLowerCase() === 'completed' ? 'Completed' : (submission.status || 'In Progress')}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Link href={`${basePath}/report/${submission.id}`}>
                              <Button variant="outline" size="sm">
                                <Eye className="h-4 w-4 mr-1" />
                                View
                              </Button>
                            </Link>
                            
                            <Button
                              variant="outline" 
                              size="sm"
                              onClick={() => handleDownload(submission)}
                              disabled={downloading[submission.id] || extractingAudio[submission.id]}
                            >
                              {downloading[submission.id] ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              ) : extractingAudio[submission.id] ? (
                                <Type className="h-4 w-4 mr-1" />
                              ) : (
                                <Download className="h-4 w-4 mr-1" />
                              )}
                              {extractingAudio[submission.id] ? 'Extracting...' : 'Media'}
                            </Button>

                            {(submission.status || '').toLowerCase() === 'completed' && !submission.report && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="border-orange-300 text-orange-700 hover:bg-orange-50"
                                onClick={() => handleGenerateAnalysis(submission.id)}
                              >
                                <FileText className="h-4 w-4 mr-1" />
                                Generate
                              </Button>
                            )}

                            {submission.report && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                                onClick={() => handleDownloadAnalysis(submission.id)}
                              >
                                <FileText className="h-4 w-4 mr-1" />
                                Analysis
                              </Button>
                            )}

                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="outline" size="sm">
                                  <Trash2 className="h-4 w-4 mr-1" />
                                  Delete
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Confirm Deletion</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to delete submission {submission.id}? 
                                    This action cannot be undone and will permanently remove all associated data.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction 
                                    onClick={() => handleDelete(submission.id)}
                                    className="bg-red-600 hover:bg-red-700"
                                  >
                                    Delete Permanently
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </ProtectedRoute>
  );
}