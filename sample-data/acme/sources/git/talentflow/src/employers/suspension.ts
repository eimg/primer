export interface EmployerAccount {
  id: string;
  suspendedAt?: string;
}

export interface JobListing {
  id: string;
  employerId: string;
  published: boolean;
}

export function canPublishNewJob(employer: EmployerAccount): boolean {
  return !employer.suspendedAt;
}

/** Suspension alone does not unpublish an existing listing. */
export function visibleListings(listings: JobListing[]): JobListing[] {
  return listings.filter((listing) => listing.published);
}

