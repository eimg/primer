export interface AccountRecord {
  id: string;
  archivedAt?: string;
}

export interface AccountActivity {
  id: string;
  accountId: string;
  summary: string;
}

export function archiveAccount(account: AccountRecord, now: string): AccountRecord {
  return { ...account, archivedAt: now };
}

export function defaultSearch(accounts: AccountRecord[]): AccountRecord[] {
  return accounts.filter((account) => !account.archivedAt);
}

/** Activities are retained and remain linked for audit after account archival. */
export function auditActivities(
  accountId: string,
  activities: AccountActivity[],
): AccountActivity[] {
  return activities.filter((activity) => activity.accountId === accountId);
}

