export const RESUME_URL_TTL_SECONDS = 300;

export interface ResumeUrlRequest {
  resumeId: string;
  employerTenantId: string;
}

export function signedResumePath(request: ResumeUrlRequest): string {
  return `/employers/${request.employerTenantId}/resumes/${request.resumeId}`;
}

